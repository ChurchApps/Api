import "reflect-metadata";
jest.mock("../MembershipBaseController", () => ({ MembershipBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("../../helpers/index", () => ({
  Permissions: { people: { edit: "peopleEdit", editSelf: "peopleEditSelf", view: "peopleView" }, server: { admin: "serverAdmin" } },
  UserChurchHelper: { createForPersonEmailUpdate: jest.fn() }
}));
jest.mock("../../models/requests", () => ({}));
jest.mock("../../../../shared/webhooks/index", () => ({ WebhookDispatcher: { emit: jest.fn() } }));
jest.mock("@churchapps/apihelper", () => ({ ArrayHelper: { getIds: () => [], getUnique: (a: any[]) => a }, FileStorageHelper: { store: jest.fn() } }));

import { PersonController } from "../PersonController.js";

function personController(opts: any = {}) {
  const repos: any = {
    person: {
      save: jest.fn(async (p: any) => { if (!p.id) p.id = "genP"; return p; }),
      convertAllToModelWithPermissions: (_c: string, arr: any[]) => arr,
      convertToModelWithPermissions: (_c: string, data: any) => data,
      load: jest.fn(async () => opts.person ?? null),
      delete: jest.fn(),
      deleteByIds: jest.fn()
    },
    household: { deleteUnused: jest.fn() },
    formSubmission: { convertAllToModel: (_c: string, rows: any[]) => rows, loadForContent: jest.fn(async () => []) }
  };
  const au = { churchId: "c1", id: "u1", personId: opts.personId ?? "p1", membershipStatus: opts.membershipStatus ?? "Guest", checkAccess: (perm: any) => (opts.access ?? []).includes(perm) };
  const controller = new PersonController();
  (controller as any).repos = repos;
  (controller as any).actionWrapper = (_req: any, _res: any, action: any) => action(au);
  (controller as any).json = (obj: any, status: number) => ({ obj, status });
  return { controller, repos };
}

function saveReq(body: any[]) {
  return { body };
}

describe("PersonController.save authorization", () => {
  it("blocks a caller with neither people.edit nor a matching editSelf (401, nothing saved)", async () => {
    const { controller, repos } = personController({ access: [] });
    const result: any = await (controller as any).save(saveReq([{ id: "p2" }]), {});
    expect(result.status).toBe(401);
    expect(repos.person.save).not.toHaveBeenCalled();
  });

  it("allows a caller with people.edit to save others", async () => {
    const { controller, repos } = personController({ access: ["peopleEdit"] });
    await (controller as any).save(saveReq([{ id: "p2" }]), {});
    expect(repos.person.save).toHaveBeenCalledTimes(1);
  });

  it("allows editSelf when body[0].id matches the caller's personId", async () => {
    const { controller, repos } = personController({ access: ["peopleEditSelf"], personId: "p1" });
    await (controller as any).save(saveReq([{ id: "p1" }]), {});
    expect(repos.person.save).toHaveBeenCalledTimes(1);
  });

  it("blocks editSelf when body[0].id does not match the caller's personId", async () => {
    const { controller, repos } = personController({ access: ["peopleEditSelf"], personId: "p1" });
    const result: any = await (controller as any).save(saveReq([{ id: "someoneElse" }]), {});
    expect(result.status).toBe(401);
    expect(repos.person.save).not.toHaveBeenCalled();
  });

  it("editSelf gate only checks body[0] — a second, unrelated person in the same array also gets saved", async () => {
    // note: suspicious — PersonController.ts:387-388 sets isSelfPermissionValid from req.body[0].id only,
    // then the save loop below (line 393) iterates the WHOLE array; an editSelf-only caller can smuggle edits
    // to other people's records by putting their own id first. Possible authz bug.
    const { controller, repos } = personController({ access: ["peopleEditSelf"], personId: "p1" });
    const result: any = await (controller as any).save(saveReq([{ id: "p1" }, { id: "someoneElse" }]), {});
    expect(result.status).toBeUndefined();
    expect(repos.person.save).toHaveBeenCalledTimes(2);
  });
});

describe("PersonController.get authorization", () => {
  it("lets a caller load their own record with no view permission and no member status", async () => {
    const { controller, repos } = personController({ personId: "p1", access: [], membershipStatus: "Guest", person: { id: "p1", name: {} } });
    const result = await (controller as any).get("p1", {}, {});
    expect(repos.person.load).toHaveBeenCalled();
    expect(result).toMatchObject({ id: "p1" });
  });

  it("blocks a non-self caller without view permission or member status (401)", async () => {
    const { controller, repos } = personController({ personId: "p1", access: [], membershipStatus: "Guest" });
    const result: any = await (controller as any).get("p2", {}, {});
    expect(result.status).toBe(401);
    expect(repos.person.load).not.toHaveBeenCalled();
  });

  it("allows a non-self caller with people.view", async () => {
    const { controller, repos } = personController({ personId: "p1", access: ["peopleView"], person: { id: "p2", name: {} } });
    await (controller as any).get("p2", {}, {});
    expect(repos.person.load).toHaveBeenCalled();
  });
});

describe("PersonController.delete / bulkDelete authorization", () => {
  it("delete blocks a caller without people.edit (401, nothing deleted)", async () => {
    const { controller, repos } = personController({ access: [] });
    const result: any = await (controller as any).delete("p1", {}, {});
    expect(result.status).toBe(401);
    expect(repos.person.delete).not.toHaveBeenCalled();
  });

  it("bulkDelete blocks a caller without people.edit (401)", async () => {
    const { controller, repos } = personController({ access: [] });
    const result: any = await (controller as any).bulkDelete({ body: { personIds: ["p1"] } }, {});
    expect(result.status).toBe(401);
    expect(repos.person.deleteByIds).not.toHaveBeenCalled();
  });
});
