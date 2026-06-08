// One automated action on an action step. actionType ∈
// sendEmail | delay | addToGroup | addToWorkflow | addNote | setField | webhook.
// config is a JSON string of the per-action params (e.g. {"days":3}, {"templateId":"..."}).
export class WorkflowStepAction {
  public id?: string;
  public churchId?: string;
  public stepId?: string;
  public sort?: number;
  public actionType?: string;
  public config?: string;
}
