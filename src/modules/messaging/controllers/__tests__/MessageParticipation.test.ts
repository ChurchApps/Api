import "reflect-metadata";

// Same shape as PublicChatAccess.test.ts: only infrastructure is stubbed, so the real
// MessagingBaseController / canParticipate gates run.
jest.mock("../../../../shared/infrastructure/index", () => ({ BaseController: class { constructor(_module?: string) {} } }));
jest.mock("../../repositories/index", () => ({ Repos: class {} }));
jest.mock("@churchapps/apihelper", () => ({ ArrayHelper: { getOne: jest.fn() }, EncryptionHelper: { decrypt: jest.fn() } }));
jest.mock("../../helpers/DeliveryHelper", () => ({ DeliveryHelper: { sendConversationMessages: jest.fn(), sendAttendance: jest.fn(), sendBlockedIps: jest.fn() } }));
jest.mock("../../helpers/NotificationHelper", () => ({ NotificationHelper: { checkShouldNotify: jest.fn() } }));
jest.mock("../../../../shared/helpers/Permissions", () => ({ Permissions: { content: { edit: "contentEdit" }, chat: { host: "chatHost" }, people: { edit: "peopleEdit", viewConfidentialNotes: "peopleViewConfidentialNotes" } } }));

import { MessageController } from "../MessageController.js";
import { DeliveryHelper } from "../../helpers/DeliveryHelper.js";

const sendMock = DeliveryHelper.sendConversationMessages as jest.Mock;

const groupConv = { id: "grp1", churchId: "c1", contentType: "group", contentId: "g1", allowAnonymousPosts: false, visibility: "public" };
const dmConv = { id: "dm1", churchId: "c1", contentType: "privateMessage", contentId: "pm1", allowAnonymousPosts: false, visibility: "hidden" };
const publicLive = { id: "live1", churchId: "c1", contentType: "streamingLive", contentId: "svc1", allowAnonymousPosts: true, visibility: "public" };
const hostConv = { id: "host1", churchId: "c1", contentType: "streamingLiveHost", contentId: "svc1", allowAnonymousPosts: false, visibility: "public" };

function makeController(opts: any = {}) {
  const repos: any = {
    conversation: {
      loadById: jest.fn(async () => opts.conversation ?? null),
      convertToModel: (c: any) => c,
      updateStats: jest.fn(async () => undefined)
    },
    message: {
      loadById: jest.fn(async () => opts.message ?? { id: "m1", conversationId: opts.conversation?.id, personId: "p2" }),
      save: jest.fn(async (m: any) => ({ ...m, id: m.id ?? "mNew" })),
      convertAllToModel: (rows: any[]) => rows
    },
    privateMessage: { loadById: jest.fn(async () => opts.privateMessage ?? null) }
  };
  const au = {
    id: "u1",
    churchId: "c1",
    personId: opts.personId ?? "p1",
    firstName: "Test",
    lastName: "User",
    groupIds: opts.groupIds ?? [],
    leaderGroupIds: opts.leaderGroupIds ?? [],
    checkAccess: (perm: any) => (opts.access ?? []).includes(perm)
  };
  const controller = new MessageController();
  (controller as any).repos = repos;
  (controller as any).actionWrapper = (_req: any, _res: any, action: any) => action(au);
  (controller as any).json = (obj: any, status: number) => ({ obj, status });
  return { controller, repos };
}

const post = (controller: any, conversationId: string) => controller.save({ body: [{ conversationId, content: "hi" }] }, {});

beforeEach(() => sendMock.mockReset());

describe("MessageController.save participation gate", () => {
  it("401s a member posting into a group they are not in", async () => {
    const { controller, repos } = makeController({ conversation: groupConv, groupIds: ["other"] });
    expect((await post(controller, "grp1")).status).toBe(401);
    expect(repos.message.save).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("401s a member posting into a DM they are not part of", async () => {
    const { controller, repos } = makeController({ conversation: dmConv, privateMessage: { fromPersonId: "pX", toPersonId: "pY" } });
    expect((await post(controller, "dm1")).status).toBe(401);
    expect(repos.message.save).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("401s a member posting into the host room without chat.host", async () => {
    const { controller, repos } = makeController({ conversation: hostConv });
    expect((await post(controller, "host1")).status).toBe(401);
    expect(repos.message.save).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("401s a post to a conversation that does not exist", async () => {
    const { controller, repos } = makeController({ conversation: null });
    expect((await post(controller, "missing")).status).toBe(401);
    expect(repos.message.save).not.toHaveBeenCalled();
  });

  it("allows a member to post into their own group, their DM, and the public livestream room", async () => {
    const own = makeController({ conversation: groupConv, groupIds: ["g1"] });
    await post(own.controller, "grp1");
    expect(own.repos.message.save).toHaveBeenCalledWith(expect.objectContaining({ personId: "p1", content: "hi" }));

    const dm = makeController({ conversation: dmConv, privateMessage: { fromPersonId: "p1", toPersonId: "pY" } });
    await post(dm.controller, "dm1");
    expect(dm.repos.message.save).toHaveBeenCalledWith(expect.objectContaining({ personId: "p1" }));

    const live = makeController({ conversation: publicLive });
    await post(live.controller, "live1");
    expect(live.repos.message.save).toHaveBeenCalledWith(expect.objectContaining({ personId: "p1" }));
  });

  it("allows a chat.host caller to post into the host room", async () => {
    const { controller, repos } = makeController({ conversation: hostConv, access: ["chatHost"] });
    await post(controller, "host1");
    expect(repos.message.save).toHaveBeenCalledWith(expect.objectContaining({ personId: "p1", content: "hi" }));
  });

  it("still lets an author edit their own message without a participation check", async () => {
    const { controller, repos } = makeController({
      conversation: groupConv,
      groupIds: ["other"],
      message: { id: "m1", conversationId: "grp1", personId: "p1" }
    });
    await (controller as any).save({ body: [{ id: "m1", conversationId: "grp1", content: "edited" }] }, {});
    expect(repos.message.save).toHaveBeenCalledWith(expect.objectContaining({ id: "m1", personId: "p1", content: "edited" }));
  });
});
