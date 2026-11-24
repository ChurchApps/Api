// The optional reason a volunteer gives when declining: one line, at most the 255-char column.
export const cleanDeclineReason = (reason: unknown): string | null => {
  if (typeof reason !== "string") return null;
  const cleaned = reason.replace(/\s+/g, " ").trim().slice(0, 255);
  return cleaned || null;
};

// The email respond page posts a urlencoded form. On Lambda the body middleware leaves a
// non-JSON body as the raw string, so read the field from either shape.
export const formReason = (body: unknown): unknown => {
  if (typeof body === "string") return new URLSearchParams(body).get("reason");
  if (Buffer.isBuffer(body)) return new URLSearchParams(body.toString("utf8")).get("reason");
  return (body as { reason?: unknown } | null | undefined)?.reason;
};

// Plan assignment lists are readable by every church member; a decline reason is only for
// the volunteer who gave it and for plan editors.
export const redactDeclineReasons = <T extends { personId?: string; declineReason?: string | null }>(rows: T[], viewerPersonId: string | undefined, canSeeAll: boolean): T[] => {
  if (canSeeAll) return rows;
  return rows.map((row) => (row && row.declineReason && row.personId !== viewerPersonId ? { ...row, declineReason: null } : row));
};
