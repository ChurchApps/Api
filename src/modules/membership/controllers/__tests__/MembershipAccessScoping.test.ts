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
import type express from "express";
import type { AuthenticatedUser } from "@churchapps/apihelper";
import { ClientError, Household, MemberPermission } from "../../models/index.js";

interface FakeUser {
  id: string;
  churchId: string;
  personId?: string;
  // The mocked Permissions are plain strings, so String(p) is the permission name.
  checkAccess?: AuthenticatedUser["checkAccess"];
}

interface JsonOut { obj: unknown; status: number }

const req = {} as express.Request;
const res = {} as express.Response;

function auFor(perms: string[], extra: Partial<FakeUser> = {}): FakeUser {
  return { id: "u1", churchId: "c1", personId: "p1", checkAccess: (p) => perms.includes(String(p)), ...extra };
}

function wire<T>(controller: T, repos: Record<string, unknown>, au: FakeUser): T {
  Object.assign(controller, {
    repos,
    actionWrapper: (_req: express.Request, _res: express.Response, action: (user: FakeUser) => Promise<unknown>) => action(au),
    json: (obj: unknown, status: number) => ({ obj, status })
  });
  return controller;
}

describe("formAccess church scoping", () => {
  function base(formInChurch: boolean, memberRow: Partial<MemberPermission> = null) {
    const repos = {
      form: {
        load: jest.fn(async () => (formInChurch ? { id: "f1", churchId: "c1" } : null)),
        loadWithMemberPermissions: jest.fn(async () => memberRow)
      }
    };
    const controller = new MembershipBaseController();
    Object.assign(controller, { repos });
    return { controller, repos };
  }

  it("denies a forms.admin for a form in another church", async () => {
    const { controller } = base(false);
    expect(await controller.formAccess(auFor(["formsAdmin"]) as AuthenticatedUser, "f1")).toBe(false);
  });

  it("denies a forms.edit for a form in another church", async () => {
    const { controller } = base(false);
    expect(await controller.formAccess(auFor(["formsEdit"]) as AuthenticatedUser, "f1")).toBe(false);
  });

  it("allows a forms.admin for a form in their church", async () => {
    const { controller } = base(true);
    expect(await controller.formAccess(auFor(["formsAdmin"]) as AuthenticatedUser, "f1")).toBe(true);
  });

  it("still honours per-member form permissions", async () => {
    const { controller } = base(true, { contentType: "form", action: "view" });
    expect(await controller.formAccess(auFor([]) as AuthenticatedUser, "f1", "view")).toBe(true);
    expect(await controller.formAccess(auFor([]) as AuthenticatedUser, "f1")).toBe(false);
  });
});

describe("MemberPermissionController id handling", () => {
  it("checks access against the permission's form, not the permission id", async () => {
    const repos = { memberPermission: { load: jest.fn(async () => ({ id: "mp1", contentId: "f1" })), convertToModel: (_c: string, r: MemberPermission) => r } };
    const controller = wire(new MemberPermissionController(), repos, auFor([]));
    const formAccess = jest.fn(async () => true);
    Object.assign(controller, { formAccess });
    await controller.get("mp1", req, res);
    expect(formAccess).toHaveBeenCalledWith(expect.anything(), "f1", "view");
  });

  it("does not let a plain member list another person's form permissions", async () => {
    const repos = { memberPermission: { loadFormsByPerson: jest.fn(async (): Promise<MemberPermission[]> => []), convertAllToModel: (_c: string, r: MemberPermission[]) => r } };
    const controller = wire(new MemberPermissionController(), repos, auFor([]));
    const result = (await controller.getByMember("p2", req, res)) as JsonOut;
    expect(result.status).toBe(401);
    expect(repos.memberPermission.loadFormsByPerson).not.toHaveBeenCalled();
  });

  it("lets a member list their own form permissions", async () => {
    const repos = { memberPermission: { loadFormsByPerson: jest.fn(async (): Promise<MemberPermission[]> => []), convertAllToModel: (_c: string, r: MemberPermission[]) => r } };
    const controller = wire(new MemberPermissionController(), repos, auFor([]));
    await controller.getByMember("p1", req, res);
    expect(repos.memberPermission.loadFormsByPerson).toHaveBeenCalled();
  });
});

describe("HouseholdController read permissions", () => {
  function households(perms: string[], selfHouseholdId = "h1") {
    const repos = {
      household: { load: jest.fn(async () => ({ id: "h9" })), loadAll: jest.fn(async (): Promise<Household[]> => []), convertToModel: (_c: string, r: Household) => r, convertAllToModel: (_c: string, r: Household[]) => r },
      person: { load: jest.fn(async () => ({ id: "p1", householdId: selfHouseholdId })) }
    };
    return { controller: wire(new HouseholdController(), repos, auFor(perms)), repos };
  }

  it("blocks a plain member from listing every household", async () => {
    const { controller, repos } = households([]);
    const result = (await controller.getAll(req, res)) as JsonOut;
    expect(result.status).toBe(401);
    expect(repos.household.loadAll).not.toHaveBeenCalled();
  });

  it("blocks a plain member from reading someone else's household", async () => {
    const { controller, repos } = households([]);
    const result = (await controller.get("h9", req, res)) as JsonOut;
    expect(result.status).toBe(401);
    expect(repos.household.load).not.toHaveBeenCalled();
  });

  it("lets a member read their own household", async () => {
    const { controller, repos } = households([], "h9");
    await controller.get("h9", req, res);
    expect(repos.household.load).toHaveBeenCalled();
  });

  it("lets people.view staff read any household", async () => {
    const { controller, repos } = households(["peopleView"]);
    await controller.get("h9", req, res);
    expect(repos.household.load).toHaveBeenCalled();
  });
});

describe("ClientErrorController anonymous writes", () => {
  function clientErrors(au: FakeUser) {
    const repos = { clientError: { save: jest.fn(async (e: ClientError) => e), convertAllToModel: (_c: string, r: ClientError[]) => r } };
    return { controller: wire(new ClientErrorController(), repos, au), repos };
  }

  it("rate-limits anonymous callers", async () => {
    (PublicPersonRateLimiter.allow as jest.Mock).mockResolvedValueOnce(false);
    const { controller, repos } = clientErrors({ id: "", churchId: "" });
    const result = (await controller.save({ body: [{ message: "x" }], headers: {} } as express.Request, res)) as JsonOut;
    expect(result.status).toBe(429);
    expect(repos.clientError.save).not.toHaveBeenCalled();
  });

  it("caps the batch size", async () => {
    const { controller, repos } = clientErrors({ id: "u1", churchId: "c1" });
    await controller.save({ body: Array.from({ length: 50 }, () => ({ message: "x" })), headers: {} } as express.Request, res);
    expect(repos.clientError.save).toHaveBeenCalledTimes(20);
  });
});
