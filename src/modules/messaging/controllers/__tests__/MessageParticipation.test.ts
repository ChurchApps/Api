import "reflect-metadata";

// Same shape as PublicChatAccess.test.ts: only infrastructure is stubbed, so the real
// MessagingBaseController / canParticipate gates run.
jest.mock("../../../../shared/infrastructure/index", () => ({ BaseController: class { constructor(_module?: string) {} } }));
jest.mock("../../repositories/index", () => ({ Repos: class {} }));
jest.mock("@churchapps/apihelper", () => ({ ArrayHelper: { getOne: jest.fn() }, EncryptionHelper: { decrypt: jest.fn() } }));
jest.mock("../../helpers/DeliveryHelper", () => ({ DeliveryHelper: { sendConversationMessages: jest.fn(), sendAttendance: jest.fn(), sendBlockedIps: jest.fn() } }));
jest.mock("../../helpers/NotificationHelper", () => ({ NotificationHelper: { checkShouldNotify: jest.fn() } }));
jest.mock("../../../../shared/helpers/Permissions", () => ({ Permissions: { content: { edit: "contentEdit" }, chat: { host: "chatHost" }, people: { edit: "peopleEdit", viewConfidentialNotes: "peopleViewConfidentialNotes" } } }));
// The post gate reads the group's per-feed toggles through the membership gateway (lazy import in the controller).
const mockLoadGroup = jest.fn(async () => ({ id: "g1" }) as any);
jest.mock("../../../../shared/modules/MembershipModuleGateway.js", () => ({ getMembershipModuleGateway: () => ({ loadGroup: (...args: any[]) => mockLoadGroup(...(args as [])) }) }));

import { MessageController } from "../MessageController.js";
import { ConversationController } from "../ConversationController.js";
import { DeliveryHelper } from "../../helpers/DeliveryHelper.js";

const sendMock = DeliveryHelper.sendConversationMessages as jest.Mock;

const groupConv = { id: "grp1", churchId: "c1", contentType: "group", contentId: "g1", allowAnonymousPosts: false, visibility: "public" };
const announceConv = { id: "ann1", churchId: "c1", contentType: "groupAnnouncement", contentId: "g1", allowAnonymousPosts: false, visibility: "public" };
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
    privateMessage: { loadById: jest.fn(async () => opts.privateMessage ?? null) },
    messageReaction: {
      loadOne: jest.fn(async () => null),
      create: jest.fn(async (m: any) => ({ ...m, id: "rx1" })),
      delete: jest.fn(async () => undefined)
    }
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

beforeEach(() => {
  sendMock.mockReset();
  mockLoadGroup.mockReset();
  mockLoadGroup.mockImplementation(async () => ({ id: "g1" }) as any);
});

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

describe("MessageController.save group feed toggles", () => {
  const react = (controller: any) => controller.toggleReaction("m1", { body: { emoji: "👍" } }, {});

  it("401s a non-leader member posting an announcement, allows a leader", async () => {
    const member = makeController({ conversation: announceConv, groupIds: ["g1"] });
    expect((await post(member.controller, "ann1")).status).toBe(401);
    expect(member.repos.message.save).not.toHaveBeenCalled();

    const leader = makeController({ conversation: announceConv, groupIds: ["g1"], leaderGroupIds: ["g1"] });
    await post(leader.controller, "ann1");
    expect(leader.repos.message.save).toHaveBeenCalledWith(expect.objectContaining({ personId: "p1", content: "hi" }));
  });

  it("401s a member posting to discussions when the group has discussions turned off", async () => {
    mockLoadGroup.mockImplementation(async () => ({ id: "g1", discussionsEnabled: false }) as any);
    const { controller, repos } = makeController({ conversation: groupConv, groupIds: ["g1"], leaderGroupIds: ["g1"] });
    expect((await post(controller, "grp1")).status).toBe(401);
    expect(repos.message.save).not.toHaveBeenCalled();
    expect(mockLoadGroup).toHaveBeenCalledWith("c1", "g1");
  });

  it("401s a leader posting an announcement when the group has announcements turned off", async () => {
    mockLoadGroup.mockImplementation(async () => ({ id: "g1", announcementsEnabled: false }) as any);
    const { controller, repos } = makeController({ conversation: announceConv, groupIds: ["g1"], leaderGroupIds: ["g1"] });
    expect((await post(controller, "ann1")).status).toBe(401);
    expect(repos.message.save).not.toHaveBeenCalled();
  });

  it("still allows discussions when only announcements are off, and vice versa", async () => {
    mockLoadGroup.mockImplementation(async () => ({ id: "g1", announcementsEnabled: false }) as any);
    const disc = makeController({ conversation: groupConv, groupIds: ["g1"] });
    await post(disc.controller, "grp1");
    expect(disc.repos.message.save).toHaveBeenCalled();

    mockLoadGroup.mockImplementation(async () => ({ id: "g1", discussionsEnabled: false }) as any);
    const ann = makeController({ conversation: announceConv, groupIds: ["g1"], leaderGroupIds: ["g1"] });
    await post(ann.controller, "ann1");
    expect(ann.repos.message.save).toHaveBeenCalled();
  });

  it("401s a post when the group no longer exists", async () => {
    mockLoadGroup.mockImplementation(async () => null);
    const { controller, repos } = makeController({ conversation: groupConv, groupIds: ["g1"] });
    expect((await post(controller, "grp1")).status).toBe(401);
    expect(repos.message.save).not.toHaveBeenCalled();
  });

  it("lets content.edit staff post regardless of the toggles", async () => {
    mockLoadGroup.mockImplementation(async () => ({ id: "g1", discussionsEnabled: false, announcementsEnabled: false }) as any);
    const { controller, repos } = makeController({ conversation: announceConv, access: ["contentEdit"] });
    await post(controller, "ann1");
    expect(repos.message.save).toHaveBeenCalled();
  });

  it("still lets a member react in a feed they cannot post to", async () => {
    mockLoadGroup.mockImplementation(async () => ({ id: "g1", discussionsEnabled: false }) as any);
    const disc = makeController({ conversation: groupConv, groupIds: ["g1"], message: { id: "m1", conversationId: "grp1", personId: "p2" } });
    expect((await react(disc.controller)).added).toBe(true);
    expect(disc.repos.messageReaction.create).toHaveBeenCalled();

    const ann = makeController({ conversation: announceConv, groupIds: ["g1"], message: { id: "m1", conversationId: "ann1", personId: "p2" } });
    expect((await react(ann.controller)).added).toBe(true);
    expect(ann.repos.messageReaction.create).toHaveBeenCalled();
  });
});

