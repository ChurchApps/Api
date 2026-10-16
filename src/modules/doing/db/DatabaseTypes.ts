import type { Assignment, AutomationExecution, BlockoutDate, Condition, Conjunction, ContentProviderAuth, Plan, PlanItem, PlanItemTime, PlanTemplate, PlanType, Playlist, Position, ScheduleEntry, SchedulingPreference, ScreenGroup, Task, Time, Workflow, WorkflowCategory, WorkflowStep, WorkflowStepAction, WorkflowStepRoute, WorkflowTrigger } from "../models/index.js";

export interface DoingDatabase {
  assignments: Assignment;
  automationExecutions: AutomationExecution;
  blockoutDates: BlockoutDate;
  conditions: Omit<Condition, "matchingIds">;
  conjunctions: Omit<Conjunction, "conjunctions" | "conditions" | "matchingIds">;
  contentProviderAuths: ContentProviderAuth;
  workflowTriggers: WorkflowTrigger;
  plans: Plan;
  planItems: Omit<PlanItem, "children">;
  planItemTimes: PlanItemTime;
  planTemplates: PlanTemplate;
  planTypes: PlanType;
  playlists: Omit<Playlist, "items"> & { items: string };
  positions: Position;
  scheduleEntries: Omit<ScheduleEntry, "exceptionDates"> & { exceptionDates: string };
  schedulingPreferences: SchedulingPreference;
  screenGroups: ScreenGroup;
  tasks: Task;
  times: Time;
  workflows: Workflow;
  workflowCategories: WorkflowCategory;
  workflowSteps: WorkflowStep;
  workflowStepActions: WorkflowStepAction;
  workflowStepRoutes: WorkflowStepRoute;
}
