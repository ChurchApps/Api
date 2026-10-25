import "reflect-metadata";
jest.mock("../MembershipBaseController", () => ({ MembershipBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("../../helpers/index", () => ({
  PersonConditionHelper: { apply: (data: any[], conditions: any[]) => conditions.reduce((rows, c) => rows.filter((r: any) => r[c.field] === c.value), data) },
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
jest.mock("@churchapps/apihelper", () => ({ ArrayHelper: { getIds: () => [], getUnique: (a: any[]) => a }, FileStorageHelper: { store: jest.fn() } }));

import { PersonController } from "../PersonController.js";

function setup() {
  const repos: any = {
    person: {
      loadAll: jest.fn(async () => [{ id: "p1", membershipStatus: "Member" }, { id: "p2", membershipStatus: "Visitor" }]),
      convertAllToModelWithPermissions: (_c: string, arr: any[]) => arr
    }
  };
  const au = { churchId: "c1", personId: "p1", checkAccess: () => true };
  const controller: any = new PersonController();
  controller.repos = repos;
  controller.actionWrapper = (_req: any, _res: any, action: any) => action(au);
  controller.json = (obj: any, status: number) => ({ obj, status });
  controller.filterPeople = async (people: any[]) => people;
  return { controller, repos };
}

describe("PersonController POST /advancedSearch body shape", () => {
  it("answers 400 when the body is an object instead of a list of conditions", async () => {
    const { controller, repos } = setup();
    const result = await controller.advancedSearch({ body: { error: "no filters" } }, {});
    expect(result.status).toBe(400);
    expect(repos.person.loadAll).not.toHaveBeenCalled();
  });

  it("treats an empty body as no conditions", async () => {
    const { controller } = setup();
    const result = await controller.advancedSearch({ body: undefined }, {});
    expect(result).toHaveLength(2);
  });

  it("still applies a list of conditions", async () => {
    const { controller } = setup();
    const result = await controller.advancedSearch({ body: [{ field: "membershipStatus", operator: "equals", value: "Member" }] }, {});
    expect(result.map((p: any) => p.id)).toEqual(["p1"]);
  });
});
