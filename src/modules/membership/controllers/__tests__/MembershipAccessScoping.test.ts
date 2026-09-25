import "reflect-metadata";
jest.mock("../../../../shared/infrastructure/index.js", () => ({ BaseController: class { constructor(_m: string) {} } }));
jest.mock("../../helpers/index", () => ({
  Permissions: { forms: { admin: "formsAdmin", edit: "formsEdit" }, people: { view: "peopleView", edit: "peopleEdit" } },
  LoginRateLimiter: { getClientIp: () => "1.1.1.1" },
  PublicPersonRateLimiter: { allow: jest.fn(async () => true) }
}));
jest.mock("../../models/index", () => ({}));
jest.mock("../../../../shared/webhooks/index", () => ({ WebhookDispatcher: { emit: jest.fn() } }));

import { MembershipBaseController } from "../MembershipBaseController.js";
import { MemberPermissionController } from "../MemberPermissionController.js";
import { HouseholdController } from "../HouseholdController.js";
import { ClientErrorController } from "../ClientErrorController.js";
import { PublicPersonRateLimiter } from "../../helpers/index.js";

function auFor(perms: string[], extra: any = {}) {
  return { id: "u1", churchId: "c1", personId: "p1", checkAccess: (p: string) => perms.includes(p), ...extra };
}

function wire<T>(controller: T, repos: any, au: any): T {
  (controller as any).repos = repos;
  (controller as any).actionWrapper = (_req: any, _res: any, action: any) => action(au);
  (controller as any).json = (obj: any, status: number) => ({ obj, status });
  return controller;
}

describe("formAccess church scoping", () => {
  function base(formInChurch: boolean, memberRow: any = null) {
    const repos: any = {
      form: {
        load: jest.fn(async () => (formInChurch ? { id: "f1", churchId: "c1" } : null)),
        loadWithMemberPermissions: jest.fn(async () => memberRow)
      }
    };
    const controller = new MembershipBaseController();
    controller.repos = repos;
    return { controller, repos };
  }

  it("denies a forms.admin for a form in another church", async () => {
    const { controller } = base(false);
    expect(await controller.formAccess(auFor(["formsAdmin"]) as any, "f1")).toBe(false);
  });

  it("denies a forms.edit for a form in another church", async () => {
    const { controller } = base(false);
    expect(await controller.formAccess(auFor(["formsEdit"]) as any, "f1")).toBe(false);
  });

  it("allows a forms.admin for a form in their church", async () => {
    const { controller } = base(true);
    expect(await controller.formAccess(auFor(["formsAdmin"]) as any, "f1")).toBe(true);
  });

  it("still honours per-member form permissions", async () => {
    const { controller } = base(true, { contentType: "form", action: "view" });
    expect(await controller.formAccess(auFor([]) as any, "f1", "view")).toBe(true);
    expect(await controller.formAccess(auFor([]) as any, "f1")).toBe(false);
  });
});

describe("MemberPermissionController id handling", () => {
  it("checks access against the permission's form, not the permission id", async () => {
    const repos: any = { memberPermission: { load: jest.fn(async () => ({ id: "mp1", contentId: "f1" })), convertToModel: (_c: string, r: any) => r } };
    const controller = wire(new MemberPermissionController(), repos, auFor([]));
    const formAccess = jest.fn(async () => true);
    (controller as any).formAccess = formAccess;
    await (controller as any).get("mp1", {}, {});
    expect(formAccess).toHaveBeenCalledWith(expect.anything(), "f1", "view");
  });

  it("does not let a plain member list another person's form permissions", async () => {
    const repos: any = { memberPermission: { loadFormsByPerson: jest.fn(async () => []), convertAllToModel: (_c: string, r: any) => r } };
    const controller = wire(new MemberPermissionController(), repos, auFor([]));
    const result: any = await (controller as any).getByMember("p2", {}, {});
    expect(result.status).toBe(401);
    expect(repos.memberPermission.loadFormsByPerson).not.toHaveBeenCalled();
  });

  it("lets a member list their own form permissions", async () => {
    const repos: any = { memberPermission: { loadFormsByPerson: jest.fn(async () => []), convertAllToModel: (_c: string, r: any) => r } };
    const controller = wire(new MemberPermissionController(), repos, auFor([]));
    await (controller as any).getByMember("p1", {}, {});
    expect(repos.memberPermission.loadFormsByPerson).toHaveBeenCalled();
  });
});

describe("HouseholdController read permissions", () => {
  function households(perms: string[], selfHouseholdId = "h1") {
    const repos: any = {
      household: { load: jest.fn(async () => ({ id: "h9" })), loadAll: jest.fn(async () => []), convertToModel: (_c: string, r: any) => r, convertAllToModel: (_c: string, r: any) => r },
      person: { load: jest.fn(async () => ({ id: "p1", householdId: selfHouseholdId })) }
    };
    return { controller: wire(new HouseholdController(), repos, auFor(perms)), repos };
  }

  it("blocks a plain member from listing every household", async () => {
    const { controller, repos } = households([]);
    const result: any = await (controller as any).getAll({}, {});
    expect(result.status).toBe(401);
    expect(repos.household.loadAll).not.toHaveBeenCalled();
  });

  it("blocks a plain member from reading someone else's household", async () => {
    const { controller, repos } = households([]);
    const result: any = await (controller as any).get("h9", {}, {});
    expect(result.status).toBe(401);
    expect(repos.household.load).not.toHaveBeenCalled();
  });

  it("lets a member read their own household", async () => {
    const { controller, repos } = households([], "h9");
    await (controller as any).get("h9", {}, {});
    expect(repos.household.load).toHaveBeenCalled();
  });

  it("lets people.view staff read any household", async () => {
    const { controller, repos } = households(["peopleView"]);
    await (controller as any).get("h9", {}, {});
    expect(repos.household.load).toHaveBeenCalled();
  });
});

describe("ClientErrorController anonymous writes", () => {
  function clientErrors(au: any) {
    const repos: any = { clientError: { save: jest.fn(async (e: any) => e), convertAllToModel: (_c: string, r: any) => r } };
    return { controller: wire(new ClientErrorController(), repos, au), repos };
  }

  it("rate-limits anonymous callers", async () => {
    (PublicPersonRateLimiter.allow as jest.Mock).mockResolvedValueOnce(false);
    const { controller, repos } = clientErrors({ id: "", churchId: "" });
    const result: any = await (controller as any).save({ body: [{ message: "x" }], headers: {} }, {});
    expect(result.status).toBe(429);
    expect(repos.clientError.save).not.toHaveBeenCalled();
  });

  it("caps the batch size", async () => {
    const { controller, repos } = clientErrors({ id: "u1", churchId: "c1" });
    await (controller as any).save({ body: Array.from({ length: 50 }, () => ({ message: "x" })), headers: {} }, {});
    expect(repos.clientError.save).toHaveBeenCalledTimes(20);
  });
});
