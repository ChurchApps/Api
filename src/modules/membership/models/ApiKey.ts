export class ApiKey {
  public id?: string;
  public churchId?: string;
  public personId?: string;
  public userId?: string;
  public name?: string;
  public hashedKey?: string;
  public prefix?: string;
  public scopes?: string;
  public lastUsedAt?: Date;
  public expiresAt?: Date;
  public createdAt?: Date;
}
