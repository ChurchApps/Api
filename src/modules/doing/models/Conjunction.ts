import { Condition } from "./Condition.js";

export class Conjunction {
  public id?: string;
  public churchId?: string;
  public automationId?: string;
  // Set when this conjunction tree belongs to a WorkflowStepRoute instead of an Automation.
  public stepRouteId?: string;
  public parentId?: string;
  public groupType?: string;

  public conjunctions: Conjunction[] = [];
  public conditions: Condition[] = [];
  public matchingIds?: string[];
}
