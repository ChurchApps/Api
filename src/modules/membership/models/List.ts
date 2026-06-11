import { ListAction, ListRuleGroup } from "./ListRules.js";

export class List {
  public id?: string;
  public churchId?: string;
  public createdByPersonId?: string;
  public name?: string;
  public category?: string;
  // Populated by loadAll via a join for display in the picker; not a stored column.
  public createdByPersonName?: string;
  // Legacy: the UI's activeFilters blob, kept so the advanced panel can be re-seeded
  // for editing. New saves also store `rules`, which is what the server evaluates.
  public conditions?: any;
  // The provider-scoped rules tree — the canonical, server-evaluable query.
  public rules?: ListRuleGroup;
  // "private" (creator only) or "org" (everyone with People.View). roleId reserved
  // for role-scoped sharing.
  public scope?: string;
  public roleId?: string;
  public autoRefresh?: boolean;
  // "none" | "children" | "household" — expand matches across the household.
  public householdInclusion?: string;
  public notifyOnChange?: boolean;
  public actions?: ListAction[];
}
