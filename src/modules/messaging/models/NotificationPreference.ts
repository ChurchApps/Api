export class NotificationPreference {
  public id?: string;
  public churchId?: string;
  public personId?: string;
  public allowPush?: boolean;
  public emailFrequency?: string;
  public masterMute?: boolean;
  public quietHoursStart?: string; // "HH:MM:SS", member-local; null = none
  public quietHoursEnd?: string;
  public timeZone?: string; // IANA; null = inherit church.timeZone
  public allowSms?: boolean;
  public maxPushPerDay?: number; // null = no cap
}
