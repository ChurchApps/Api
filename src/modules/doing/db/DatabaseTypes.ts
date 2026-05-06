import type { Action, Assignment, Automation, BlockoutDate, Condition, Conjunction, ContentProviderAuth, Plan, PlanItem, PlanItemTime, PlanType, Position, Task, Time } from "../models/index.js";

export interface DoingDatabase {
  actions: Action;
  assignments: Assignment;
  automations: Automation;
  blockoutDates: BlockoutDate;
  conditions: Omit<Condition, "matchingIds">;
  conjunctions: Omit<Conjunction, "conjunctions" | "conditions" | "matchingIds">;
  contentProviderAuths: ContentProviderAuth;
  plans: Plan;
  planItems: Omit<PlanItem, "children">;
  planItemTimes: PlanItemTime;
  planTypes: PlanType;
  positions: Position;
  tasks: Task;
  times: Time;
}
