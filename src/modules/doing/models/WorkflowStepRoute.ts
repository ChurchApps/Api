// trigger: onEnter | onComplete. kind: outcome | personMatch | always.
// targetStepId null = complete/close the card.
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
}
