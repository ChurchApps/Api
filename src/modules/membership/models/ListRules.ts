export interface ListRuleCondition {
  provider: "person" | "group" | "form" | "field" | "giving" | "attendance" | "serving" | "list";
  field?: string;
  operator?: string;
  value?: string;
  entityId?: string;
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

export interface ListAction {
  type: "addToGroup" | "addToWorkflow" | "setField";
  groupId?: string;
  workflowId?: string;
  field?: string;
  value?: string;
}
