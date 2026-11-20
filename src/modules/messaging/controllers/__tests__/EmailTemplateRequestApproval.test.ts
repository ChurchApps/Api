import "reflect-metadata";
jest.mock("../MessagingBaseController", () => ({ MessagingBaseController: class { json(obj: unknown, status: number) { return { obj, status }; } } }));
jest.mock("../../../../shared/helpers/Permissions", () => ({ Permissions: { groupMembers: { edit: "groupMembersEdit" } } }));
jest.mock("../../../../shared/helpers/Environment", () => ({ Environment: { supportEmail: "support@test.org", b1AdminRoot: "" } }));
jest.mock("../../../../shared/helpers/ChurchEmailLimiter", () => ({ ChurchEmailLimiter: { status: jest.fn(async () => ({ approved: false })) } }));
jest.mock("../../../../shared/helpers/TransactionalEmailHelper", () => ({ TransactionalEmailHelper: { sendTransactional: jest.fn(async (): Promise<void> => undefined) } }));
jest.mock("../../../../shared/infrastructure/RepoManager", () => ({ RepoManager: { getRepos: jest.fn() } }));

import express from "express";
import { AuthenticatedUser } from "@churchapps/apihelper";
import { EmailTemplateController } from "../EmailTemplateController.js";
import { DeliveryLog } from "../../models/index.js";
import { TransactionalEmailHelper } from "../../../../shared/helpers/TransactionalEmailHelper.js";
import { RepoManager } from "../../../../shared/infrastructure/RepoManager.js";

const sendMock = TransactionalEmailHelper.sendTransactional as jest.Mock;

function makeController(au: Partial<AuthenticatedUser>) {
  const repos = {
    deliveryLog: {
      countByMethodSince: jest.fn(async () => 0),
      save: jest.fn(async (d: DeliveryLog) => d)
    }
  };
  const userLoad = jest.fn(async () => ({ id: "u1", firstName: "Donald", lastName: "Clark", email: "donald@test.org" }));
  (RepoManager.getRepos as jest.Mock).mockResolvedValue({
    church: { loadById: jest.fn(async () => ({ id: "c1", name: "Grace Community" })) },
    user: { load: userLoad }
  });
  const controller = new EmailTemplateController();
  Object.assign(controller, {
    repos,
    actionWrapper: (_req: express.Request, _res: express.Response, action: (a: AuthenticatedUser) => unknown) => action({ churchId: "c1", checkAccess: () => true, ...au } as AuthenticatedUser)
  });
  return { controller, repos, userLoad };
}

beforeEach(() => sendMock.mockClear());

describe("EmailTemplateController.requestApproval requester", () => {
  it("fills in the requester from the user record when the request uses an API key", async () => {
    const { controller, repos } = makeController({ id: "u1", personId: "p1", email: "", firstName: "", lastName: "", jwt: "" });
    await controller.requestApproval({} as express.Request, {} as express.Response);
    const body: string = sendMock.mock.calls[0][5];
    expect(body).toContain("Requested by Donald Clark &lt;donald@test.org&gt;");
    expect(body).toContain("via API key");
    expect(repos.deliveryLog.save).toHaveBeenCalledWith(expect.objectContaining({ deliveryAddress: "donald@test.org" }));
  });

  it("uses the logged-in user's details without a lookup for a JWT request", async () => {
    const { controller, userLoad } = makeController({ id: "u2", email: "jane@test.org", firstName: "Jane", lastName: "Doe", jwt: "abc" });
    await controller.requestApproval({} as express.Request, {} as express.Response);
    const body: string = sendMock.mock.calls[0][5];
    expect(body).toContain("Requested by Jane Doe &lt;jane@test.org&gt;.");
    expect(body).not.toContain("via API key");
    expect(userLoad).not.toHaveBeenCalled();
  });
});
