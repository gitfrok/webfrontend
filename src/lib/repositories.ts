// The repository list's copy (T-0055, SPEC-0052 AC11).
//
// The landing page is the one surface where an empty answer is read as a
// statement about the whole product. "You have no repositories" asserts
// absence, and this layer cannot support it: the listable set is derived from
// the caller's authorization, so an empty list means *nothing here is visible
// to you* — which is true whether the tenant is empty, the caller is scoped
// narrowly, or a repository exists on disk that the registry never learned
// about (ADR-0071 decision 2).
export const REPOSITORY_MESSAGES = {
  empty:
    'Nothing here is visible to you yet. That is not the same as nothing existing — this page shows only what your access covers, and it is not told what it is leaving out.',
  // Phrased to deny nothing rather than to deny absence. An earlier wording
  // said "this is not a statement that there are none" — true, and it failed
  // the AC11 enumeration on its own negation. The check is deliberately blunt
  // because a blunt check is the one that survives someone shortening the copy
  // later, so the copy avoids the phrase instead of the check excusing it.
  unavailable:
    'The repository list could not be read, so what your access covers is unknown here. Nothing on this page describes what the tenant holds.',
} as const;

export type RepositoryMessageKey = keyof typeof REPOSITORY_MESSAGES;
