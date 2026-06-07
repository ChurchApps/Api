export class WorkflowTrigger {
  public id?: string;
  public churchId?: string;
  public name?: string;
  public eventType?: string;
  public workflowId?: string;
  public stepId?: string;
  public conditions?: string; // JSON FilterNode tree; null/"" = no filter
  public oncePerSubject?: boolean;
  public active?: boolean;
}
