import "reflect-metadata";
jest.mock("../MembershipBaseController", () => ({ MembershipBaseController: class { json(obj: unknown, status: number) { return { obj, status }; } } }));
const getPeopleIds = jest.fn(async (): Promise<string[]> => ["p1"]);
const evaluate = jest.fn(async (): Promise<string[]> => ["p1"]);
jest.mock("../../helpers/index", () => {
  const actual = jest.requireActual("../../helpers/ListRuleHelper");
  return {
    Permissions: { people: { view: "peopleView", edit: "peopleEdit" }, donations: { view: "donationsView" } },
    ListRuleHelper: { usesGiving: actual.ListRuleHelper.usesGiving.bind(actual.ListRuleHelper), getPeopleIds, evaluate }
  };
});
jest.mock("../../../../shared/modules/index", () => ({ getAttendanceModuleGateway: jest.fn(), getGivingModuleGateway: jest.fn() }));
jest.mock("../../helpers/PersonConditionHelper", () => ({ PersonConditionHelper: { applyOne: jest.fn(), usesThisMonth: () => false } }));
jest.mock("../../db/index", () => ({ getDb: jest.fn() }));
jest.mock("@churchapps/apihelper", () => ({ __esModule: true, UniqueIdHelper: { shortId: () => "generated" } }));

import express from "express";
import { ListController } from "../ListController.js";
import type { List, ListRuleGroup } from "../../models/index.js";

type JsonResult = { obj: unknown; status: number };
const res = {} as express.Response;

const givingRules: ListRuleGroup = { match: "all", conditions: [{ provider: "giving", field: "donated", operator: "notIn", daysAgo: 90 }] };
const personRules: ListRuleGroup = { match: "all", conditions: [{ provider: "person", field: "membershipStatus", operator: "equals", value: "Member" }] };
// A list that only references another list whose rules use giving.
const nestedRules: ListRuleGroup = { match: "any", conditions: [], groups: [{ match: "all", conditions: [{ provider: "list", entityId: "givers" }] }] };

const storedLists: Record<string, List> = {
  givers: { id: "givers", churchId: "c1", name: "Givers", scope: "shared", rules: givingRules } as List,
  members: { id: "members", churchId: "c1", name: "Members", scope: "shared", rules: personRules } as List,
  nested: { id: "nested", churchId: "c1", name: "Nested", scope: "shared", rules: nestedRules } as List
};

function setup(granted: string[]) {
  const au = { id: "u1", personId: "per1", churchId: "c1", checkAccess: (p: string) => granted.includes(p) };
  const repos = {
    list: { load: jest.fn(async (_c: string, id: string) => storedLists[id]), save: jest.fn(async (l: List) => ({ ...l, id: l.id || "new" })) },
    person: { loadByIds: jest.fn(async (): Promise<unknown[]> => [{ id: "p1" }]), convertAllToModelWithPermissions: jest.fn((_c: string, d: unknown[]) => d) }
  };
  const controller = new ListController();
  Object.assign(controller, {
    repos,
    actionWrapper: (_req: express.Request, _res: express.Response, action: (user: typeof au) => unknown) => action(au),
    json: (obj: unknown, status: number) => ({ obj, status })
  });
  return { controller, repos };
}

const staff = ["peopleView", "peopleEdit"];
const finance = [...staff, "donationsView"];

describe("ListController: giving rules need donation view", () => {
  beforeEach(() => jest.clearAllMocks());

  it("refuses to save a list with a giving rule without donation view", async () => {
    const { controller, repos } = setup(staff);
    const result = (await controller.save({ body: [{ name: "Lapsed", rules: givingRules }] } as express.Request<{}, {}, List[]>, res)) as JsonResult;
    expect(result.status).toBe(401);
    expect(repos.list.save).not.toHaveBeenCalled();
  });

  it("refuses to save a list that references a giving list without donation view", async () => {
    const { controller, repos } = setup(staff);
    const result = (await controller.save({ body: [{ name: "Sneaky", rules: nestedRules }] } as express.Request<{}, {}, List[]>, res)) as JsonResult;
    expect(result.status).toBe(401);
    expect(repos.list.save).not.toHaveBeenCalled();
  });

  it("saves a giving list for someone with donation view", async () => {
    const { controller, repos } = setup(finance);
    await controller.save({ body: [{ name: "Lapsed", rules: givingRules }] } as express.Request<{}, {}, List[]>, res);
    expect(repos.list.save).toHaveBeenCalledTimes(1);
  });

  it("still saves lists without giving rules for staff without donation view", async () => {
    const { controller, repos } = setup(staff);
    await controller.save({ body: [{ name: "Members", rules: personRules }, { name: "Static" }] } as express.Request<{}, {}, List[]>, res);
    expect(repos.list.save).toHaveBeenCalledTimes(2);
  });

  it("refuses to preview or load the people of a giving list without donation view", async () => {
    const { controller } = setup(staff);
    const preview = (await controller.preview({ body: { rules: givingRules } } as express.Request<{}, {}, { rules: ListRuleGroup }>, res)) as JsonResult;
    expect(preview.status).toBe(401);
    expect(evaluate).not.toHaveBeenCalled();
    for (const id of ["givers", "nested"]) {
      const people = (await controller.getPeople(id, {} as express.Request, res)) as JsonResult;
      expect(people.status).toBe(401);
    }
    expect(getPeopleIds).not.toHaveBeenCalled();
  });

  it("evaluates giving lists for donation viewers and non-giving lists for everyone with people view", async () => {
    expect(await setup(finance).controller.getPeople("givers", {} as express.Request, res)).toEqual([{ id: "p1" }]);
    expect(await setup(staff).controller.getPeople("members", {} as express.Request, res)).toEqual([{ id: "p1" }]);
    expect(await setup(staff).controller.preview({ body: { rules: personRules } } as express.Request<{}, {}, { rules: ListRuleGroup }>, res)).toEqual([{ id: "p1" }]);
    expect(getPeopleIds).toHaveBeenCalledTimes(2);
  });
});
