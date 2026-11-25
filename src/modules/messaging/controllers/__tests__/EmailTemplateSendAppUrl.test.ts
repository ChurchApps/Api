import "reflect-metadata";
const mockEnv: { supportEmail: string; b1AdminRoot: string; b1AppRoot: string } = { supportEmail: "support@test.org", b1AdminRoot: "", b1AppRoot: "" };
jest.mock("../MessagingBaseController", () => ({ MessagingBaseController: class { json(obj: unknown, status: number) { return { obj, status }; } } }));
jest.mock("../../../../shared/helpers/Permissions", () => ({ Permissions: { groupMembers: { edit: "groupMembersEdit" }, tasks: { admin: "tasksAdmin" } } }));
jest.mock("../../../../shared/helpers/Environment", () => ({ Environment: mockEnv }));
jest.mock("../../../../shared/helpers/ChurchEmailLimiter", () => ({
  ChurchEmailLimiter: {
    status: jest.fn(async () => ({ approved: true, paused: false, remaining: 100 })),
    reserve: jest.fn(async () => ["r1"]),
    settle: jest.fn(async (): Promise<void> => undefined)
  }
}));
jest.mock("../../../../shared/helpers/TransactionalEmailHelper", () => ({ TransactionalEmailHelper: { fromAddress: jest.fn(() => "Grace <noreply@test.org>"), sendTransactional: jest.fn(async (): Promise<void> => undefined) } }));
jest.mock("../../../../shared/infrastructure/RepoManager", () => ({ RepoManager: { getRepos: jest.fn(async () => ({ church: { load: async () => ({ name: "Grace", subDomain: "grace" }) } })) } }));

import express from "express";
import { EmailTemplateController } from "../EmailTemplateController.js";
import { TransactionalEmailHelper } from "../../../../shared/helpers/TransactionalEmailHelper.js";

function makeController() {
  const controller = new EmailTemplateController();
  const au = { churchId: "c1", email: "admin@test.org", checkAccess: () => true };
  Object.assign(controller, {
    actionWrapper: (_req: express.Request, _res: express.Response, action: (a: typeof au) => unknown) => action(au),
    getGroupMemberEmailDetails: jest.fn(async () => [{ personId: "p1", firstName: "Donald", lastName: "Clark", displayName: "Donald Clark", email: "donald@test.org" }])
  });
  return controller;
}

async function sendAndGetAppUrl() {
  const req = { body: { subject: "Hello", htmlContent: "<p>Hi</p>", groupId: "g1" } } as express.Request;
  await makeController().send(req, {} as express.Response);
  const sendMock = TransactionalEmailHelper.sendTransactional as jest.Mock;
  expect(sendMock).toHaveBeenCalledTimes(1);
  return sendMock.mock.calls[0][3];
}

// #1689: the group email header links to the church's member site (B1APP_ROOT), not a hard-coded b1.church.
describe("EmailTemplateController.send header link", () => {
  beforeEach(() => (TransactionalEmailHelper.sendTransactional as jest.Mock).mockClear());

  it("uses a self-hosted B1APP_ROOT", async () => {
    mockEnv.b1AppRoot = "https://app.example.org";
    expect(await sendAndGetAppUrl()).toBe("https://app.example.org");
  });

  it("fills the subdomain into a hosted B1APP_ROOT template", async () => {
    mockEnv.b1AppRoot = "https://{subdomain}.b1.church";
    expect(await sendAndGetAppUrl()).toBe("https://grace.b1.church");
  });
});
