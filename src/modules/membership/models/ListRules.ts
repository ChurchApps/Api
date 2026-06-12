// The saved-filter rules tree (roadmap 1.15/2.1). Conditions are provider-scoped so
// each module can answer "which people match" against its own database — nothing here
// assumes the people table. Date windows are either fixed (from/to) or relative
// (daysAgo), so "in the last N days" stays live instead of freezing at save time.
export interface ListRuleCondition {
  provider: "person" | "group" | "form" | "giving" | "attendance" | "serving" | "list";
  field?: string;
  operator?: string;
  value?: string;
  // groupId / questionId or formId / fundId / campus-service-serviceTime-group id / listId
  entityId?: string;
  // attendance scoping: campus | service | serviceTime | group
  entityType?: string;
  daysAgo?: number;
  from?: string;
  to?: string;
}

export interface ListRuleGroup {
  match: "all" | "any" | "none";
  conditions?: ListRuleCondition[];
  groups?: ListRuleGroup[];
}

// Executed for people newly added to an auto-refresh list.
export interface ListAction {
  type: "addToGroup" | "addToWorkflow" | "setField";
  groupId?: string;
  workflowId?: string;
  field?: string;
  value?: string;
}
