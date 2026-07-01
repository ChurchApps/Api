export class NotificationPreferenceOverride {
  public id?: string;
  public churchId?: string;
  public personId?: string;
  public categoryKey?: string;
  public channel?: string; // push|email|in_app|sms
  public optedIn?: boolean; // true = opted in, false = opted out
  public updatedAt?: Date;
}
