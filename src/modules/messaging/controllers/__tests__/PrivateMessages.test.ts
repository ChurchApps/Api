import "reflect-metadata";

// Infrastructure only is stubbed; the controller under test is the real one.
jest.mock("../../../../shared/infrastructure/index", () => ({ BaseController: class { constructor(_module?: string) {} } }));
jest.mock("../../repositories/index", () => ({ Repos: class {} }));
jest.mock("@churchapps/apihelper", () => ({ BasePermissions: class {}, ArrayHelper: { getOne: (arr: any[], key: string, value: any) => (arr || []).find((a) => a[key] === value) || null } }));
jest.mock("../../helpers/DeliveryHelper", () => ({ DeliveryHelper: { sendConversationMessages: jest.fn() } }));
const notifyUser = jest.fn();
jest.mock("../../helpers/NotificationHelper", () => ({ NotificationHelper: { notifyUser } }));
// The shared barrel drags in Environment (needs apihelper, mocked above); only the age gate is real here.
jest.mock("../../../../shared/helpers/index", () => ({ MessagingSafetyHelper: jest.requireActual("../../../../shared/helpers/MessagingSafetyHelper").MessagingSafetyHelper }));
const loadSetting = jest.fn(async () => null);
const loadPerson = jest.fn(async (_churchId: string, id: string) => ({ id, birthDate: new Date("1980-01-01") }));
jest.mock("../../../../shared/modules/MembershipModuleGateway.js", () => ({ getMembershipModuleGateway: () => ({ loadSetting, loadPerson }) }));

import { PrivateMessageController } from "../PrivateMessageController.js";

const AU = { id: "u1", churchId: "c1", personId: "pMe", checkAccess: () => false };

const pmRow = (over: any = {}) => ({
  id: "pm1",
  churchId: "c1",
  fromPersonId: "pOther",
  toPersonId: "pMe",
  conversationId: "cv1",
  notifyPersonId: null,
  conversation: { id: "cv1", churchId: "c1", lastPostId: "m1" },
  ...over
});

function build(opts: any = {}) {
  const repos = {
    privateMessage: {
      loadByPersonId: jest.fn(async () => opts.byPerson ?? []),
      loadExisting: jest.fn(async () => opts.existing ?? null),
      loadById: jest.fn(async () => opts.byId ?? null),
      save: jest.fn(async (pm: any) => ({ ...pm, id: pm.id || "pmNew" })),
      markAllRead: jest.fn(async () => undefined)
    },
    notification: {
      markPrivateMessageRead: jest.fn(async () => undefined),
      markPrivateMessagesRead: jest.fn(async () => undefined)
    },
    message: { loadByIds: jest.fn(async () => opts.messages ?? [{ id: "m1", content: "hello" }]) }
  };
  const controller: any = new PrivateMessageController();
  controller.repos = repos;
  controller.actionWrapper = (_req: any, _res: any, action: any) => action(opts.au ?? AU);
  controller.json = (obj: any, status: number) => ({ obj, status });
  return { controller, repos };
}

beforeEach(() => {
  notifyUser.mockClear();
  loadSetting.mockClear();
  loadPerson.mockClear();
  loadPerson.mockImplementation(async (_churchId: string, id: string) => ({ id, birthDate: new Date("1980-01-01") }) as any);
});

describe("PrivateMessageController.getAll", () => {
  it("is a pure read — never marks the inbox read", async () => {
    const { controller, repos } = build({ byPerson: [pmRow({ notifyPersonId: "pMe" })] });
    const result = await controller.getAll({}, {});
    expect(result[0].notifyPersonId).toBe("pMe");
    expect(result[0].conversation.messages).toEqual([{ id: "m1", content: "hello" }]);
    expect(repos.privateMessage.markAllRead).not.toHaveBeenCalled();
    expect(repos.notification.markPrivateMessagesRead).not.toHaveBeenCalled();
    expect(repos.privateMessage.save).not.toHaveBeenCalled();
  });

  it("still returns rows with no last post", async () => {
    const { controller, repos } = build({ byPerson: [pmRow({ conversation: { id: "cv1", lastPostId: null } })] });
    const result = await controller.getAll({}, {});
    expect(result[0].conversation.messages).toEqual([]);
    expect(repos.notification.markPrivateMessagesRead).not.toHaveBeenCalled();
  });
});

describe("PrivateMessageController.getExisting", () => {
  it("returns {} when there is no thread with that person", async () => {
    const { controller, repos } = build({ existing: null });
    const result = await controller.getExisting("pOther", {}, {});
    expect(result).toEqual({});
    expect(repos.privateMessage.loadExisting).toHaveBeenCalledWith("c1", "pMe", "pOther");
  });

  it("clears notifyPersonId and retires the shadow row when the caller is the notified party", async () => {
    const { controller, repos } = build({ existing: pmRow({ notifyPersonId: "pMe" }) });
    const result = await controller.getExisting("pOther", {}, {});
    expect(result.notifyPersonId).toBeNull();
    expect(result.conversationId).toBe("cv1");
    expect(repos.privateMessage.save).toHaveBeenCalledWith(expect.objectContaining({ id: "pm1", notifyPersonId: null }));
    expect(repos.notification.markPrivateMessageRead).toHaveBeenCalledWith("c1", "pMe", "pm1");
  });

  it("leaves another person's unread flag alone", async () => {
    const { controller, repos } = build({ existing: pmRow({ notifyPersonId: "pOther" }) });
    const result = await controller.getExisting("pOther", {}, {});
    expect(result.notifyPersonId).toBe("pOther");
    expect(repos.privateMessage.save).not.toHaveBeenCalled();
    expect(repos.notification.markPrivateMessageRead).not.toHaveBeenCalled();
  });
});

describe("PrivateMessageController.save", () => {
  it("returns the existing pair row instead of inserting a duplicate", async () => {
    const existing = pmRow();
    const { controller, repos } = build({ existing });
    const result = await controller.save({ body: [{ toPersonId: "pOther", conversationId: "cvNew" }] }, {});
    expect(result).toEqual([existing]);
    expect(repos.privateMessage.save).not.toHaveBeenCalled();
    expect(notifyUser).not.toHaveBeenCalled();
  });

  it("creates the row when the pair has none, without a generic notification", async () => {
    const { controller, repos } = build({ existing: null });
    const result = await controller.save({ body: [{ toPersonId: "pOther", conversationId: "cvNew" }] }, {});
    expect(repos.privateMessage.save).toHaveBeenCalledWith(expect.objectContaining({ churchId: "c1", fromPersonId: "pMe", toPersonId: "pOther", conversationId: "cvNew" }));
    expect(result[0].id).toBe("pmNew");
    expect(notifyUser).not.toHaveBeenCalled();
  });

  it("403s ageRestricted before touching the repo", async () => {
    loadPerson.mockImplementation(async (_churchId: string, id: string) => ({ id, householdRole: "Child" }) as any);
    const { controller, repos } = build({ existing: null });
    const result = await controller.save({ body: [{ toPersonId: "pKid", conversationId: "cvNew" }] }, {});
    expect(result).toEqual({ obj: { errors: ["ageRestricted"] }, status: 403 });
    expect(repos.privateMessage.loadExisting).not.toHaveBeenCalled();
    expect(repos.privateMessage.save).not.toHaveBeenCalled();
  });
});
