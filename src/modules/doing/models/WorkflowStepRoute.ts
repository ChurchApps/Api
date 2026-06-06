// trigger: onEnter | onComplete. kind: outcome | personMatch | always.
// targetWorkflowId (onComplete only) hands off to another workflow; else targetStepId moves within; both null = close.
export class WorkflowStepRoute {
  public id?: string;
  public churchId?: string;
  public workflowId?: string;
  public stepId?: string;
  public sort?: number;
  public trigger?: string;
  public kind?: string;
  public label?: string;
  public targetStepId?: string;
  public targetWorkflowId?: string;
}
