export class WorkflowStep {
  public id?: string;
  public churchId?: string;
  public workflowId?: string;
  public name?: string;
  public sort?: number;
  public stepType?: string; // "human" (default) | "action"
  public defaultAssignToType?: string;
  public defaultAssignToId?: string;
  public defaultAssignToLabel?: string;
  public expectedResponseDays?: number;
}
