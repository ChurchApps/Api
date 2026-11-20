import "reflect-metadata";
jest.mock("../MessagingBaseController", () => ({ MessagingBaseController: class { json(obj: unknown, status: number) { return { obj, status }; } } }));
jest.mock("../../../../shared/helpers/Permissions", () => ({ Permissions: { groupMembers: { edit: "groupMembersEdit" }, tasks: { admin: "tasksAdmin" } } }));
jest.mock("../../../../shared/helpers/Environment", () => ({ Environment: { supportEmail: "support@test.org", b1AdminRoot: "" } }));
jest.mock("../../../../shared/helpers/ChurchEmailLimiter", () => ({ ChurchEmailLimiter: { status: jest.fn(async () => ({ approved: false, paused: false, remaining: 0 })) } }));
jest.mock("../../../../shared/helpers/TransactionalEmailHelper", () => ({ TransactionalEmailHelper: { sendTransactional: jest.fn(async (): Promise<void> => undefined) } }));
jest.mock("../../../../shared/infrastructure/RepoManager", () => ({ RepoManager: { getRepos: jest.fn() } }));

import express from "express";
import { EmailTemplateController } from "../EmailTemplateController.js";

type SendStatusResult = { approved?: boolean; obj?: unknown; status?: number };

function makeController(granted: string[]) {
  const controller = new EmailTemplateController();
  const au = { churchId: "c1", checkAccess: (p: string) => granted.includes(p) };
  Object.assign(controller, {
    repos: { deliveryLog: { countByMethodSince: jest.fn(async () => 0) } },
    actionWrapper: (_req: express.Request, _res: express.Response, action: (a: typeof au) => unknown) => action(au)
  });
  return controller;
}

// #1338: workflow managers (tasks admin) need the send status to warn that a Send Email action won't go out.
describe("EmailTemplateController.sendStatus access", () => {
  it("answers a tasks admin without group member edit", async () => {
    const result = await makeController(["tasksAdmin"]).sendStatus({} as express.Request, {} as express.Response);
    expect(result).toEqual({ approved: false, paused: false, remaining: 0, requested: false });
  });

  it("answers a group member editor", async () => {
    const result = (await makeController(["groupMembersEdit"]).sendStatus({} as express.Request, {} as express.Response)) as SendStatusResult;
    expect(result.approved).toBe(false);
  });

  it("refuses a user with neither permission", async () => {
    const result = await makeController([]).sendStatus({} as express.Request, {} as express.Response);
    expect(result).toEqual({ obj: {}, status: 401 });
  });
});
