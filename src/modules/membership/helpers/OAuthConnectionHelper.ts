export interface OAuthConnection {
  id: string;
  clientId: string;
  clientName: string;
  scopes: string;
  createdAt: Date;
  expiresAt: Date;
}

// Shapes raw oAuthToken+client rows (from OAuthTokenRepo.loadForUser) into the
// Connected Apps list. Tokens whose refresh window has already lapsed are
// dropped — `OAuthTokenRepo.deleteExpired` only runs on a timer, so expired
// rows can linger and should never show as live connections.
export function toConnections(rows: any[], now: Date = new Date()): OAuthConnection[] {
  return (rows || [])
    .filter((r) => !r.expiresAt || new Date(r.expiresAt) > now)
    .map((r) => ({
      id: r.id,
      clientId: r.clientId,
      clientName: r.clientName || r.clientId,
      scopes: r.scopes || "",
      createdAt: r.createdAt,
      expiresAt: r.expiresAt
    }));
}
