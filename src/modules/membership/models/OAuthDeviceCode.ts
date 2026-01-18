export class OAuthDeviceCode {
  public id?: string;
  public deviceCode?: string;
  public userCode?: string;
  public clientId?: string;
  public scopes?: string;
  public expiresAt?: Date;
  public pollInterval?: number;
  public status?: "pending" | "approved" | "denied" | "expired";
  public approvedByUserId?: string;
  public userChurchId?: string;
  public churchId?: string;
  public createdAt?: Date;
}
