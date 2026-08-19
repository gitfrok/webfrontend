// The page column's vocabulary (T-0077, SPEC-0060 AC6, ADR-0079 decision 3).
//
// A page asks for a NAME, never a number. That is the whole mechanism: three
// content widths appeared across seventeen surfaces because every page could
// declare one, and a name cannot be invented at a call site.

/** How wide a page's content column is allowed to be. */
export type PageMeasure = 'prose' | 'wide' | 'full';

/**
 * The token each measure resolves to.
 *
 * `prose` is the default and the answer for almost everything. `wide` exists for
 * surfaces whose content is a table — pipelines, the fleet report — where a
 * narrower column costs a reader columns rather than gaining them focus.
 *
 * `full` is for the code surfaces: a diff, a tree, a file. They were full-bleed
 * before the shell existed, and putting them in a column would be the visual
 * redesign ADR-0079 said it was not doing. They compose the shell anyway, so
 * geometry has one owner even where the answer is "all of it".
 */
export function measureFor(measure: PageMeasure): string {
  if (measure === 'wide') return 'var(--gf-measure-wide)';
  if (measure === 'full') return 'var(--gf-measure-full)';
  return 'var(--gf-measure)';
}
