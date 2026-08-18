// T-0051 / SPEC-0050 AC3, AC4, AC5 — the pack stream reader.
//
// This is the one read in the frontend where `response.ok` means nothing.
// `getPack` writes 200 and the content type on the FIRST chunk, so a failure
// after that point returns a truncated body with a success status. The only
// authority on completeness is `final_chunk: true` on the last chunk, and a
// pack that looks whole and is not is the worst thing this product can hand a
// SOC 2 auditor.
import { describe, it, expect } from 'vitest';
import { readPackStream, MAX_PACK_CHUNKS, MAX_PACK_BYTES } from '../src/lib/evidenceStream';

/** A Response carrying an NDJSON body, exactly as the BFF writes one. */
function ndjson(lines: unknown[], { final = true } = {}): Response {
  const chunks = lines.map((line, index) => ({
    chunk_index: index,
    final_chunk: final && index === lines.length - 1,
    ...(line as object),
  }));
  const body = chunks.map((c) => JSON.stringify(c)).join('\n') + '\n';
  return new Response(body, { status: 200, headers: { 'content-type': 'application/x-ndjson' } });
}

const header = { header: { pack_id: 'pack-1', range_from: '2026-07-01T00:00:00Z', range_to: '2026-08-01T00:00:00Z' } };
const section = (overrides = {}) => ({
  section: {
    type: 'APPROVALS', complete: true, gaps: [], records: [], records_digest: 'sha256:abc',
    anchors: { first_seq: 1, last_seq: 9, first_record_hash: 'h1', last_record_hash: 'h9', prev_record_hash: 'h0' },
    ...overrides,
  },
});

describe('SPEC-0050 AC3 — final_chunk is the only completeness signal', () => {
  it('reads a stream that ends with final_chunk as complete', async () => {
    const result = await readPackStream(ndjson([header, section()]));
    expect(result.truncated).toBe(false);
    expect(result.chunks.length).toBe(2);
  });

  it('reads a 200 OK stream with no final chunk as TRUNCATED', async () => {
    // The status is 200. A reader that trusted response.ok fails here, which
    // is the whole point of this test existing.
    const response = ndjson([header, section()], { final: false });
    expect(response.ok).toBe(true);
    const result = await readPackStream(response);
    expect(result.truncated).toBe(true);
  });

  it('reads an empty 200 body as truncated, not as an empty pack', async () => {
    const result = await readPackStream(new Response('', { status: 200 }));
    expect(result.truncated).toBe(true);
    expect(result.chunks.length).toBe(0);
  });

  it('reads a body whose last line is cut mid-JSON as truncated', async () => {
    const body = `${JSON.stringify({ chunk_index: 0, final_chunk: false, ...header })}\n{"chunk_index":1,"fin`;
    const result = await readPackStream(new Response(body, { status: 200 }));
    expect(result.truncated).toBe(true);
    // The chunks it did parse are kept — they are what there is to show.
    expect(result.chunks.length).toBe(1);
  });

  it('treats a non-200 as truncated rather than throwing away the distinction', async () => {
    const result = await readPackStream(new Response('', { status: 404 }));
    expect(result.truncated).toBe(true);
    expect(result.refused).toBe(true);
  });

  it('does not treat a final chunk in the MIDDLE as the end of a complete pack', async () => {
    // final_chunk on a non-last line means the stream continued past what the
    // backend called the end. That is not a complete pack; it is a stream we
    // do not understand.
    const body = [
      JSON.stringify({ chunk_index: 0, final_chunk: true, ...header }),
      JSON.stringify({ chunk_index: 1, final_chunk: false, ...section() }),
    ].join('\n') + '\n';
    const result = await readPackStream(new Response(body, { status: 200 }));
    expect(result.truncated).toBe(true);
  });
});

describe('SPEC-0050 non-functional — the reader is bounded', () => {
  it('stops at the chunk ceiling and reports truncation, never success', async () => {
    const lines = Array.from({ length: MAX_PACK_CHUNKS + 5 }, () => section());
    const result = await readPackStream(ndjson(lines));
    expect(result.truncated).toBe(true);
    expect(result.chunks.length).toBeLessThanOrEqual(MAX_PACK_CHUNKS);
  });

  it('stops at the byte ceiling and reports truncation', async () => {
    const fat = section({ records_digest: 'x'.repeat(MAX_PACK_BYTES) });
    const result = await readPackStream(ndjson([fat]));
    expect(result.truncated).toBe(true);
  });
});

describe('SPEC-0050 AC5 — a degraded section renders degraded', () => {
  it('reports a section that is not complete', async () => {
    const result = await readPackStream(ndjson([header, section({ complete: false })]));
    expect(result.truncated).toBe(false);
    expect(result.degraded).toBe(true);
  });

  it('reports a section that is complete but carries a gap', async () => {
    // Either field alone is enough. A pack whose section claims completeness
    // while naming a gap is not a complete section, whatever it claims.
    const gapped = section({ complete: true, gaps: [{ from: '2026-07-05T00:00:00Z', to: '2026-07-06T00:00:00Z', reason: 'RETENTION' }] });
    const result = await readPackStream(ndjson([header, gapped]));
    expect(result.degraded).toBe(true);
  });

  it('reports a wholly complete pack as not degraded', async () => {
    const result = await readPackStream(ndjson([header, section(), section({ type: 'SCAN_GATES' })]));
    expect(result.degraded).toBe(false);
  });
});
