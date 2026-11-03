export class ScheduledNotification {
  public id?: string;
  public churchId?: string;
  public audience?: string; // group|church
  public groupId?: string;
  public title?: string;
  public message?: string;
  public link?: string;
  public imageUrl?: string;
  public sendAt?: Date; // UTC
  public timeZone?: string; // zone the admin picked the time in, for display
  public status?: string; // pending|processing|sent|cancelled|failed
  public claimedAt?: Date;
  public attemptCount?: number;
  public sentAt?: Date;
  public recipientCount?: number;
  public successCount?: number;
  public lastError?: string;
  public createdByPersonId?: string;
  public dateCreated?: Date;
  public dateModified?: Date;
}
