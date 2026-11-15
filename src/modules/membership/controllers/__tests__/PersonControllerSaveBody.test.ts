import "reflect-metadata";
jest.mock("../MembershipBaseController", () => ({ MembershipBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("../../helpers/index", () => ({
  PersonConditionHelper: {},
  ListRuleHelper: {},
  Permissions: { people: { edit: "peopleEdit", editSelf: "peopleEditSelf", view: "peopleView" } },
  PersonHelper: { applyPendingPhoto: jest.fn() },
  UserChurchHelper: { createForPersonEmailUpdate: jest.fn() },
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
      // PersonRepo.save sets name.display before writing, so a person without a name throws there.
      save: jest.fn(async (p: any) => { p.name.display = [p.name.first, p.name.last].filter(Boolean).join(" "); p.id ||= "p9"; return p; }),
      convertAllToModelWithPermissions: (_c: string, arr: any[]) => arr
    },
    household: { save: jest.fn(async (h: any) => { h.id = "h1"; return h; }) }
  };
  const au = { churchId: "c1", personId: "p1", checkAccess: () => true };
  const controller: any = new PersonController();
  controller.repos = repos;
  controller.actionWrapper = (_req: any, _res: any, action: any) => action(au);
  controller.json = (obj: any, status: number) => ({ obj, status });
  return { controller, repos };
}

// Production: one 500 "Cannot read properties of undefined (reading 'first')" at PersonRepo.save on POST /membership/people.
describe("PersonController POST / body shape", () => {
  it.each([
    ["a person without a name", [{ contactInfo: {} }]],
    ["a person whose name is not an object", [{ name: "Sample" }]],
    ["one good person and one without a name", [{ name: { first: "Sample", last: "Member" } }, { id: "p2" }]],
    ["an object instead of a list", { name: { first: "Sample" } }]
  ])("answers 400 for %s without saving anything", async (_name, body) => {
    const { controller, repos } = setup();
    const result = await controller.save({ body }, {});
    expect(result.status).toBe(400);
    expect(repos.person.save).not.toHaveBeenCalled();
    expect(repos.household.save).not.toHaveBeenCalled();
  });

  it("still saves a named person", async () => {
    const { controller, repos } = setup();
    const result = await controller.save({ body: [{ name: { first: "Sample", last: "Member" } }] }, {});
    expect(repos.person.save).toHaveBeenCalledTimes(1);
    expect(result[0].name.display).toBe("Sample Member");
  });
});
