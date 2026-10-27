export class UserMfa {
  public userId?: string;
  public secret?: string;
  public enabled?: boolean;
  public backupCodes?: string;
  public lastUsedStep?: number;
  public dateEnabled?: Date;
}
