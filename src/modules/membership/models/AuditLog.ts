export class AuditLog {
  public id?: string;
  public churchId?: string;
  public userId?: string;
  public category?: string;
  public action?: string;
  public entityType?: string;
  public entityId?: string;
  public details?: string;
  public ipAddress?: string;
  public created?: Date;
}
