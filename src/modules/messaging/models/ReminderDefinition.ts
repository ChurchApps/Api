export class ReminderDefinition {
  public id?: string;
  public churchId?: string;
  public entityType?: string; // event|plan|task
  public entityId?: string; // specific entity; null = applies via scope
  public scopeId?: string; // e.g. planTypeId for serving inheritance
  public category?: string;
  public offsets?: string; // CSV minutes-before: "1440,60"
  public sendLocalTime?: string; // "HH:MM:SS" clock time to fire, in timeZone
  public timeZone?: string; // IANA; null = inherit church.timeZone
  public message?: string;
  public channels?: string; // CSV: "push,email,in_app"
  public recipientMode?: string; // auto|registrants|group|registrantsHoh|assignments|assignee
  public enabled?: boolean;
  public dateCreated?: Date;
  public dateModified?: Date;
}
