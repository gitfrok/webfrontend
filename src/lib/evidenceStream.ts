// The evidence pack stream reader (T-0051, SPEC-0050 AC3, AC4, AC5).
//
// `GET /api/v1/audit/evidence-packs/{pack_id}` is the only read in this
// frontend where the HTTP status says nothing about success. The BFF writes
// 200 and `application/x-ndjson` on the FIRST chunk; a failure after that
// point returns, and the consumer sees a truncated body with a success status.
// So `response.ok` — the signal every other client in `bff.ts` uses — would
// report a half-assembled pack as a whole one.
//
// The only authority is `final_chunk: true` on the last chunk. Everything here
// is arranged so that "we did not see one" is the default answer and
// completeness has to be earned.

/** One chunk of the pack stream, as the BFF shapes it. */
export interface PackChunk {
  chunk_index: number;
  final_chunk: boolean;
  header?: Record<string, unknown>;
  section?: PackSection;
  appendix?: Record<string, unknown>;
}

export interface PackGap {
  from: string;
  to: string;
  reason: string;
}

export interface PackSection {
  type: string;
  complete: boolean;
  gaps: PackGap[];
  records: Record<string, unknown>[];
  records_digest: string;
  anchors?: {
    first_seq: number;
    last_seq: number;
    first_record_hash: string;
    last_record_hash: string;
    prev_record_hash: string;
  };
}

export interface PackStreamResult {
  chunks: PackChunk[];
  /** True unless a final chunk arrived as the last line of a 200 response. */
  truncated: boolean;
  /** True when any section is incomplete or names a gap. */
  degraded: boolean;
  /** True when the response never opened a stream at all. */
  refused: boolean;
}

/**
 * Ceilings. A pathological stream must not hold the SSR request open
 * indefinitely, and hitting either ceiling is reported as truncation — never
 * as a pack that happened to end.
 */
export const MAX_PACK_CHUNKS = 5_000;
export const MAX_PACK_BYTES = 32 << 20;

/**
 * Reads an NDJSON pack stream.
 *
 * Truncation is the default. It is cleared only when the last parsed line
 * carries `final_chunk: true` and no earlier line did — a final chunk in the
 * middle means the stream continued past what the backend called the end,
 * which is a stream we do not understand rather than a pack we can trust.
 */
export async function readPackStream(response: Response): Promise<PackStreamResult> {
  const result: PackStreamResult = { chunks: [], truncated: true, degraded: false, refused: false };

  if (!response.ok || !response.body) {
    result.refused = true;
    return result;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let bytes = 0;
  let hitCeiling = false;
  let finalSeenAt = -1;

  const takeLine = (line: string): boolean => {
    const trimmed = line.trim();
    if (!trimmed) return true;
    let chunk: PackChunk;
    try {
      chunk = JSON.parse(trimmed) as PackChunk;
    } catch {
      // A line that does not parse is where the stream stopped being a
      // stream. What was parsed before it stands; nothing after it exists.
      return false;
    }
    if (chunk.final_chunk) finalSeenAt = result.chunks.length;
    result.chunks.push(chunk);
    if (chunk.section && (!chunk.section.complete || (chunk.section.gaps?.length ?? 0) > 0)) {
      result.degraded = true;
    }
    return result.chunks.length < MAX_PACK_CHUNKS;
  };

  reading: while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_PACK_BYTES) {
      hitCeiling = true;
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf('\n');
    while (newline >= 0) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      if (!takeLine(line)) {
        hitCeiling = true;
        break reading;
      }
      newline = buffer.indexOf('\n');
    }
  }

  // A trailing fragment with no newline is a cut line: parse it if it happens
  // to be whole, and let takeLine's failure stand if it is not.
  if (!hitCeiling && buffer.trim()) {
    takeLine(buffer);
  }

  // Earned, not assumed: the last chunk we hold must be the one the backend
  // marked final, and no ceiling may have cut the read short.
  result.truncated = hitCeiling || finalSeenAt < 0 || finalSeenAt !== result.chunks.length - 1;
  return result;
}
