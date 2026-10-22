// Runs once when the server starts, never during `next build`, so startup work
// that touches the database belongs here rather than at module scope.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Actions still pending were cut off by the restart; record them as unknown.
  const { recoverPendingTwilioActions } = await import("@/lib/twilio-activity");
  recoverPendingTwilioActions();
}
