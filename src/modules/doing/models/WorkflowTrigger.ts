export class WorkflowTrigger {
  public id?: string;
  public churchId?: string;
  public name?: string;
  public triggerKind?: string; // "event" (push, eventType) | "schedule" (pull, recurs + condition tree)
  public eventType?: string; // event rules only
  public recurs?: string; // schedule rules only: yearly | monthly | weekly | daily | (other = no repeat)
  public workflowId?: string;
  public stepId?: string;
  public conditions?: string; // event rules: JSON FilterNode tree. schedule rules: relational tree via conjunctions.triggerId
  public oncePerSubject?: boolean;
  public active?: boolean;
}
