// The mark-read relay (SPEC-0063 AC6). One POST marks ONE notification read
// for the session's caller and lands back on the list with an outcome word;
// an unknown or foreign ID is the same coarse refusal as everything else not
// the caller's own.
export const prerender = false;

export async function POST({ request, params }: { request: Request; params: { notificationID: string } }) {
  const { markNotificationRead } = await import('../../../../lib/bff');
  try {
    await markNotificationRead(request, params.notificationID);
  } catch {
    return Response.redirect(
      new URL('/notifications?notification_outcome=mark-failed', request.url).toString(),
      303,
    );
  }
  return Response.redirect(new URL('/notifications?notification_outcome=marked', request.url).toString(), 303);
}
