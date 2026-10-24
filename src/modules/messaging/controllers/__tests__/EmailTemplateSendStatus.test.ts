import "reflect-metadata";
jest.mock("../MessagingBaseController", () => ({ MessagingBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("../../../../shared/helpers/Permissions", () => ({ Permissions: { groupMembers: { edit: "groupMembersEdit" }, tasks: { admin: "tasksAdmin" } } }));
jest.mock("../../../../shared/helpers/Environment", () => ({ Environment: { supportEmail: "support@test.org", b1AdminRoot: "" } }));
jest.mock("../../../../shared/helpers/ChurchEmailLimiter", () => ({ ChurchEmailLimiter: { status: jest.fn(async () => ({ approved: false, paused: false, remaining: 0 })) } }));
jest.mock("../../../../shared/helpers/TransactionalEmailHelper", () => ({ TransactionalEmailHelper: { sendTransactional: jest.fn(async () => undefined) } }));
jest.mock("../../../../shared/infrastructure/RepoManager", () => ({ RepoManager: { getRepos: jest.fn() } }));

import { EmailTemplateController } from "../EmailTemplateController.js";

function makeController(granted: string[]) {
  const controller = new EmailTemplateController();
  (controller as any).repos = { deliveryLog: { countByMethodSince: jest.fn(async () => 0) } };
  (controller as any).actionWrapper = (_req: any, _res: any, action: any) => action({ churchId: "c1", checkAccess: (p: string) => granted.includes(p) });
  return controller;
}

// #1338: workflow managers (tasks admin) need the send status to warn that a Send Email action won't go out.
describe("EmailTemplateController.sendStatus access", () => {
  it("answers a tasks admin without group member edit", async () => {
    const result = await (makeController(["tasksAdmin"]) as any).sendStatus({}, {});
    expect(result).toEqual({ approved: false, paused: false, remaining: 0, requested: false });
  });

  it("answers a group member editor", async () => {
    const result = await (makeController(["groupMembersEdit"]) as any).sendStatus({}, {});
    expect(result.approved).toBe(false);
  });

  it("refuses a user with neither permission", async () => {
    const result = await (makeController([]) as any).sendStatus({}, {});
    expect(result).toEqual({ obj: {}, status: 401 });
  });
});
