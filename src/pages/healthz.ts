// Health endpoint for the webfrontend Deployment's liveness/readiness probes.
// It proves the SSR server is up; it deliberately does not touch the BFF, so a
// BFF outage reads as a degraded web app, not a dead pod being restarted into
// the same outage.
export const GET = () => new Response('ok', { status: 200 });
