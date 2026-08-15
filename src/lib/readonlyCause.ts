// Read-only cause distinction (T-0044, SPEC-0046 AC4). Every read-only
// state a surface renders names its CAUSE — the PR-7 durability mode
// (ADR-0018: dual loss, audited override) or an envelope-throttle effect.
// The cause labels are CONTRACT vocabulary mirrored from the backend
// (repository/api/readonly.go); this module maps them onto reader prose and
// refuses to render a bare "read-only": an unnamed or unknown cause yields
// no label at all. Commercial envelope states never appear here — nothing
// maps them onto a read-only condition (SPEC-0041 AC8).

export type ReadOnlyCause = 'durability_mode' | 'envelope_throttle';

// ReadOnlyState is the wire shape of one repository's read-only condition:
// read-only with a named cause, or writable (no cause).
export interface ReadOnlyState {
  readonly: boolean;
  cause?: ReadOnlyCause;
}

// ReadOnlyDescription is the reader prose one surface renders for a
// read-only condition. The label names the cause FIRST; the detail states
// what still works and how the condition ends.
export interface ReadOnlyDescription {
  label: string;
  detail: string;
}

// describeReadOnly renders the distinction. A writable condition, or a
// read-only condition whose cause is absent or unknown, yields null: this
// surface will not show a bare "read-only".
export function describeReadOnly(state: ReadOnlyState | undefined): ReadOnlyDescription | null {
  if (!state || !state.readonly) return null;
  switch (state.cause) {
    case 'durability_mode':
      return {
        label: 'Read-only — durability protection',
        detail:
          'This repository lost its write-durability guarantee (both copies at once). ' +
          'Reads keep working; writes are held to protect your data. ' +
          'A platform operator restores writing with an audited override.',
      };
    case 'envelope_throttle':
      return {
        label: 'Read-only — fair-use throttle',
        detail:
          'A fair-use envelope throttle is limiting writes on this repository. ' +
          'Reads and git fetch keep working; the throttle lifts once usage is back inside the envelope.',
      };
    default:
      return null;
  }
}

// readOnlyFromEnvelopeState is the commercial prohibition made visible
// (SPEC-0041 AC8, SPEC-0046 AC4): no envelope state — WITHIN, NEAR or
// EXCEEDED — ever yields a read-only condition. The function exists so a
// future surface cannot invent a mapping the contract forbids.
export function readOnlyFromEnvelopeState(state: string | undefined): ReadOnlyState {
  void state;
  return { readonly: false };
}
