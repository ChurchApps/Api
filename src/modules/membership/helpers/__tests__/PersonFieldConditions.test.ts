import "reflect-metadata";

// Cut the heavy value-imports so the unit under test loads without a DB/Environment/apihelper (ESM) bootstrap.
jest.mock("../../../../shared/modules/index", () => ({
  getAttendanceModuleGateway: () => ({ loadAttendeePersonIds: async (): Promise<string[]> => [] }),
  getGivingModuleGateway: () => ({ loadDonorPersonIds: async (): Promise<string[]> => [] })
}));
jest.mock("../PersonConditionHelper", () => ({
  PersonConditionHelper: {
    apply: (data: Record<string, unknown>[], conditions: SearchCondition[]) => conditions.reduce((rows: Record<string, unknown>[], c) => rows.filter((r) => String(r[c.field]) === String(c.value)), data),
    applyOne: jest.fn((data: Record<string, unknown>[]) => data),
    usesThisMonth: (conditions: SearchCondition[]) => conditions.some((c) => c.value === "thisMonth")
  }
}));
jest.mock("../../db/index", () => ({ getDb: jest.fn() }));
jest.mock("@churchapps/apihelper", () => ({ __esModule: true, UniqueIdHelper: { shortId: () => "generated" } }));

import { ListRuleHelper } from "../ListRuleHelper";
import { PersonConditionHelper } from "../PersonConditionHelper";
import { PersonFieldValueRepo } from "../../repositories/PersonFieldValueRepo";
import type { PersonField, PersonFieldValue, SearchCondition } from "../../models/index.js";
import type { Repos } from "../../repositories/index.js";
import type { Selectable } from "kysely";
import type { MembershipDatabase } from "../../db/DatabaseTypes.js";

type PersonFieldValueRow = Selectable<MembershipDatabase["personFieldValues"]>;

function mockRepos(field: PersonField | null, values: PersonFieldValue[]) {
  return Object.assign({} as Repos, {
    personField: { load: jest.fn().mockResolvedValue(field) },
    personFieldValue: { loadForField: jest.fn().mockResolvedValue(values) }
  });
}

async function evalOne(field: PersonField, values: PersonFieldValue[], operator: string, value: string): Promise<string[]> {
  const repos = mockRepos(field, values);
  const rules = { match: "all" as const, conditions: [{ provider: "field" as const, entityId: "f1", operator, value }] };
  return ListRuleHelper.evaluate("ch1", rules, undefined, repos);
}

describe("evalField (custom-field list-rule provider)", () => {
  it("matches text 'contains' and 'equals'", async () => {
    const field = { id: "f1", fieldType: "Textbox" };
    const values = [
      { personId: "p1", value: "Hello World" },
      { personId: "p2", value: "Goodbye" }
    ];
    expect(await evalOne(field, values, "contains", "world")).toEqual(["p1"]);
    expect(await evalOne(field, values, "equals", "hello world")).toEqual(["p1"]);
  });

  it("matches numbers with greaterThan", async () => {
    const field = { id: "f1", fieldType: "Whole Number" };
    const values = [
      { personId: "p1", value: "10" },
      { personId: "p2", value: "3" }
    ];
    expect(await evalOne(field, values, "greaterThan", "5")).toEqual(["p1"]);
  });

  it("matches dates with greaterThan", async () => {
    const field = { id: "f1", fieldType: "Date" };
    const values = [
      { personId: "p1", value: "2026-06-15" },
      { personId: "p2", value: "2025-01-01" }
    ];
    expect(await evalOne(field, values, "greaterThan", "2026-01-01")).toEqual(["p1"]);
  });

  it("returns nobody when the field definition is missing", async () => {
    const repos = mockRepos(null, [{ personId: "p1", value: "x" }]);
    const rules = { match: "all" as const, conditions: [{ provider: "field" as const, entityId: "missing", operator: "contains", value: "x" }] };
    expect(await ListRuleHelper.evaluate("ch1", rules, undefined, repos)).toEqual([]);
  });
});

describe("advancedSearch personField branch (AND-intersection)", () => {
  it("intersects a custom-field condition with a standard person condition", async () => {
    const data = [
      { id: "p1", lastName: "Smith" },
      { id: "p2", lastName: "Jones" },
      { id: "p3", lastName: "Smith" }
    ];
    const field = { id: "f1", fieldType: "Textbox" };
    const values = [
      { personId: "p1", value: "Yes" },
      { personId: "p2", value: "Yes" },
      { personId: "p3", value: "No" }
    ];
    const repos = mockRepos(field, values);

    const fieldConditions = [{ field: "personField_f1", operator: "equals" as const, value: "Yes" }];
    const standardConditions = [{ field: "lastName", operator: "equals" as const, value: "Smith" }];

    // Mirrors PersonController.advancedSearch: field-conditions filtered first, then standard person-conditions.
    let result: { id: string; lastName: string }[] = await ListRuleHelper.filterByFieldConditions("ch1", data, fieldConditions, repos);
    result = PersonConditionHelper.apply(result, standardConditions);

    expect(result.map((p) => p.id)).toEqual(["p1"]);
  });

  it("matches nobody when the custom field is unknown", async () => {
    const data = [{ id: "p1", lastName: "Smith" }];
    const repos = mockRepos(null, []);
    const fieldConditions = [{ field: "personField_missing", operator: "equals" as const, value: "Yes" }];
    const result = await ListRuleHelper.filterByFieldConditions("ch1", data, fieldConditions, repos);
    expect(result).toEqual([]);
  });
});

