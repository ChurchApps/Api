import "reflect-metadata";
jest.mock("../MembershipBaseController", () => ({ MembershipBaseController: class { json(obj: unknown, status: number) { return { obj, status }; } } }));
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
jest.mock("@churchapps/apihelper", () => ({ ArrayHelper: { getIds: (): string[] => [], getUnique: (a: unknown[]) => a }, FileStorageHelper: { store: jest.fn() } }));

import type express from "express";
import { PersonController } from "../PersonController.js";
import { Household, Person } from "../../models/index.js";

const res = {} as express.Response;

function setup() {
  const repos = {
    person: {
      // PersonRepo.save sets name.display before writing, so a person without a name throws there.
      save: jest.fn(async (p: Person) => { p.name.display = [p.name.first, p.name.last].filter(Boolean).join(" "); p.id ||= "p9"; return p; }),
      convertAllToModelWithPermissions: (_c: string, arr: Person[]) => arr
    },
    household: { save: jest.fn(async (h: Household) => { h.id = "h1"; return h; }) }
  };
  const au = { churchId: "c1", personId: "p1", checkAccess: () => true };
  const controller = new PersonController();
  Object.assign(controller, {
    repos,
    actionWrapper: (_req: express.Request, _res: express.Response, action: (user: typeof au) => Promise<unknown>) => action(au),
    json: (obj: unknown, status: number) => ({ obj, status })
  });
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
    const result = (await controller.save({ body } as express.Request, res)) as { status: number };
    expect(result.status).toBe(400);
    expect(repos.person.save).not.toHaveBeenCalled();
    expect(repos.household.save).not.toHaveBeenCalled();
  });

  it("still saves a named person", async () => {
    const { controller, repos } = setup();
    const result = (await controller.save({ body: [{ name: { first: "Sample", last: "Member" } }] } as express.Request, res)) as Person[];
    expect(repos.person.save).toHaveBeenCalledTimes(1);
    expect(result[0].name.display).toBe("Sample Member");
  });
});

// Household edits only reach another member's record through a staff-approved directoryUpdate task.
describe("PersonController POST / for someone else without People edit", () => {
  it("401s a member saving a household child's record directly", async () => {
    const { controller, repos } = setup();
    Object.assign(controller, {
      actionWrapper: (_req: express.Request, _res: express.Response, action: (user: unknown) => Promise<unknown>) =>
        action({ churchId: "c1", personId: "p1", checkAccess: (perm: string) => perm === "peopleEditSelf" })
    });
    const result = await controller.save({ body: [{ id: "pChild", name: { first: "Child", last: "Member" } }] } as express.Request, res);
    expect(result).toEqual({ obj: {}, status: 401 });
    expect(repos.person.save).not.toHaveBeenCalled();
  });
});
