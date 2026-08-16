#!/usr/bin/env node
// T-0045 / SPEC-0047 AC2 — the gate that makes the token layer stick.
//
// ADR-0015 asked for a design system "enforced, not aspirational" in July 2026
// and got a restatement instead: two years later every colour in src/ was a hex
// literal inline in the component that used it. The difference between a rule
// and a habit is a check that fails the build, so this is that check.
//
// It reads src/** and refuses any hex colour outside the one file allowed to
// hold them. Generated code is exempt — we do not own its formatting — and so
// is the token file itself, which is where the literals are supposed to live.
//
// Usage: node scripts/check-hex-literals.mjs [rootDir]
// Exit 0 clean, 1 on any violation (file:line:match printed for each).

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const root = process.argv[2] ?? new URL('../src', import.meta.url).pathname;

/** Files that may legitimately contain a colour literal. */
const ALLOWED = [
  `styles${sep}tokens.css`, // the token definitions themselves
];

// The ratchet. Phase 3.5 converts the product one task at a time, so these
// files still hold pre-ADR-0069 literals and are allowed to — for now. The
// gate's job today is that NO NEW file joins them, and the list shrinks to
// empty as T-0046..T-0048 land. A file that has been cleaned but is still
// listed also fails: a stale exemption is how a ratchet quietly stops being
// one.
const LEGACY = new Set([
  `components${sep}CommandPalette.tsx`,
  `components${sep}ImportedHistory.astro`,
  `components${sep}MRDiffFindings.astro`,
  `components${sep}MRFindings.astro`,
  `components${sep}SecurityFindings.astro`,
  `components${sep}SecurityTriage.tsx`,
  `components${sep}UsageView.astro`,
  `pages${sep}index.astro`,
  `pages${sep}repos${sep}[repositoryID]${sep}diff${sep}[revision].astro`,
  `pages${sep}repos${sep}[repositoryID]${sep}file${sep}[revision]${sep}[...path].astro`,
  `pages${sep}repos${sep}[repositoryID]${sep}merge_requests${sep}[mergeRequestID].astro`,
  `pages${sep}repos${sep}[repositoryID]${sep}raw${sep}[revision]${sep}[...path].astro`,
  `pages${sep}repos${sep}[repositoryID]${sep}tree${sep}[revision]${sep}[...path].astro`,
  `pages${sep}security${sep}index.astro`,
  `pages${sep}usage${sep}index.astro`,
]);

/** Directories we do not author. */
const SKIP_DIRS = new Set(['gen', 'node_modules', '.astro']);

const SCANNED_EXT = /\.(astro|tsx|ts|jsx|js|css|svelte|vue|html)$/;

// #rgb, #rrggbb, #rrggbbaa — word-bounded so a git SHA in prose does not trip
// it and an id="#..." selector does.
const HEX = /#[0-9a-fA-F]{3}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{8}\b/g;

/** Walk src/, yielding every file we are responsible for. */
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
for (const file of walk(root)) {
  const rel = relative(root, file);
  if (ALLOWED.some((a) => rel.endsWith(a))) continue;
  const lines = readFileSync(file, 'utf8').split('\n');
  const found = [];
  lines.forEach((line, i) => {
    // An inline exemption must say why, in the same line, so the reason is
    // reviewable rather than assumed.
    if (line.includes('gf-allow-hex:')) return;
    for (const match of line.match(HEX) ?? []) {
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
    `\nSPEC-0047 AC2 — ${violations.length} hex colour literal(s) outside the token layer:\n`,
  );
  for (const v of violations) console.error(`  ${v}`);
  console.error(
    '\nUse a token from src/styles/tokens.css (var(--gf-...)). If a literal is genuinely\n' +
      'unavoidable, add it to the token file — or annotate the line with `gf-allow-hex: <reason>`.\n',
  );
  process.exit(1);
}

if (cleanedLegacy.length > 0) {
  console.error(
    '\nSPEC-0047 AC2 — these files are clean but still listed as LEGACY in this script.\n' +
      'Remove them from the list so the ratchet keeps holding:\n',
  );
  for (const f of cleanedLegacy) console.error(`  ${f}`);
  process.exit(1);
}

const remaining = LEGACY.size;
console.log(
  remaining === 0
    ? 'hex-literals: OK — every colour in src/ resolves from a token'
    : `hex-literals: OK — no new violations; ${remaining} file(s) still carrying pre-ADR-0069 literals (T-0046..T-0048)`,
);
