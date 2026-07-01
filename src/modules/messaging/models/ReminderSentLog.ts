export class ReminderSentLog {
  public id?: string;
  public churchId?: string;
  public occurrenceId?: string;
  public personId?: string;
  public channel?: string;
  public category?: string;
  public status?: string; // pending|sent|suppressed|deferred|failed
  public reason?: string;
  public idempotencyKey?: string; // sha256(occurrenceId:personId)
  public sentAt?: Date;
}
