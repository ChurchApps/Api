export interface OAuthConnection {
  id: string;
  clientId: string;
  clientName: string;
  scopes: string;
  createdAt: Date;
  expiresAt: Date;
}

// Expired rows can linger in the DB; filter them out as `deleteExpired` only runs on timer.
// Rotated rows kept for the refresh grace window are the same connection as their replacement, so hide them too.
export function toConnections(rows: any[], now: Date = new Date()): OAuthConnection[] {
  return (rows || [])
    .filter((r) => (!r.expiresAt || new Date(r.expiresAt) > now) && !r.replacedById)
    .map((r) => ({
      id: r.id,
      clientId: r.clientId,
      clientName: r.clientName || r.clientId,
      scopes: r.scopes || "",
      createdAt: r.createdAt,
      expiresAt: r.expiresAt
    }));
}
