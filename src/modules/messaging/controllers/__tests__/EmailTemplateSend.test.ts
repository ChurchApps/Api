import "reflect-metadata";
jest.mock("../MessagingBaseController", () => ({ MessagingBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("../../../../shared/helpers/Permissions", () => ({ Permissions: { groupMembers: { edit: "groupMembersEdit" } } }));
jest.mock("../../../../shared/helpers/Environment", () => ({ Environment: { supportEmail: "support@test.org", b1AdminRoot: "" } }));
jest.mock("../../../../shared/helpers/ChurchEmailLimiter", () => ({
  ChurchEmailLimiter: {
    status: jest.fn(async () => ({ approved: true, paused: false, remaining: 100 })),
    reserve: jest.fn(async (_c: string, _t: string, recipients: any[]) => recipients.map((_r: any, i: number) => "r" + i)),
    settle: jest.fn(async () => undefined)
  }
}));
const sendTransactional = jest.fn(async () => undefined);
jest.mock("../../../../shared/helpers/TransactionalEmailHelper", () => ({
  TransactionalEmailHelper: {
    sendTransactional: (...args: any[]) => (sendTransactional as any)(...args),
    fromAddress: (name: string) => `"${name}" <support@test.org>`,
    logoUrl: (v?: string) => (v && v.startsWith("https://") ? v : undefined)
  }
}));
jest.mock("../../../../shared/infrastructure/RepoManager", () => ({ RepoManager: { getRepos: jest.fn() } }));

import { EmailTemplateController } from "../EmailTemplateController.js";
import { RepoManager } from "../../../../shared/infrastructure/RepoManager.js";
import { ChurchEmailLimiter } from "../../../../shared/helpers/ChurchEmailLimiter.js";

const people = [
  { id: "p1", firstName: "Donald", lastName: "Clark", displayName: "Donald Clark", email: "donald@x.org" },
  { id: "p2", firstName: "Carol", lastName: "Clark", displayName: "Carol Clark", email: "" }
];

function makeController(logo = "https://cdn.x.org/logo.png") {
  (RepoManager.getRepos as jest.Mock).mockResolvedValue({
    church: { load: jest.fn(async () => ({ id: "c1", name: "Grace" })) },
    setting: { loadMulipleChurches: jest.fn(async () => [{ value: logo }]) },
    person: { loadByIds: jest.fn(async () => people) }
  });
  const controller = new EmailTemplateController();
  (controller as any).actionWrapper = (_req: any, _res: any, action: any) => action({ churchId: "c1", personId: "sender", email: "pastor@x.org", firstName: "Pat", lastName: "Smith", checkAccess: (p: string) => p === "groupMembersEdit" });
  return controller;
}

beforeEach(() => {
  sendTransactional.mockClear();
  (ChurchEmailLimiter.reserve as jest.Mock).mockClear();
});

describe("EmailTemplateController.send", () => {
  it("puts the church logo on each email", async () => {
    await (makeController() as any).send({ body: { subject: "Hi {{firstName}}", htmlContent: "<p>Hello</p>", personIds: ["p1", "p2"] } }, {});
    expect(sendTransactional).toHaveBeenCalledTimes(1);
    expect(sendTransactional.mock.calls[0]).toEqual([
      '"Grace" <support@test.org>', "donald@x.org", "Grace", "", "Hi Donald", "<p>Hello</p>", "ChurchEmailTemplate.html", "pastor@x.org", "https://cdn.x.org/logo.png"
    ]);
  });

  it("leaves the logo off when the stored one isn't https", async () => {
    await (makeController("http://x.org/logo.png") as any).send({ body: { subject: "Hi", htmlContent: "<p>Hello</p>", personIds: ["p1"] } }, {});
    expect((sendTransactional.mock.calls[0] as any[])[8]).toBeUndefined();
  });

  it("sends the sender a copy with their own merge fields when asked", async () => {
    const result = await (makeController() as any).send({ body: { subject: "Hi {{firstName}}", htmlContent: "<p>Hello</p>", personIds: ["p1"], sendCopy: true } }, {});
    expect(sendTransactional).toHaveBeenCalledTimes(2);
    const copy = sendTransactional.mock.calls[1] as any[];
    expect(copy[1]).toBe("pastor@x.org");
    expect(copy[4]).toBe("Hi Pat");
    expect(ChurchEmailLimiter.reserve).toHaveBeenLastCalledWith("c1", "email", [{ address: "pastor@x.org", personId: "sender" }]);
    expect(result).toMatchObject({ recipientCount: 1, successCount: 1, copySent: true });
  });

  it("previews how many of the selected people have an email", async () => {
    const result = await (makeController() as any).previewPeople({ body: { personIds: ["p1", "p2"] } }, {});
    expect(result).toEqual({ totalMembers: 2, eligibleCount: 1, noEmailCount: 1 });
  });
});
