# webfrontend PR

SoT & governance checklists: `../governance/docs/process/definition-of-done.md`.

## Web-specific gates
- [ ] **Calls only the BFF** — never `backend` directly (invariant 22).
- [ ] Tests first: Vitest units + Playwright E2E on the critical path.
- [ ] Uses generated TS types from `governance/contracts/`; Node ≥26 / TS ≥7 (ADR-0023).
- [ ] UX follows ADR-0015. Single submodule per change.
