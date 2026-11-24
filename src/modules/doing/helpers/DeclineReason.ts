// The optional reason a volunteer gives when declining: one line, at most the 255-char column.
export const cleanDeclineReason = (reason: unknown): string | null => {
  if (typeof reason !== "string") return null;
  const cleaned = reason.replace(/\s+/g, " ").trim().slice(0, 255);
  return cleaned || null;
};
