export class NotificationEntityMute {
  public id?: string;
  public churchId?: string;
  public personId?: string;
  public entityType?: string; // group|event|conversation|serviceTeam
  public entityId?: string;
  public level?: string; // all|mentions|muted
}
