export class GatewayPaymentMethod {
  public id?: string;
  public churchId?: string;
  public gatewayId?: string;
  public customerId?: string;
  public externalId?: string;
  public methodType?: string | null;
  public displayName?: string | null;
  public metadata?: Record<string, unknown> | null;
  public createdAt?: Date;
  public updatedAt?: Date;
}
