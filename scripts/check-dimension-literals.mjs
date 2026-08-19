#!/usr/bin/env node
// T-0077 / SPEC-0060 AC3–AC5 — the gate that keeps geometry in the token layer.
//
// ADR-0069 made tokens the only source of COLOUR and the hex gate has held that
// line since T-0045. Spacing and type were never covered, and by the end of
// Phase 4 there were 347 dimensional literals across 32 files — 224 of them font
// sizes, in ten distinct sizes, against a single type token. Nothing was broken;
// nothing was consistent either, and a reader moving between pages saw the
// content column jump between three different widths.
//
// The literals accumulated WHILE tokens existed and were partly used, which is
// the whole argument for this file: the token layer is not the mechanism, the
// check is (ADR-0079, and ADR-0015's "enforced, not aspirational" before it).
//
// WHAT IT READS. Size, spacing, radius and type properties in the authored tree —
// src/pages, src/components, src/layouts. src/styles is exempt as a DIRECTORY, not
// as a file: the stylesheet is where dimensions are supposed to resolve, and
// exempting one filename would make a second stylesheet a reason to weaken the
// gate.
//
// WHAT IT DOES NOT READ. Anything structural that is not on a scale — a border
// width, a media-query breakpoint, `100%`, `100dvh`, `0`. A gate that fires on
// correct code gets deleted rather than fixed, which is the failure mode this
// project has already written down twice.
//
// The breakpoint exclusion is the one worth naming: `@media (min-width: 640px)`
// spells the same property as a component's min-width and means something else
// entirely — where the layout changes, not how big a thing is. Tokenizing
// breakpoints is a decision about responsive structure; this gate is about size,
// spacing, radius and type.
//
// Usage: node scripts/check-dimension-literals.mjs [rootDir]
// Exit 0 clean, 1 on any violation (file:line:match printed for each).

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const root = process.argv[2] ?? new URL('../src', import.meta.url).pathname;

/** Directories whose dimensions are the definitions themselves. */
const ALLOWED_DIRS = [`styles${sep}`];

// The ratchet, present and empty — the same shape the hex gate carries and for
// the same reason. T-0077 converts every file in one task, so there is nothing
// to list; the stale-entry check below makes the empty list self-enforcing,
// because anything added here must also be removed again.
const LEGACY = new Set([]);

/** Directories we do not author. */
const SKIP_DIRS = new Set(['gen', 'node_modules', '.astro']);

const SCANNED_EXT = /\.(astro|tsx|ts|jsx|js|css|svelte|vue|html)$/;

// The properties that carry geometry on a scale. Both spellings: CSS
// `font-size:` in a stylesheet and JSX `fontSize:` in a style object.
//
// Deliberately NOT here: border-width, outline-width, letter-spacing,
// text-underline-offset, and anything at 1–2 px optical range. Those are
// constants, not scale steps, and ADR-0079 predicted them as the first waivers —
// so they are excluded by construction instead, which is better than a waiver
// nobody reads.
const PROPS = [
  'font-size',
  'fontSize',
  'line-height',
  'lineHeight',
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'marginTop',
  'marginRight',
  'marginBottom',
  'marginLeft',
  'gap',
  'row-gap',
  'column-gap',
  'rowGap',
  'columnGap',
  'border-radius',
  'borderRadius',
  'max-width',
  'maxWidth',
  'min-width',
  'minWidth',
  'width',
  'height',
  'min-height',
  'minHeight',
  'max-height',
  'maxHeight',
  'flex-basis',
  'flexBasis',
];

// One property, then anything up to the value's terminator, then a number with a
// scale unit. `0` and percentage/viewport values pass: they are not scale steps.
const DIMENSION = new RegExp(
  `\\b(${PROPS.join('|')})\\s*:\\s*[^;,}\\n]*?\\b\\d+(?:\\.\\d+)?(px|rem|em)\\b`,
  'g',
);

/** Walk the tree, yielding every file we are responsible for. */
function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue;
      yield* walk(full);
    } else if (SCANNED_EXT.test(entry)) {
      yield full;
    }
  }
}

const violations = [];
const cleanedLegacy = [];
let waived = 0;
const waiverReasons = [];

for (const file of walk(root)) {
  const rel = relative(root, file);
  if (ALLOWED_DIRS.some((dir) => rel.startsWith(dir))) continue;
  const lines = readFileSync(file, 'utf8').split('\n');
  const found = [];
  lines.forEach((line, i) => {
    // A breakpoint is not a scale step. `@media (min-width: 640px)` spells the
    // same property as a component's min-width and means something else entirely:
    // it is where the layout changes, not how big a thing is. Tokenizing
    // breakpoints is a separate decision about responsive structure, and ADR-0079
    // decided about size, spacing, radius and type.
    if (/@media|@container|@supports/.test(line)) return;
    const matches = line.match(DIMENSION) ?? [];
    if (matches.length === 0) return;
    // An inline exemption must say why, on the same line, so the reason is
    // reviewable rather than assumed. A bare marker exempts NOTHING: the reason is
    // the whole point of the waiver, and a marker with no words after it is how a
    // gate gets silenced without anybody having to defend the silence.
    //
    // The comment terminators are stripped before the reason is judged, because
    // `gf-allow-dimension: */` would otherwise read as a reason of "*/".
    const marker = line.match(/gf-allow-dimension:(.*)$/);
    if (marker) {
      const reason = marker[1]
        .replace(/\*\/.*$/, '')
        .replace(/-->.*$/, '')
        .replace(/[}\s]+$/, '')
        .trim();
      if (/\w/.test(reason)) {
        waived += matches.length;
        waiverReasons.push(`${rel}:${i + 1}: ${reason}`);
        return;
      }
      // Falls through to the violation list: a marker without a reason is not an
      // exemption, and the file:line the gate prints is where the missing reason is.
    }
    for (const match of matches) {
      found.push(`${rel}:${i + 1}: ${match.trim()}`);
    }
  });
  if (LEGACY.has(rel)) {
    if (found.length === 0) cleanedLegacy.push(rel);
    continue;
  }
  violations.push(...found);
}

if (violations.length > 0) {
  console.error(
    `\nSPEC-0060 AC3 — ${violations.length} dimensional literal(s) outside the token layer:\n`,
  );
  for (const v of violations) console.error(`  ${v}`);
  console.error(
    '\nUse a token from src/styles/tokens.css — var(--gf-space-N) for spacing,\n' +
      'var(--gf-text-*) for type, var(--gf-radius-*) for corners, var(--gf-measure*)\n' +
      'for a content column. If a value is genuinely not on a scale, annotate the\n' +
      'line with `gf-allow-dimension: <reason>` — the reason is what a reviewer reads.\n',
  );
  process.exit(1);
}

if (cleanedLegacy.length > 0) {
  console.error(
    '\nSPEC-0060 AC3 — these files are clean but still listed as LEGACY in this script.\n' +
      'Remove them from the list so the ratchet keeps holding:\n',
  );
  for (const f of cleanedLegacy) console.error(`  ${f}`);
  process.exit(1);
}

// The waiver count is a deliverable, not a detail: ADR-0079's follow-up asks
// whether this gate should narrow to type and content width, and this number is
// the evidence for that decision. Printing it every run is what keeps it from
// being something someone has to go looking for.
if (waived > 0) {
  console.log(`dimension-literals: OK — ${waived} waived:`);
  for (const reason of waiverReasons) console.log(`  ${reason}`);
} else {
  console.log('dimension-literals: OK — every dimension in src/ resolves from a token, 0 waived');
}