describe("PersonFieldValueRepo.upsert (blank clears the row)", () => {
  afterEach(() => jest.restoreAllMocks());

  it("creates a new row when no value exists yet", async () => {
    const repo = new PersonFieldValueRepo();
    jest.spyOn(repo, "loadForPersonField").mockResolvedValue(null);
    const save = jest.spyOn(repo, "save").mockImplementation(async (m: PersonFieldValue) => m);
    const del = jest.spyOn(repo, "delete").mockResolvedValue(undefined);

    await repo.upsert("ch1", "p1", "f1", "hello");

    expect(save).toHaveBeenCalledWith(expect.objectContaining({ id: undefined, personId: "p1", fieldId: "f1", value: "hello" }));
    expect(del).not.toHaveBeenCalled();
  });

  it("updates the existing row when a value already exists", async () => {
    const repo = new PersonFieldValueRepo();
    jest.spyOn(repo, "loadForPersonField").mockResolvedValue({ id: "v9" } as PersonFieldValueRow);
    const save = jest.spyOn(repo, "save").mockImplementation(async (m: PersonFieldValue) => m);
    const del = jest.spyOn(repo, "delete").mockResolvedValue(undefined);

    await repo.upsert("ch1", "p1", "f1", "updated");

    expect(save).toHaveBeenCalledWith(expect.objectContaining({ id: "v9", value: "updated" }));
    expect(del).not.toHaveBeenCalled();
  });

  it("deletes the existing row when the value is blank", async () => {
    const repo = new PersonFieldValueRepo();
    jest.spyOn(repo, "loadForPersonField").mockResolvedValue({ id: "v9" } as PersonFieldValueRow);
    const save = jest.spyOn(repo, "save").mockImplementation(async (m: PersonFieldValue) => m);
    const del = jest.spyOn(repo, "delete").mockResolvedValue(undefined);

    await repo.upsert("ch1", "p1", "f1", "");

    expect(del).toHaveBeenCalledWith("ch1", "v9");
    expect(save).not.toHaveBeenCalled();
  });

  it("does nothing when clearing a value that never existed", async () => {
    const repo = new PersonFieldValueRepo();
    jest.spyOn(repo, "loadForPersonField").mockResolvedValue(null);
    const save = jest.spyOn(repo, "save").mockImplementation(async (m: PersonFieldValue) => m);
    const del = jest.spyOn(repo, "delete").mockResolvedValue(undefined);

    await repo.upsert("ch1", "p1", "f1", "");

    expect(save).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
  });
});

describe("household inclusion", () => {
  const people = [
    { id: "dad", householdId: "h1", householdRole: "Head" },
    { id: "mom", householdId: "h1", householdRole: "Spouse" },
    { id: "kid", householdId: "h1", householdRole: "Child" },
    { id: "grandma", householdId: "h1", householdRole: "Other" },
    { id: "neighbor", householdId: "h2", householdRole: "Head" }
  ];
  const groupRules = { match: "all" as const, conditions: [{ provider: "group" as const, entityId: "g1" }] };
  const repos = Object.assign({} as Repos, {
    person: { loadAll: jest.fn().mockResolvedValue(people) },
    groupMember: { loadForGroup: jest.fn().mockResolvedValue([{ personId: "kid" }]) }
  });

  it("replaces matches with the adults of their households", async () => {
    expect((await ListRuleHelper.evaluate("ch1", groupRules, "adults", repos)).sort()).toEqual(["dad", "mom"]);
  });

  it("still adds children or the whole household for the other modes", async () => {
    expect((await ListRuleHelper.evaluate("ch1", groupRules, "household", repos)).sort()).toEqual(["dad", "grandma", "kid", "mom"]);
    expect((await ListRuleHelper.evaluate("ch1", groupRules, "children", repos)).sort()).toEqual(["kid"]);
  });
});

describe("this month person conditions", () => {
  it("evaluates with the church's time zone", async () => {
    const repos = Object.assign({} as Repos, {
      person: { loadAll: jest.fn().mockResolvedValue([{ id: "p1" }]) },
      church: { loadById: jest.fn().mockResolvedValue({ timeZone: "America/Chicago" }) }
    });
    const rules = { match: "all" as const, conditions: [{ provider: "person" as const, field: "birthMonth", operator: "equals", value: "thisMonth" }] };
    await ListRuleHelper.evaluate("ch1", rules, undefined, repos);
    expect(PersonConditionHelper.applyOne).toHaveBeenLastCalledWith(expect.any(Array), expect.objectContaining({ value: "thisMonth" }), "America/Chicago");
    expect(repos.church.loadById).toHaveBeenCalledWith("ch1");
  });
});
