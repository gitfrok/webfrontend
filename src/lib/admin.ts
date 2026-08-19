// The admin area (T-0073, SPEC-0058, ADR-0077's accepted increment).
//
// Two rules live here.
//
// **The report has an age.** The data plane's connection is outbound-only
// (ADR-0011), so what the control plane holds is what each plane last said. A
// panel that renders a status without saying when the plane said it presents a
// report as a console. So the age is computed here and rendered beside every
// row, and a plane that has never connected has no age at all rather than a
// misleading one.
//
// **The audit log is not a page.** PR-31 asks that an administrator can read the
// audit log without gaining repository read access — which is what SPEC-0033's
// scoped, time-boxed, revocable grants already do. This surface links into that
// flow and holds no trail: an unbounded browser behind an "administrator" would
// make the grant machinery decorative (ADR-0077 decision 1).
import type { StatusKey } from './status';

export const ADMIN_MESSAGES = {
  reportIsAReport:
    'This is what each data plane last reported, not a live view. The data plane connects outbound to the control plane and sends what it knows; nothing here reaches into a customer cluster to ask.',
  noRunnerConsole:
    'The CI runners inside a data plane are not visible from here. What the control plane knows is that the plane was reachable and what version it was running, which is why this page reports planes rather than runners.',
  auditIsAGrant:
    'Audit access is issued as a grant: scoped to what an auditor needs, bounded in time, revocable, and itself recorded. There is no audit log to browse on this page, and that is deliberate — a role that could read the whole trail would make the grant it replaces pointless.',
  noMembers:
    'Members and roles are not shown here. Roles are held by the identity provider, and this product has no read of the org’s membership — so this page does not imply one by showing an empty table.',
  unavailable:
    'The fleet report could not be read. Nothing on this page describes what any data plane is doing.',
  emptyFleet:
    'No data planes are enrolled for this tenant, and none has been provisioned. That is different from the report being unavailable: this answer came from the control plane.',
  neverConnected:
    'Provisioned, but no data plane has connected against this enrolment token yet. There has been no contact, so there is nothing to date.',
} as const;

export type AdminMessageKey = keyof typeof ADMIN_MESSAGES;

/** The plane statuses this surface renders, mapped onto the status vocabulary. */
export function planeStatusKey(status: string): StatusKey {
  switch (status) {
    case 'CONNECTED':
      return 'PLANE_CONNECTED';
    case 'STALE':
      return 'PLANE_STALE';
    case 'REVOKED':
      return 'PLANE_REVOKED';
    case 'NEVER_CONNECTED':
      return 'PLANE_NEVER_CONNECTED';
    default:
      // An unknown status is rendered as unknown rather than as one of the four.
      // The wire's status is an open string so a new state is additive; a reader
      // can therefore meet one, and it must read as "we do not know what this
      // is", never as connected.
      return 'PLANE_UNKNOWN';
  }
}

/**
 * How long ago the control plane last heard from a plane, in words.
 *
 * `null` means there is nothing to measure — no contact has happened. That is a
 * different statement from "a long time ago", and the two must not collapse: a
 * plane provisioned an hour ago and never connected is not a plane that went
 * quiet an hour ago.
 *
 * `now` is a parameter rather than a call to the clock so the rendering is
 * testable and so a page renders one instant for every row.
 */
export function ageOf(lastSeenAt: string, now: Date): string | null {
  if (!lastSeenAt) return null;
  const seen = new Date(lastSeenAt);
  if (Number.isNaN(seen.getTime())) return null;
  const seconds = Math.floor((now.getTime() - seen.getTime()) / 1000);
  if (seconds < 0) return 'just now';
  if (seconds < 90) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 90) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/**
 * What a row's age line says, including when there is no age.
 *
 * Every row says something about contact, because a blank cell reads as an
 * oversight and a reader fills it in with an assumption.
 */
export function contactLine(lastSeenAt: string, now: Date): string {
  const age = ageOf(lastSeenAt, now);
  return age === null ? 'no contact yet' : `last reported ${age}`;
}
