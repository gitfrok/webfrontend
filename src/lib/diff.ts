// Unified-patch parsing for the CVD-safe diff (T-0046, SPEC-0047 AC5,
// ADR-0069 decision 4).
//
// The point of this module is that add-vs-remove stops being a colour. A
// parsed line carries its kind, a text marker, and its old/new line numbers —
// three non-colour channels — so the renderer can tint for reinforcement
// rather than for meaning. Under a grayscale filter, a deutan simulation, or a
// terminal that dropped the stylesheet, the diff still reads.

/** The gutter marker for an added line. */
export const ADD_MARKER = '+';

/**
 * The gutter marker for a removed line: U+2212 MINUS SIGN, not the U+002D
 * hyphen the patch format uses. The hyphen is visually shorter than the plus
 * and sits low; the true minus matches the plus in width and optical centre,
 * so the two are distinguishable by SHAPE at a glance rather than by scanning.
 */
export const DEL_MARKER = '−';

export type DiffLineKind = 'add' | 'del' | 'context' | 'hunk' | 'meta';

export interface DiffLine {
  kind: DiffLineKind;
  /** The line's own text, with the patch's marker column removed. */
  content: string;
  /** '+', '−', or '' — the redundant channel that carries the meaning. */
  marker: string;
  /** Line number in the base revision; null on an added line. */
  oldLine: number | null;
  /** Line number in the new revision; null on a removed line. */
  newLine: number | null;
}

const HUNK = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/**
 * Parses a unified diff into typed lines.
 *
 * The `+++`/`---` file headers are deliberately classified as meta BEFORE the
 * add/del test: they begin with the same characters as changed lines, and
 * mistaking them is how a diff renderer ends up claiming a file header was
 * added. An empty patch yields no lines at all rather than one blank one.
 */
export function parsePatch(patch: string): DiffLine[] {
  if (patch === '') return [];

  const out: DiffLine[] = [];
  let oldNo = 0;
  let newNo = 0;

  for (const raw of patch.split('\n')) {
    // A trailing newline produces one empty final element; it is not a line.
    if (raw === '' && out.length > 0 && patch.endsWith('\n')) continue;

    const hunk = HUNK.exec(raw);
    if (hunk) {
      oldNo = Number(hunk[1]);
      newNo = Number(hunk[2]);
      out.push({ kind: 'hunk', content: raw, marker: '', oldLine: null, newLine: null });
      continue;
    }

    // Header lines first — `+++ b/file` and `--- a/file` are not changes.
    if (
      raw.startsWith('+++') ||
      raw.startsWith('---') ||
      raw.startsWith('diff --git ') ||
      raw.startsWith('index ') ||
      raw.startsWith('new file mode ') ||
      raw.startsWith('deleted file mode ') ||
      raw.startsWith('similarity index ') ||
      raw.startsWith('rename ') ||
      raw.startsWith('Binary files ') ||
      raw.startsWith('\\ No newline')
    ) {
      out.push({ kind: 'meta', content: raw, marker: '', oldLine: null, newLine: null });
      continue;
    }

    if (raw.startsWith('+')) {
      out.push({ kind: 'add', content: raw.slice(1), marker: ADD_MARKER, oldLine: null, newLine: newNo++ });
      continue;
    }
    if (raw.startsWith('-')) {
      out.push({ kind: 'del', content: raw.slice(1), marker: DEL_MARKER, oldLine: oldNo++, newLine: null });
      continue;
    }

    // Context. A conventional patch prefixes it with a space; a trailing blank
    // line inside a hunk arrives bare, and is context too.
    out.push({
      kind: 'context',
      content: raw.startsWith(' ') ? raw.slice(1) : raw,
      marker: '',
      oldLine: oldNo++,
      newLine: newNo++,
    });
  }

  return out;
}

/** Counts what changed, for the summary a reader sees before scrolling. */
export function countChanges(lines: DiffLine[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const line of lines) {
    if (line.kind === 'add') added++;
    else if (line.kind === 'del') removed++;
  }
  return { added, removed };
}