describe("ConversationController seeding group feeds", () => {
  function makeConversationController(opts: any = {}) {
    const repos: any = {
      conversation: {
        save: jest.fn(async (c: any) => ({ ...c, id: c.id || "new1" })),
        updateStats: jest.fn(async () => undefined),
        convertToModel: (c: any) => c,
        convertAllToModel: (rows: any[]) => rows
      },
      message: { save: jest.fn(async (m: any) => ({ ...m, id: "mNew" })) }
    };
    const au = {
      id: "u1",
      churchId: "c1",
      personId: "p1",
      firstName: "Test",
      lastName: "User",
      groupIds: opts.groupIds ?? [],
      leaderGroupIds: opts.leaderGroupIds ?? [],
      checkAccess: (perm: any) => (opts.access ?? []).includes(perm)
    };
    const controller = new ConversationController();
    (controller as any).repos = repos;
    (controller as any).actionWrapper = (_req: any, _res: any, action: any) => action(au);
    (controller as any).json = (obj: any, status: number) => ({ obj, status });
    return { controller, repos };
  }
  const seed = (controller: any, contentType: string) => controller.save({ body: [{ contentType, contentId: "g1", groupId: "g1", title: "t", visibility: "hidden" }] }, {});
  const start = (controller: any, contentType: string) => controller.start({ body: { contentType, contentId: "g1", groupId: "g1", title: "t", comment: "hi" } }, {});

  it("401s a non-leader member creating the announcement conversation", async () => {
    const { controller, repos } = makeConversationController({ groupIds: ["g1"] });
    expect((await seed(controller, "groupAnnouncement")).status).toBe(401);
    expect((await start(controller, "groupAnnouncement")).status).toBe(401);
    expect(repos.conversation.save).not.toHaveBeenCalled();
  });

  it("401s a member creating the discussion conversation when discussions are off", async () => {
    mockLoadGroup.mockImplementation(async () => ({ id: "g1", discussionsEnabled: false }) as any);
    const { controller, repos } = makeConversationController({ groupIds: ["g1"] });
    expect((await seed(controller, "group")).status).toBe(401);
    expect((await start(controller, "group")).status).toBe(401);
    expect(repos.conversation.save).not.toHaveBeenCalled();
  });

  it("401s a non-member creating a group conversation", async () => {
    const { controller, repos } = makeConversationController({ groupIds: ["other"] });
    expect((await seed(controller, "group")).status).toBe(401);
    expect(repos.conversation.save).not.toHaveBeenCalled();
  });

  it("lets a member seed discussions and a leader seed announcements when enabled", async () => {
    const member = makeConversationController({ groupIds: ["g1"] });
    await seed(member.controller, "group");
    expect(member.repos.conversation.save).toHaveBeenCalledWith(expect.objectContaining({ contentType: "group", churchId: "c1" }));

    const leader = makeConversationController({ groupIds: ["g1"], leaderGroupIds: ["g1"] });
    await start(leader.controller, "groupAnnouncement");
    expect(leader.repos.conversation.save).toHaveBeenCalledWith(expect.objectContaining({ contentType: "groupAnnouncement" }));
    expect(leader.repos.message.save).toHaveBeenCalled();
  });
});
