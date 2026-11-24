import { List, ListRuleCondition, ListRuleGroup, SearchCondition } from "../models/index.js";
import { Repos } from "../repositories/index.js";
import { getAttendanceModuleGateway, getGivingModuleGateway } from "../../../shared/modules/index.js";
import { PersonConditionHelper } from "./PersonConditionHelper.js";
import type { Selectable } from "kysely";
import type { MembershipDatabase } from "../db/DatabaseTypes.js";

type PeopleRow = Selectable<MembershipDatabase["people"]>;

interface EvalContext {
  churchId: string;
  repos: Repos;
  peopleRows?: PeopleRow[];
  visitedListIds: Set<string>;
  viewerPersonId?: string;
  timeZone?: string | null;
}

export class ListRuleHelper {
  public static async getPeopleIds(churchId: string, list: List, repos: Repos): Promise<string[]> {
    if (!list.rules) return [];
    const visited = new Set<string>();
    if (list.id) visited.add(list.id);
    return this.evaluate(churchId, list.rules, list.householdInclusion, repos, visited, list.createdByPersonId);
  }

  // True when the rules (or any list they reference) filter on giving. Revealing who gave needs donation view.
  public static async usesGiving(churchId: string, rules: ListRuleGroup | undefined, repos: Repos, visitedListIds: Set<string> = new Set<string>()): Promise<boolean> {
    if (!rules) return false;
    for (const c of rules.conditions ?? []) {
      if (c.provider === "giving") return true;
      if (c.provider === "list" && c.entityId && !visitedListIds.has(c.entityId)) {
        visitedListIds.add(c.entityId);
        const list = await repos.list.load(churchId, c.entityId);
        if (list?.rules && await this.usesGiving(churchId, list.rules, repos, visitedListIds)) return true;
      }
    }
    for (const g of rules.groups ?? []) if (await this.usesGiving(churchId, g, repos, visitedListIds)) return true;
    return false;
  }

  public static async evaluate(churchId: string, rules: ListRuleGroup, householdInclusion: string | undefined, repos: Repos, visitedListIds?: Set<string>, viewerPersonId?: string): Promise<string[]> {
    const ctx: EvalContext = { churchId, repos, visitedListIds: visitedListIds ?? new Set<string>(), viewerPersonId };
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
      case "field": return this.evalField(c, ctx);
      case "giving": {
        const { start, end } = this.getWindow(c);
        const donors = new Set(await getGivingModuleGateway().loadDonorPersonIds(ctx.churchId, c.entityId || null, start, end));
        // "Has not donated": the church's people minus the donors in the window (giving lives in its own database).
        return c.operator === "notIn" ? this.complement(donors, ctx) : donors;
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
    const condition: SearchCondition = { field: c.field, operator: c.operator as SearchCondition["operator"], value: c.value ?? "" };
    const timeZone = PersonConditionHelper.usesThisMonth([condition]) ? await this.getTimeZone(ctx) : undefined;
    const matched = PersonConditionHelper.applyOne(rows.slice(), condition, timeZone);
    return new Set(matched.map((r) => r.id));
  }

  private static async evalGroup(c: ListRuleCondition, ctx: EvalContext): Promise<Set<string>> {
    if (!c.entityId) return new Set();
    const members = await ctx.repos.groupMember.loadForGroup(ctx.churchId, c.entityId);
    const ids = new Set<string>((members || []).map((m) => m.personId));
    if (c.operator === "notIn") return this.complement(ids, ctx);
    return ids;
  }

  private static async evalForm(c: ListRuleCondition, ctx: EvalContext): Promise<Set<string>> {
    if (!c.entityId) return new Set();
    // ponytail: only "answer" field is produced by B1Admin; "submitted" path removed
    if (c.field !== "answer") return new Set();
    const question = await ctx.repos.question.load(ctx.churchId, c.entityId);
    if (!question) return new Set();
    const answers = await ctx.repos.answer.loadForQuestionWithPerson(ctx.churchId, c.entityId);
    const ids = new Set<string>();
    answers.forEach((a) => {
      if (a.personId && this.matchAnswer(question.fieldType, a.value, c.operator ?? "contains", c.value ?? "")) ids.add(a.personId);
    });
    return ids;
  }

  private static async evalField(c: ListRuleCondition, ctx: EvalContext): Promise<Set<string>> {
    if (!c.entityId) return new Set();
    const field = await ctx.repos.personField.load(ctx.churchId, c.entityId);
    if (!field) return new Set();
    const values = await ctx.repos.personFieldValue.loadForField(ctx.churchId, c.entityId);
    const ids = new Set<string>();
    values.forEach((v) => {
      if (v.personId && this.matchAnswer(field.fieldType, v.value, c.operator ?? "contains", c.value ?? "")) ids.add(v.personId);
    });
    return ids;
  }

  // Filters people rows by custom-field conditions (field = "personField_<fieldId>"), ANDed together.
  public static async filterByFieldConditions<T extends { id?: string }>(churchId: string, data: T[], conditions: SearchCondition[], repos: Repos): Promise<T[]> {
    let result = data;
    for (const c of conditions) {
      const fieldId = c.field.substring("personField_".length);
      const field = await repos.personField.load(churchId, fieldId);
      if (!field) return [];
      const values = await repos.personFieldValue.loadForField(churchId, fieldId);
      const matchedIds = new Set<string>();
      values.forEach((v) => {
        if (v.personId && this.matchAnswer(field.fieldType, v.value, c.operator ?? "contains", c.value ?? "")) matchedIds.add(v.personId);
      });
      result = result.filter((p) => matchedIds.has(p.id));
    }
    return result;
  }

  private static async evalList(c: ListRuleCondition, ctx: EvalContext): Promise<Set<string>> {
    if (!c.entityId || ctx.visitedListIds.has(c.entityId)) return new Set();
    ctx.visitedListIds.add(c.entityId);
    const list = await ctx.repos.list.load(ctx.churchId, c.entityId);
    if (!list || (list.scope === "private" && list.createdByPersonId !== ctx.viewerPersonId)) return new Set();
    let ids: Set<string>;
    if (list.rules) {
      ids = await this.evaluateGroup(list.rules, ctx);
      ids = await this.expandHousehold(ids, list.householdInclusion, ctx);
    } else {
      ids = new Set(await ctx.repos.listMember.loadPersonIds(ctx.churchId, c.entityId));
    }
    if (c.operator === "notIn") return this.complement(ids, ctx);
    return ids;
  }

  public static matchAnswer(fieldType: string, answerValue: string, operator: string, searchValue: string): boolean {
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

  private static async getPeopleRows(ctx: EvalContext): Promise<PeopleRow[]> {
    if (!ctx.peopleRows) ctx.peopleRows = await ctx.repos.person.loadAll(ctx.churchId);
    return ctx.peopleRows;
  }

  private static async getTimeZone(ctx: EvalContext): Promise<string | undefined> {
    if (ctx.timeZone === undefined) ctx.timeZone = (await ctx.repos.church.loadById(ctx.churchId))?.timeZone ?? null;
    return ctx.timeZone ?? undefined;
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
    if (mode === "adults") {
      const isAdult = (r: PeopleRow) => r.householdRole === "Head" || r.householdRole === "Spouse";
      return new Set(rows.filter((r) => r.householdId && householdIds.has(r.householdId) && isAdult(r)).map((r) => r.id));
    }
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
