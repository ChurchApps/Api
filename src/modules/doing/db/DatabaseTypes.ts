import type { Assignment, BlockoutDate, Condition, Conjunction, ContentProviderAuth, Plan, PlanItem, PlanItemTime, PlanType, Position, Task, Time, Workflow, WorkflowCategory, WorkflowStep, WorkflowStepRoute, WorkflowTrigger } from "../models/index.js";

export interface DoingDatabase {
  assignments: Assignment;
  blockoutDates: BlockoutDate;
  conditions: Omit<Condition, "matchingIds">;
  conjunctions: Omit<Conjunction, "conjunctions" | "conditions" | "matchingIds">;
  contentProviderAuths: ContentProviderAuth;
  workflowTriggers: WorkflowTrigger;
  plans: Plan;
  planItems: Omit<PlanItem, "children">;
  planItemTimes: PlanItemTime;
  planTypes: PlanType;
  positions: Position;
  tasks: Task;
  times: Time;
  workflows: Workflow;
  workflowCategories: WorkflowCategory;
  workflowSteps: WorkflowStep;
  workflowStepRoutes: WorkflowStepRoute;
}
