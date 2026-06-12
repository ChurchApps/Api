import { List, ListRuleCondition, ListRuleGroup, SearchCondition } from "../models/index.js";
import { Repos } from "../repositories/index.js";
import { getAttendanceModuleGateway, getGivingModuleGateway } from "../../../shared/modules/index.js";
import { PersonConditionHelper } from "./PersonConditionHelper.js";

interface EvalContext {
  churchId: string;
  repos: Repos;
  peopleRows?: any[];
  visitedListIds: Set<string>;
}

// Evaluates a list's rules tree to person ids. Each condition is answered by its
// owning module (provider) so cross-product rules stay live; groups combine child
// results with all/any/none set logic.
export class ListRuleHelper {
  public static async getPeopleIds(churchId: string, list: List, repos: Repos): Promise<string[]> {
    if (!list.rules) return [];
    const visited = new Set<string>();
    if (list.id) visited.add(list.id);
    return this.evaluate(churchId, list.rules, list.householdInclusion, repos, visited);
  }

  public static async evaluate(churchId: string, rules: ListRuleGroup, householdInclusion: string | undefined, repos: Repos, visitedListIds?: Set<string>): Promise<string[]> {
    const ctx: EvalContext = { churchId, repos, visitedListIds: visitedListIds ?? new Set<string>() };
    let ids = await this.evaluateGroup(rules, ctx);
    ids = await this.expandHousehold(ids, householdInclusion, ctx);
    return Array.from(ids);
  }

  private static async evaluateGroup(group: ListRuleGroup, ctx: EvalContext): Promise<Set<string>> {
    const childResults: Set<string>[] = [];
    for (const c of group.conditions ?? []) childResults.push(await this.evaluateCondition(c, ctx));
    for (const g of group.groups ?? []) childResults.push(await this.evaluateGroup(g, ctx));

    const match = group.match ?? "all";
    if (match === "any") return this.union(childResults);
    if (match === "none") {
      const excluded = this.union(childResults);
      const all = await this.getAllPeopleIds(ctx);
      return new Set(Array.from(all).filter((id) => !excluded.has(id)));
    }
    // "all": an empty group matches nobody — safer than everybody for auto-actions.
    if (childResults.length === 0) return new Set();
    return childResults.reduce((acc, set) => new Set(Array.from(acc).filter((id) => set.has(id))));
  }

  private static async evaluateCondition(c: ListRuleCondition, ctx: EvalContext): Promise<Set<string>> {
    switch (c.provider) {
      case "person": return this.evalPerson(c, ctx);
      case "group": return this.evalGroup(c, ctx);
      case "form": return this.evalForm(c, ctx);
      case "giving": {
        const { start, end } = this.getWindow(c);
        return new Set(await getGivingModuleGateway().loadDonorPersonIds(ctx.churchId, c.entityId || null, start, end));
      }
      case "attendance": {
        const { start, end } = this.getWindow(c);
        const scope: { campusId?: string; serviceId?: string; serviceTimeId?: string; groupId?: string } = {};
        if (c.entityId && c.entityType) {
          if (c.entityType === "campus") scope.campusId = c.entityId;
          else if (c.entityType === "service") scope.serviceId = c.entityId;
          else if (c.entityType === "serviceTime") scope.serviceTimeId = c.entityId;
          else if (c.entityType === "group") scope.groupId = c.entityId;
        }
        return new Set(await getAttendanceModuleGateway().loadAttendeePersonIds(ctx.churchId, scope, start, end));
      }
      // ponytail: "serving" case removed — no B1Admin producer; add back when UI ships the filter
      case "list": return this.evalList(c, ctx);
      default: return new Set();
    }
  }

  private static async evalPerson(c: ListRuleCondition, ctx: EvalContext): Promise<Set<string>> {
    const rows = await this.getPeopleRows(ctx);
    const condition: SearchCondition = { field: c.field, operator: c.operator as any, value: c.value ?? "" };
    const matched = PersonConditionHelper.applyOne(rows.slice(), condition);
    return new Set(matched.map((r: any) => r.id));
  }

  private static async evalGroup(c: ListRuleCondition, ctx: EvalContext): Promise<Set<string>> {
    if (!c.entityId) return new Set();
    const members = (await ctx.repos.groupMember.loadForGroup(ctx.churchId, c.entityId)) as any[];
    const ids = new Set<string>((members || []).map((m) => m.personId));
    if (c.operator === "notIn") return this.complement(ids, ctx);
    return ids;
  }

