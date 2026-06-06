import type { Action, Assignment, Automation, BlockoutDate, Condition, Conjunction, ContentProviderAuth, FormWorkflowTrigger, Plan, PlanItem, PlanItemTime, PlanType, Position, Task, Time, Workflow, WorkflowCategory, WorkflowStep, WorkflowStepRoute } from "../models/index.js";

export interface DoingDatabase {
  actions: Action;
  assignments: Assignment;
  automations: Automation;
  blockoutDates: BlockoutDate;
  conditions: Omit<Condition, "matchingIds">;
  conjunctions: Omit<Conjunction, "conjunctions" | "conditions" | "matchingIds">;
  contentProviderAuths: ContentProviderAuth;
  formWorkflowTriggers: FormWorkflowTrigger;
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
