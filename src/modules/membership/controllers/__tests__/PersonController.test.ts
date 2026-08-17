import "reflect-metadata";
jest.mock("../MembershipBaseController", () => ({ MembershipBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("../../helpers/index", () => ({
  Permissions: { people: { edit: "peopleEdit", editSelf: "peopleEditSelf", view: "peopleView" }, server: { admin: "serverAdmin" } },
  UserChurchHelper: { createForPersonEmailUpdate: jest.fn() },
  PersonHelper: { getPerson: jest.fn(), registerGuestHousehold: jest.fn() },
  AuditLogHelper: { getClientIp: () => "1.2.3.4" },
  PublicPersonRateLimiter: { allow: jest.fn(() => true), reset: jest.fn() },
  PublicChurchContext: { bind: jest.fn(() => ({ churchId: null, mismatch: false })) }
}));
jest.mock("../../models/requests", () => ({}));
jest.mock("../../../../shared/webhooks/index", () => ({ WebhookDispatcher: { emit: jest.fn() } }));
jest.mock("@churchapps/apihelper", () => ({ ArrayHelper: { getIds: () => [], getUnique: (a: any[]) => a }, FileStorageHelper: { store: jest.fn() } }));

import { PersonController } from "../PersonController.js";
import { PersonHelper, PublicChurchContext, PublicPersonRateLimiter } from "../../helpers/index.js";

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
    formSubmission: { convertAllToModel: (_c: string, rows: any[]) => rows, loadForContent: jest.fn(async () => []) },
    church: { loadById: jest.fn(async () => opts.church ?? { id: "c1" }) },
    setting: {
      loadPublicSettings: jest.fn(async () => opts.settings ?? []),
      convertAllToModel: (_c: string, rows: any[]) => rows
    }
  };
  const au = { churchId: "c1", id: "u1", personId: opts.personId ?? "p1", membershipStatus: opts.membershipStatus ?? "Guest", checkAccess: (perm: any) => (opts.access ?? []).includes(perm) };
  const controller = new PersonController();
  (controller as any).repos = repos;
  (controller as any).actionWrapper = (_req: any, _res: any, action: any) => action(au);
  (controller as any).actionWrapperAnon = (_req: any, _res: any, action: any) => action();
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

describe("PersonController.apiEmails", () => {
  it("is not registered", () => {
    expect(Object.getOwnPropertyNames(PersonController.prototype)).not.toContain("apiEmails");
    expect((new PersonController() as any).apiEmails).toBeUndefined();
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

const guestBody = { churchId: "c1", members: [{ firstName: "Pat", lastName: "Guest" }] };
const loadBody = { churchId: "c1", email: "pat@example.com", firstName: "Pat", lastName: "Guest" };

describe("PersonController.guestRegister", () => {
  beforeEach(() => {
    (PublicChurchContext.bind as jest.Mock).mockReturnValue({ churchId: null, mismatch: false });
    (PublicPersonRateLimiter.allow as jest.Mock).mockReturnValue(true);
    (PersonHelper.registerGuestHousehold as jest.Mock).mockClear().mockResolvedValue({ householdId: "h1", people: [] });
  });

  it("rejects when guest registration is not enabled", async () => {
    const { controller, repos } = personController({ settings: [] });
    const result: any = await (controller as any).guestRegister({ body: guestBody, headers: {} }, {});
    expect(result.status).toBe(401);
    expect(PersonHelper.registerGuestHousehold).not.toHaveBeenCalled();
    expect(repos.church.loadById).toHaveBeenCalledWith("c1");
  });

  it("rejects an archived church", async () => {
    const { controller } = personController({ church: { id: "c1", archivedDate: new Date() }, settings: [{ keyName: "enableQRGuestRegistration", value: "true" }] });
    const result: any = await (controller as any).guestRegister({ body: guestBody, headers: {} }, {});
    expect(result.status).toBe(401);
    expect(PersonHelper.registerGuestHousehold).not.toHaveBeenCalled();
  });

  it("rate-limits after the church is bound", async () => {
    const { controller } = personController({ settings: [{ keyName: "enableQRGuestRegistration", value: "true" }] });
    (PublicPersonRateLimiter.allow as jest.Mock).mockReturnValue(false);
    const result: any = await (controller as any).guestRegister({ body: guestBody, headers: {} }, {});
    expect(result.status).toBe(429);
    expect(PersonHelper.registerGuestHousehold).not.toHaveBeenCalled();
  });

  it("registers when the church enabled QR guest registration", async () => {
    const { controller } = personController({ settings: [{ keyName: "enableQRGuestRegistration", value: "true" }] });
    const result = await (controller as any).guestRegister({ body: guestBody, headers: {} }, {});
    expect(PersonHelper.registerGuestHousehold).toHaveBeenCalledWith("c1", guestBody.members);
    expect(result).toEqual({ householdId: "h1", people: [] });
  });

  it("uses a signed site/JWT church and ignores the opt-in setting", async () => {
    (PublicChurchContext.bind as jest.Mock).mockReturnValue({ churchId: "c1", mismatch: false });
    const { controller } = personController({ settings: [] });
    await (controller as any).guestRegister({ body: guestBody, headers: {} }, {});
    expect(PersonHelper.registerGuestHousehold).toHaveBeenCalledWith("c1", guestBody.members);
  });

  it("rejects a claimed churchId that does not match the signed context", async () => {
    (PublicChurchContext.bind as jest.Mock).mockReturnValue({ churchId: null, mismatch: true });
    const { controller } = personController({ settings: [{ keyName: "enableQRGuestRegistration", value: "true" }] });
    const result: any = await (controller as any).guestRegister({ body: guestBody, headers: {} }, {});
    expect(result.status).toBe(401);
    expect(PersonHelper.registerGuestHousehold).not.toHaveBeenCalled();
  });
});

describe("PersonController.loadOrCreate", () => {
  beforeEach(() => {
    (PublicChurchContext.bind as jest.Mock).mockReturnValue({ churchId: null, mismatch: false });
    (PublicPersonRateLimiter.allow as jest.Mock).mockReturnValue(true);
    (PersonHelper.getPerson as jest.Mock).mockClear().mockResolvedValue({ id: "p1", name: { first: "Pat", last: "Guest" }, contactInfo: { email: "secret@x.com", mobilePhone: "555" } });
  });

  it("rejects a missing churchId", async () => {
    const { controller } = personController();
    const result: any = await (controller as any).loadOrCreate({ body: { email: "a@b.com", firstName: "A", lastName: "B" }, headers: {} }, {});
    expect(result.status).toBe(400);
    expect(PersonHelper.getPerson).not.toHaveBeenCalled();
  });

  it("rejects an archived church on the anon path", async () => {
    const { controller } = personController({ church: { id: "c1", archivedDate: new Date() } });
    const result: any = await (controller as any).loadOrCreate({ body: loadBody, headers: {} }, {});
    expect(result.status).toBe(401);
    expect(PersonHelper.getPerson).not.toHaveBeenCalled();
  });

  it("rate-limits the anon path", async () => {
    const { controller } = personController();
    (PublicPersonRateLimiter.allow as jest.Mock).mockReturnValue(false);
    const result: any = await (controller as any).loadOrCreate({ body: loadBody, headers: {} }, {});
    expect(result.status).toBe(429);
    expect(PersonHelper.getPerson).not.toHaveBeenCalled();
  });

  it("does not restore and does not return contactInfo", async () => {
    const { controller } = personController();
    const result = await (controller as any).loadOrCreate({ body: loadBody, headers: {} }, {});
    expect(PersonHelper.getPerson).toHaveBeenCalledWith("c1", "pat@example.com", "Pat", "Guest", false, false);
    expect(result).toEqual({ id: "p1", name: { first: "Pat", last: "Guest" } });
    expect(result.contactInfo).toBeUndefined();
  });

  it("uses the JWT/site church and skips the anon church lookup", async () => {
    (PublicChurchContext.bind as jest.Mock).mockReturnValue({ churchId: "c1", mismatch: false });
    const { controller, repos } = personController();
    await (controller as any).loadOrCreate({ body: loadBody, headers: {} }, {});
    expect(repos.church.loadById).not.toHaveBeenCalled();
    expect(PersonHelper.getPerson).toHaveBeenCalledWith("c1", "pat@example.com", "Pat", "Guest", false, false);
  });

  it("rejects a claimed churchId that does not match the signed context", async () => {
    (PublicChurchContext.bind as jest.Mock).mockReturnValue({ churchId: null, mismatch: true });
    const { controller } = personController();
    const result: any = await (controller as any).loadOrCreate({ body: loadBody, headers: {} }, {});
    expect(result.status).toBe(401);
    expect(PersonHelper.getPerson).not.toHaveBeenCalled();
  });
});
