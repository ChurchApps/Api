export class Task {
  public id?: string;
  public churchId?: string;
  public taskType?: string;
  public taskNumber?: number;
  public dateCreated?: Date;
  public dateClosed?: Date;
  public associatedWithType?: string;
  public associatedWithId?: string;
  public associatedWithLabel?: string;
  public createdByType?: string;
  public createdById?: string;
  public createdByLabel?: string;
  public assignedToType?: string;
  public assignedToId?: string;
  public assignedToLabel?: string;
  public title?: string;
  public status?: string;
  public automationId?: string;
  public triggerId?: string;
  public conversationId?: string;
  public data?: string;
  // Card fields (a Task is a "card" when workflowId is set).
  public workflowId?: string;
  public stepId?: string;
  public dueDate?: Date;
  public snoozedUntil?: Date;
  public sort?: number;
  public pinnedAssignment?: boolean;
}
