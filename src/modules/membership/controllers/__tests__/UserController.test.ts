import "reflect-metadata";
jest.mock("../MembershipBaseController", () => ({ MembershipBaseController: class { json(obj: any, status: number) { return { obj, status }; } denyAccess(errors: string[]) { return { obj: { errors }, status: 401 }; } } }));
jest.mock("../../helpers/index", () => ({
  Permissions: { server: { admin: "serverAdmin" }, people: { edit: "peopleEdit" } },
  UserHelper: {},
  UserChurchHelper: {},
  UniqueIdHelper: { shortId: () => "temp" },
  Environment: { currentEnvironment: "test", isMailConfigured: true },
  AuditLogHelper: { getClientIp: () => "1.2.3.4", log: jest.fn() },
  MauticHelper: {},
  ChurchHelper: {}
}));
jest.mock("../../auth/index", () => ({ AuthenticatedUser: {} }));
jest.mock("../../models/index", () => ({}));
jest.mock("../../../../shared/helpers/TransactionalEmailHelper.js", () => ({ TransactionalEmailHelper: {} }));
jest.mock("@churchapps/apihelper", () => ({ ArrayHelper: {} }));
jest.mock("uuid", () => ({ v4: () => "guid" }));

import bcrypt from "bcryptjs";
import { UserController } from "../UserController.js";
import { AuditLogHelper } from "../../helpers/index.js";

function userController(opts: any = {}) {
  const hashed = bcrypt.hashSync("oldpass", 10);
  const user = opts.user === undefined ? { id: "u1", email: "a@b.c", password: hashed } : opts.user;
  const repos: any = {
    user: {
      load: jest.fn(async () => (user ? { ...user } : null)),
      loadByAuthGuid: jest.fn(async (g: string) => (opts.guidUser && opts.guidUser.authGuid === g ? { ...opts.guidUser } : null)),
      save: jest.fn(async (u: any) => u)
    }
  };
  const au = { id: "u1", churchId: "c1" };
  const controller = new UserController();
  (controller as any).repos = repos;
  (controller as any).actionWrapper = (_req: any, _res: any, action: any) => action(au);
  (controller as any).actionWrapperAnon = (_req: any, _res: any, action: any) => action();
  (controller as any).json = (obj: any, status: number) => ({ obj, status });
  (controller as any).denyAccess = (errors: string[]) => ({ obj: { errors }, status: 401 });
  return { controller, repos };
}

describe("UserController.updatePassword", () => {
  it("rejects a JWT-only change without currentPassword", async () => {
    const { controller, repos } = userController();
    const result: any = await controller.updatePassword({ body: { newPassword: "newpass" } } as any, {} as any);
    expect(result.status).toBe(401);
    expect(repos.user.save).not.toHaveBeenCalled();
  });

  it("rejects a wrong currentPassword", async () => {
    const { controller, repos } = userController();
    const result: any = await controller.updatePassword({ body: { newPassword: "newpass", currentPassword: "wrong" } } as any, {} as any);
    expect(result.status).toBe(401);
    expect(repos.user.save).not.toHaveBeenCalled();
  });

  it("changes the password when currentPassword matches", async () => {
    const { controller, repos } = userController();
    const result: any = await controller.updatePassword({ body: { newPassword: "newpass", currentPassword: "oldpass" } } as any, {} as any);
    expect(result.status).toBe(200);
    expect(repos.user.save).toHaveBeenCalled();
    const saved = repos.user.save.mock.calls[0][0];
    expect(bcrypt.compareSync("newpass", saved.password)).toBe(true);
    expect(result.obj.password).toBe(null);
    expect(AuditLogHelper.log).toHaveBeenCalled();
  });
});

describe("UserController.setPasswordGuid", () => {
  it("resets the password with authGuid and no current password", async () => {
    const guidUser = { id: "u2", email: "b@c.d", authGuid: "reset-guid", password: bcrypt.hashSync("oldpass", 10) };
    const { controller, repos } = userController({ guidUser });
    const result: any = await controller.setPasswordGuid({ body: { authGuid: "reset-guid", newPassword: "freshpass" } } as any, {} as any);
    expect(result.success).toBe(true);
    expect(repos.user.save).toHaveBeenCalled();
    const saved = repos.user.save.mock.calls[0][0];
    expect(saved.authGuid).toBe("");
    expect(bcrypt.compareSync("freshpass", saved.password)).toBe(true);
  });

  it("fails for an unknown authGuid", async () => {
    const { controller, repos } = userController();
    const result: any = await controller.setPasswordGuid({ body: { authGuid: "nope", newPassword: "freshpass" } } as any, {} as any);
    expect(result.success).toBe(false);
    expect(repos.user.save).not.toHaveBeenCalled();
  });
});
