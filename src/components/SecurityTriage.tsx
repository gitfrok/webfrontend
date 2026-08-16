// SecurityTriage is the triage control for one finding row (T-0023, SPEC-0026
// AC3/AC4). Triage is a control action, not a UI preference: the decision is
// POSTed to the SSR proxy with the session's identity, the backend authorizes
// and audits it, and this component only renders what the server answered.
// It never infers why a decision failed — a refusal is one coarse message,
// the same for not-found, unauthorized and cross-tenant (SPEC-0001).
import { useId, useState } from 'react';

// The four decisions the contract names, with the labels a triager reads.
// No other state exists; clearing a decision is not a v1 operation.
const decisions = [
  { state: 'ACCEPT', label: 'Accept' },
  { state: 'FALSE_POSITIVE', label: 'False positive' },
  { state: 'FIX', label: 'Fix' },
  { state: 'DEFER', label: 'Defer' },
] as const;

interface Props {
  findingID: string;
  repositoryID: string;
}

export default function SecurityTriage({ findingID, repositoryID }: Props) {
  const [justification, setJustification] = useState('');
  const [busy, setBusy] = useState(false);
  const [recorded, setRecorded] = useState<{ state: string; version: number; actor_id: string } | null>(null);
  // expectedVersion follows the contract's version guard: 0 expects no record
  // at all; after a decision lands, the returned version becomes the guard
  // for the next one (SPEC-0027 AC1).
  const [expectedVersion, setExpectedVersion] = useState(0);
  const [error, setError] = useState(false);
  const labelID = useId();

  const decide = async (state: string) => {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      const response = await fetch('/api/security/triage', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ finding_id: findingID, state, justification, expected_version: expectedVersion }),
      });
      if (!response.ok) throw new Error('denied');
      const record = (await response.json()) as { state: string; version: number; actor_id: string };
      setRecorded(record);
      setExpectedVersion(record.version);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ padding: '12px 0 4px', borderTop: '1px solid var(--gf-line)', marginTop: 12 }}>
      <div id={labelID} style={{ fontSize: 12, color: 'var(--gf-ink-muted)', marginBottom: 6 }}>
        Record a triage decision for repository {repositoryID}. The decision is authorized, audited
        and attached to this finding's identity — it survives re-scans.
      </div>
      <textarea
        aria-labelledby={labelID}
        placeholder="Justification (recorded with the decision)"
        value={justification}
        maxLength={2000}
        onChange={(event) => setJustification(event.target.value)}
        style={{
          width: '100%',
          minHeight: 56,
          resize: 'vertical',
          padding: '6px 8px',
          fontSize: 13,
          border: '1px solid var(--gf-line)',
          borderRadius: 6,
          fontFamily: 'inherit',
          boxSizing: 'border-box',
        }}
      />
      <div role="group" aria-label="Triage decision" style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        {decisions.map((decision) => (
          <button
            key={decision.state}
            type="button"
            disabled={busy}
            onClick={() => decide(decision.state)}
            style={{
              padding: '4px 12px',
              fontSize: 13,
              border: '1px solid var(--gf-line)',
              borderRadius: 6,
              background: recorded?.state === decision.state ? 'var(--gf-diff-add-bg)' : 'var(--gf-soft)',
              color: 'var(--gf-ink)',
              cursor: busy ? 'default' : 'pointer',
              fontWeight: recorded?.state === decision.state ? 600 : 400,
            }}
          >
            {decision.label}
          </button>
        ))}
      </div>
      <div aria-live="polite" style={{ marginTop: 8, fontSize: 13 }}>
        {busy && <span style={{ color: 'var(--gf-ink-muted)' }}>Recording…</span>}
        {error && <span style={{ color: 'var(--gf-danger-ink)' }}>Triage unavailable. Check your session.</span>}
        {recorded && !busy && !error && (
          <span style={{ color: 'var(--gf-success-ink)' }}>
            Recorded: {recorded.state} (version {recorded.version}, by {recorded.actor_id}).
          </span>
        )}
      </div>
    </div>
  );
}
