export class OAuthRelaySession {
  public id?: string;
  public sessionCode?: string;
  public provider?: string;
  public authCode?: string;
  public redirectUri?: string;
  public status?: "pending" | "completed" | "expired";
  public expiresAt?: Date;
  public createdAt?: Date;
}
