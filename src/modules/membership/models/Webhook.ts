// A third-party webhook subscription registered by a church
export class Webhook {
  public id?: string;
  public churchId?: string;
  public name?: string;
  public url?: string;
  public secret?: string;
  public events?: string[];
  public active?: boolean;
  // How the outbound delivery body is formatted: "standard" | "slack" | "discord".
  public connectorType?: string;
  public consecutiveFailures?: number;
  public createdBy?: string;
  public dateCreated?: Date;
  public dateModified?: Date;
}
