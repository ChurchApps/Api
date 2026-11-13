// #1546: an optional approver reason, trimmed and capped, ends the requester's decision notification.
export function decisionMessage(base: string, reason?: string): string {
  const note = typeof reason === "string" ? reason.trim().slice(0, 500) : "";
  return note ? `${base}: ${note}` : `${base}.`;
}
