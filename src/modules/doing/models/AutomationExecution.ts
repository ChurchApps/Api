export class AutomationExecution {
  public id?: string;
  public churchId?: string;
  public triggerId?: string;
  public workflowId?: string;
  public subjectType?: string;
  public subjectId?: string;
  public subjectLabel?: string;
  public eventType?: string; // originating event, or "schedule" / "runNow"
  public status?: string; // pending | success | failed | paused
  public attemptCount?: number;
  public nextAttemptAt?: Date;
  public lastError?: string;
  public dateCreated?: Date;
  public dateCompleted?: Date;
}
