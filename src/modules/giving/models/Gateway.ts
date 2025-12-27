export class Gateway {
  public id?: string;
  public churchId?: string;
  public provider?: string;
  public publicKey?: string;
  public privateKey?: string;
  public webhookKey?: string;
  public productId?: string;
  public payFees?: boolean;
  public currency?: string;
  public settings?: Record<string, unknown> | null;
  public environment?: string | null;
  public createdAt?: Date;
  public updatedAt?: Date;
}
