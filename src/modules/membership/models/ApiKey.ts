// A personal access token a church issues for connectors/scripts that can't
// run an OAuth dance. Only a SHA-256 hash of the secret is stored; the raw
// key (`cak_<prefix>.<secret>`) is shown exactly once on creation. The key
// acts as its `personId` — its effective permissions are that person's
// current RBAC permissions, intersected with `scopes`.
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