  private static async evalForm(c: ListRuleCondition, ctx: EvalContext): Promise<Set<string>> {
    if (!c.entityId) return new Set();
    // ponytail: only "answer" field is produced by B1Admin; "submitted" path removed
    if (c.field !== "answer") return new Set();
    const question: any = await ctx.repos.question.load(ctx.churchId, c.entityId);
    if (!question) return new Set();
    const answers = await ctx.repos.answer.loadForQuestionWithPerson(ctx.churchId, c.entityId);
    const ids = new Set<string>();
    answers.forEach((a) => {
      if (a.personId && this.matchAnswer(question.fieldType, a.value, c.operator ?? "contains", c.value ?? "")) ids.add(a.personId);
    });
    return ids;
  }

  private static async evalList(c: ListRuleCondition, ctx: EvalContext): Promise<Set<string>> {
    if (!c.entityId || ctx.visitedListIds.has(c.entityId)) return new Set();
    ctx.visitedListIds.add(c.entityId);
    const list = await ctx.repos.list.load(ctx.churchId, c.entityId);
    if (!list) return new Set();
    let ids: Set<string>;
    if (list.rules) {
      ids = await this.evaluateGroup(list.rules, ctx);
      ids = await this.expandHousehold(ids, list.householdInclusion, ctx);
    } else {
      // Legacy list without rules: fall back to the cached refresh membership.
      ids = new Set(await ctx.repos.listMember.loadPersonIds(ctx.churchId, c.entityId));
    }
    if (c.operator === "notIn") return this.complement(ids, ctx);
    return ids;
  }

  private static matchAnswer(fieldType: string, answerValue: string, operator: string, searchValue: string): boolean {
    if (answerValue === null || answerValue === undefined) return false;
    if (fieldType === "Whole Number" || fieldType === "Decimal") {
      const a = parseFloat(answerValue);
      const b = parseFloat(searchValue);
      if (isNaN(a) || isNaN(b)) return false;
      switch (operator) {
        case "equals": return a === b;
        case "greaterThan": return a > b;
        case "greaterThanEqual": return a >= b;
        case "lessThan": return a < b;
        case "lessThanEqual": return a <= b;
        default: return false;
      }
    }
    if (fieldType === "Date") {
      const a = new Date(answerValue);
      const b = new Date(searchValue);
      if (isNaN(a.getTime()) || isNaN(b.getTime())) return false;
      switch (operator) {
        case "equals": return a.toDateString() === b.toDateString();
        case "greaterThan": return a > b;
        case "lessThan": return a < b;
        default: return false;
      }
    }
    const a = answerValue.toLowerCase();
    const b = (searchValue ?? "").toLowerCase();
    switch (operator) {
      case "equals": return a === b;
      case "startsWith": return a.startsWith(b);
      case "endsWith": return a.endsWith(b);
      case "contains": default: return a.includes(b);
    }
  }

  private static getWindow(c: ListRuleCondition): { start: Date; end: Date } {
    const end = c.to ? new Date(c.to) : new Date();
    let start: Date;
    if (c.daysAgo !== undefined) {
      start = new Date();
      start.setDate(start.getDate() - c.daysAgo);
    } else {
      start = c.from ? new Date(c.from) : new Date("1970-01-01");
    }
    return { start, end };
  }

  private static async getPeopleRows(ctx: EvalContext): Promise<any[]> {
    if (!ctx.peopleRows) ctx.peopleRows = (await ctx.repos.person.loadAll(ctx.churchId)) as any[];
    return ctx.peopleRows;
  }

  private static async getAllPeopleIds(ctx: EvalContext): Promise<Set<string>> {
    const rows = await this.getPeopleRows(ctx);
    return new Set(rows.map((r) => r.id));
  }

  private static async complement(ids: Set<string>, ctx: EvalContext): Promise<Set<string>> {
    const all = await this.getAllPeopleIds(ctx);
    return new Set(Array.from(all).filter((id) => !ids.has(id)));
  }

  private static async expandHousehold(ids: Set<string>, mode: string | undefined, ctx: EvalContext): Promise<Set<string>> {
    if (!mode || mode === "none" || ids.size === 0) return ids;
    const rows = await this.getPeopleRows(ctx);
    const householdIds = new Set<string>();
    rows.forEach((r) => { if (ids.has(r.id) && r.householdId) householdIds.add(r.householdId); });
    rows.forEach((r) => {
      if (!r.householdId || !householdIds.has(r.householdId)) return;
      if (mode === "household" || (mode === "children" && r.householdRole === "Child")) ids.add(r.id);
    });
    return ids;
  }

  private static union(sets: Set<string>[]): Set<string> {
    const result = new Set<string>();
    sets.forEach((s) => s.forEach((id) => result.add(id)));
    return result;
  }
}
