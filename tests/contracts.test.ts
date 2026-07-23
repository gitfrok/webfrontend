import { describe, it, expect } from 'vitest';
import { create } from '@bufbuild/protobuf';
import { RepositoryCreatedSchema } from '../src/gen/events/repository/v1/events_pb.js';

// Contract test (T-0001): the TS types generated from governance/contracts must be usable
// in the webfrontend. This proves the buf TS codegen path end-to-end without reaching
// backend directly (invariant 22 — the frontend only ever holds generated types + BFF calls).
describe('generated repository event types', () => {
  it('constructs a RepositoryCreated message from the contract schema', () => {
    const msg = create(RepositoryCreatedSchema, {
      eventId: '01J',
      tenantId: 't1',
      repoId: 'r1',
      createdBy: 'u1',
    });
    expect(msg.tenantId).toBe('t1');
    expect(msg.repoId).toBe('r1');
  });
});
