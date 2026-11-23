import "reflect-metadata";
jest.mock("../MembershipBaseController", () => ({ MembershipBaseController: class { json(obj: unknown, status: number) { return { obj, status }; } } }));
jest.mock("../../helpers/index", () => ({
  PersonConditionHelper: { apply: (data: Record<string, unknown>[], conditions: { field: string; value: unknown }[]) => conditions.reduce((rows, c) => rows.filter((r) => r[c.field] === c.value), data), usesThisMonth: () => false },
  ListRuleHelper: { filterByFieldConditions: jest.fn() },
  Permissions: { people: { edit: "peopleEdit", view: "peopleView" } },
  PersonHelper: {},
  UserChurchHelper: {},
  Environment: {},
  AuditLogHelper: {},
  LoginRateLimiter: {},
  PublicPersonRateLimiter: {},
  PublicEmailThrottle: {},
  PublicChurchContext: {}
}));
jest.mock("../../../../shared/helpers/TransactionalEmailHelper.js", () => ({ TransactionalEmailHelper: {} }));
jest.mock("../../models/requests", () => ({}));
jest.mock("../../../../shared/webhooks/index", () => ({ WebhookDispatcher: { emit: jest.fn() } }));
jest.mock("@churchapps/apihelper", () => ({ ArrayHelper: { getIds: (): string[] => [], getUnique: (a: unknown[]) => a }, FileStorageHelper: { store: jest.fn() } }));

import { PersonController } from "../PersonController.js";
import type express from "express";
import { Person } from "../../models/index.js";

interface JsonOut { obj: unknown; status: number }

const res = {} as express.Response;

function makeReq(r: Partial<express.Request>): express.Request {
  return r as express.Request;
}

function setup() {
  const repos = {
    person: {
      loadAll: jest.fn(async () => [{ id: "p1", membershipStatus: "Member" }, { id: "p2", membershipStatus: "Visitor" }]),
      convertAllToModelWithPermissions: (_c: string, arr: Person[]) => arr
    }
  };
  const au = { churchId: "c1", personId: "p1", checkAccess: () => true };
  const controller = new PersonController();
  Object.assign(controller, {
    repos,
    actionWrapper: (_req: express.Request, _res: express.Response, action: (user: typeof au) => Promise<unknown>) => action(au),
    json: (obj: unknown, status: number) => ({ obj, status }),
    filterPeople: async (people: Person[]) => people
  });
  return { controller, repos };
}

describe("PersonController POST /advancedSearch body shape", () => {
  it("answers 400 when the body is an object instead of a list of conditions", async () => {
    const { controller, repos } = setup();
    const result = (await controller.advancedSearch(makeReq({ body: { error: "no filters" } }), res)) as JsonOut;
    expect(result.status).toBe(400);
    expect(repos.person.loadAll).not.toHaveBeenCalled();
  });

  it("treats an empty body as no conditions", async () => {
    const { controller } = setup();
    const result = (await controller.advancedSearch(makeReq({ body: undefined }), res)) as Person[];
    expect(result).toHaveLength(2);
  });

  it("still applies a list of conditions", async () => {
    const { controller } = setup();
    const result = (await controller.advancedSearch(makeReq({ body: [{ field: "membershipStatus", operator: "equals", value: "Member" }] }), res)) as Person[];
    expect(result.map((p) => p.id)).toEqual(["p1"]);
  });
});
