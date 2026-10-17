export class OAuthRelaySession {
  public id?: string;
  public sessionCode?: string;
  public provider?: string;
  public authCode?: string | null;
  public redirectUri?: string;
  // S256 PKCE challenge the device used in the authorize URL. Required before a server-side exchange.
  public codeChallenge?: string | null;
  public status?: "pending" | "completed" | "expired";
  public expiresAt?: Date;
  public createdAt?: Date;
}
