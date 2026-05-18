// A single delivery attempt record for a webhook event (durable outbox row)
export class WebhookDelivery {
  public id?: string;
  public churchId?: string;
  public webhookId?: string;
  public event?: string;
  public payload?: string;
  public status?: string; // pending | succeeded | failed | exhausted
  public attemptCount?: number;
  public responseStatus?: number;
  public responseBody?: string;
  public nextAttemptAt?: Date;
  public dateCreated?: Date;
  public dateCompleted?: Date;
}
