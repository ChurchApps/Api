export class ReminderOccurrence {
  public id?: string;
  public churchId?: string;
  public definitionId?: string;
  public entityType?: string;
  public entityId?: string;
  public category?: string; // denormalized from definition
  public message?: string; // denormalized from definition
  public occurrenceKey?: string; // definitionId:occurrenceLocalISO:offsetMin
  public occLocalISO?: string; // the occurrence's local civil datetime
  public fireAt?: Date; // UTC
  public status?: string; // pending|processing|sent|cancelled|failed
  public claimedAt?: Date;
  public attemptCount?: number;
  public sentAt?: Date;
  public recipientCount?: number;
  public lastError?: string;
}
