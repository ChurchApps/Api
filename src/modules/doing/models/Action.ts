export class Action {
  public id?: string;
  public churchId?: string;
  public automationId?: string;
  // Set when an action belongs to a WorkflowStep (on-enter action) instead of an Automation.
  public stepId?: string;
  public actionType?: string;
  public actionData?: string;
}
