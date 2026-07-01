export class ReminderSentLog {
  public id?: string;
  public churchId?: string;
  public occurrenceId?: string; // null for non-occurrence sources (serving)
  public entityType?: string; // source discriminator (event|plan|task) for the unified ledger
  public entityId?: string;
  public personId?: string;
  public channel?: string;
  public category?: string;
  public status?: string; // pending|sent|suppressed|deferred|failed
  public reason?: string;
  public idempotencyKey?: string; // sha256 of the source's per-recipient key
  public sentAt?: Date;
}
