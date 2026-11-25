import "reflect-metadata";

// Same shape as PublicChatAccess.test.ts: only infrastructure is stubbed, so the real
// MessagingBaseController / canParticipate gates run.
jest.mock("../../../../shared/infrastructure/index", () => ({ BaseController: class { constructor(_module?: string) {} } }));
jest.mock("../../repositories/index", () => ({ Repos: class {} }));
jest.mock("@churchapps/apihelper", () => ({ ArrayHelper: { getOne: jest.fn() }, EncryptionHelper: { decrypt: jest.fn() } }));
jest.mock("../../helpers/DeliveryHelper", () => ({ DeliveryHelper: { sendConversationMessages: jest.fn(), sendAttendance: jest.fn(), sendBlockedIps: jest.fn() } }));
jest.mock("../../helpers/NotificationHelper", () => ({ NotificationHelper: { checkShouldNotify: jest.fn() } }));
jest.mock("../../../../shared/helpers/Permissions", () => ({ Permissions: { content: { edit: "contentEdit" }, tasks: { view: "tasksView" }, chat: { host: "chatHost" }, people: { edit: "peopleEdit", viewConfidentialNotes: "peopleViewConfidentialNotes" } } }));
// The post gate reads the group's per-feed toggles through the membership gateway (lazy import in the controller).
type GroupRow = { id: string; discussionsEnabled?: boolean; announcementsEnabled?: boolean };
const mockLoadGroup = jest.fn(async (..._args: [string, string]): Promise<GroupRow | null> => ({ id: "g1" }));
jest.mock("../../../../shared/modules/MembershipModuleGateway.js", () => ({ getMembershipModuleGateway: () => ({ loadGroup: (...args: [string, string]) => mockLoadGroup(...args) }) }));
// workflowCard notes check the card through the doing gateway (lazy import in the controller).
type TaskRow = { id: string; assignedToType: string; assignedToId: string; createdByType?: string; createdById?: string };
const mockLoadTask = jest.fn(async (..._args: [string, string]): Promise<TaskRow | null> => null);
jest.mock("../../../../shared/modules/DoingModuleGateway.js", () => ({ getDoingModuleGateway: () => ({ loadTask: (...args: [string, string]) => mockLoadTask(...args) }) }));

import express from "express";
import { MessageController } from "../MessageController.js";
import { ConversationController } from "../ConversationController.js";
import { DeliveryHelper } from "../../helpers/DeliveryHelper.js";
import { Conversation, Message, MessageReaction, PrivateMessage } from "../../models/index.js";

interface ControllerOpts {
  conversation?: Conversation | null;
  message?: Message;
  privateMessage?: PrivateMessage;
  privateMessageByConversation?: PrivateMessage;
  personId?: string;
  churchId?: string;
  groupIds?: string[];
  leaderGroupIds?: string[];
  access?: string[];
}

type JsonResult = { obj?: unknown; status?: number; added?: boolean };
type StartBody = { groupId: string; contentType: string; contentId: string; title: string; comment: string };
const emptyRes = {} as express.Response;

const sendMock = DeliveryHelper.sendConversationMessages as jest.Mock;

const groupConv: Conversation = { id: "grp1", churchId: "c1", contentType: "group", contentId: "g1", allowAnonymousPosts: false, visibility: "public" };
const announceConv: Conversation = { id: "ann1", churchId: "c1", contentType: "groupAnnouncement", contentId: "g1", allowAnonymousPosts: false, visibility: "public" };
const dmConv: Conversation = { id: "dm1", churchId: "c1", contentType: "privateMessage", contentId: "pm1", allowAnonymousPosts: false, visibility: "hidden" };
const publicLive: Conversation = { id: "live1", churchId: "c1", contentType: "streamingLive", contentId: "svc1", allowAnonymousPosts: true, visibility: "public" };
const hostConv: Conversation = { id: "host1", churchId: "c1", contentType: "streamingLiveHost", contentId: "svc1", allowAnonymousPosts: false, visibility: "public" };

function makeController(opts: ControllerOpts = {}) {
  const repos = {
    conversation: {
      loadById: jest.fn(async () => opts.conversation ?? null),
      convertToModel: (c: Conversation) => c,
      updateStats: jest.fn(async (): Promise<void> => undefined)
    },
    message: {
      loadById: jest.fn(async () => opts.message ?? { id: "m1", conversationId: opts.conversation?.id, personId: "p2" }),
      save: jest.fn(async (m: Message) => ({ ...m, id: m.id ?? "mNew" })),
      convertAllToModel: (rows: Message[]) => rows
    },
    privateMessage: { loadById: jest.fn(async () => opts.privateMessage ?? null), loadByConversationId: jest.fn(async () => opts.privateMessageByConversation ?? null) },
    messageReaction: {
      loadOne: jest.fn(async (): Promise<MessageReaction | null> => null),
      create: jest.fn(async (m: MessageReaction) => ({ ...m, id: "rx1" })),
      delete: jest.fn(async (): Promise<void> => undefined)
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
    checkAccess: (perm: string) => (opts.access ?? []).includes(perm)
  };
  const controller = new MessageController();
  Object.assign(controller, {
    repos,
    actionWrapper: (_req: express.Request, _res: express.Response, action: (a: typeof au) => unknown) => action(au),
    json: (obj: unknown, status: number) => ({ obj, status })
  });
  return { controller, repos };
}

const post = async (controller: MessageController, conversationId: string) => (await controller.save({ body: [{ conversationId, content: "hi" }] } as express.Request<{}, {}, Message[]>, emptyRes)) as JsonResult;

beforeEach(() => {
  sendMock.mockReset();
  mockLoadGroup.mockReset();
  mockLoadGroup.mockImplementation(async () => ({ id: "g1" }));
  mockLoadTask.mockReset();
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

  it("allows a participant to post into a DM whose contentId is a person id, as clients create them", async () => {
    const personKeyed = { ...dmConv, contentId: "pY" };
    const dm = makeController({ conversation: personKeyed, privateMessageByConversation: { fromPersonId: "pY", toPersonId: "p1" } });
    await post(dm.controller, "dm1");
    expect(dm.repos.privateMessage.loadByConversationId).toHaveBeenCalledWith("c1", "dm1");
    expect(dm.repos.message.save).toHaveBeenCalledWith(expect.objectContaining({ personId: "p1" }));
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
    await controller.save({ body: [{ id: "m1", conversationId: "grp1", content: "edited" }] } as express.Request<{}, {}, Message[]>, emptyRes);
    expect(repos.message.save).toHaveBeenCalledWith(expect.objectContaining({ id: "m1", personId: "p1", content: "edited" }));
  });
});

describe("MessageController.save group feed toggles", () => {
  const react = async (controller: MessageController) => (await controller.toggleReaction("m1", { body: { emoji: "👍" } } as express.Request<{}, {}, { emoji: string }>, emptyRes)) as JsonResult;

  it("401s a non-leader member posting an announcement, allows a leader", async () => {
    const member = makeController({ conversation: announceConv, groupIds: ["g1"] });
    expect((await post(member.controller, "ann1")).status).toBe(401);
    expect(member.repos.message.save).not.toHaveBeenCalled();

    const leader = makeController({ conversation: announceConv, groupIds: ["g1"], leaderGroupIds: ["g1"] });
    await post(leader.controller, "ann1");
    expect(leader.repos.message.save).toHaveBeenCalledWith(expect.objectContaining({ personId: "p1", content: "hi" }));
  });

  it("401s a member posting to discussions when the group has discussions turned off", async () => {
    mockLoadGroup.mockImplementation(async () => ({ id: "g1", discussionsEnabled: false }));
    const { controller, repos } = makeController({ conversation: groupConv, groupIds: ["g1"], leaderGroupIds: ["g1"] });
    expect((await post(controller, "grp1")).status).toBe(401);
    expect(repos.message.save).not.toHaveBeenCalled();
    expect(mockLoadGroup).toHaveBeenCalledWith("c1", "g1");
  });

  it("401s a leader posting an announcement when the group has announcements turned off", async () => {
    mockLoadGroup.mockImplementation(async () => ({ id: "g1", announcementsEnabled: false }));
    const { controller, repos } = makeController({ conversation: announceConv, groupIds: ["g1"], leaderGroupIds: ["g1"] });
    expect((await post(controller, "ann1")).status).toBe(401);
    expect(repos.message.save).not.toHaveBeenCalled();
  });

  it("still allows discussions when only announcements are off, and vice versa", async () => {
    mockLoadGroup.mockImplementation(async () => ({ id: "g1", announcementsEnabled: false }));
    const disc = makeController({ conversation: groupConv, groupIds: ["g1"] });
    await post(disc.controller, "grp1");
    expect(disc.repos.message.save).toHaveBeenCalled();

    mockLoadGroup.mockImplementation(async () => ({ id: "g1", discussionsEnabled: false }));
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
    mockLoadGroup.mockImplementation(async () => ({ id: "g1", discussionsEnabled: false, announcementsEnabled: false }));
    const { controller, repos } = makeController({ conversation: announceConv, access: ["contentEdit"] });
    await post(controller, "ann1");
    expect(repos.message.save).toHaveBeenCalled();
  });

  it("still lets a member react in a feed they cannot post to", async () => {
    mockLoadGroup.mockImplementation(async () => ({ id: "g1", discussionsEnabled: false }));
    const disc = makeController({ conversation: groupConv, groupIds: ["g1"], message: { id: "m1", conversationId: "grp1", personId: "p2" } });
    expect((await react(disc.controller)).added).toBe(true);
    expect(disc.repos.messageReaction.create).toHaveBeenCalled();

    const ann = makeController({ conversation: announceConv, groupIds: ["g1"], message: { id: "m1", conversationId: "ann1", personId: "p2" } });
    expect((await react(ann.controller)).added).toBe(true);
    expect(ann.repos.messageReaction.create).toHaveBeenCalled();
  });
});

describe("ConversationController seeding group feeds", () => {
  function makeConversationController(opts: ControllerOpts = {}) {
    const repos = {
      conversation: {
        save: jest.fn(async (c: Conversation) => ({ ...c, id: c.id || "new1" })),
        updateStats: jest.fn(async (): Promise<void> => undefined),
        convertToModel: (c: Conversation) => c,
        convertAllToModel: (rows: Conversation[]) => rows
      },
      message: { save: jest.fn(async (m: Message) => ({ ...m, id: "mNew" })) }
    };
    const au = {
      id: "u1",
      churchId: opts.churchId ?? "c1",
      personId: "p1",
      firstName: "Test",
      lastName: "User",
      groupIds: opts.groupIds ?? [],
      leaderGroupIds: opts.leaderGroupIds ?? [],
      checkAccess: (perm: string) => (opts.access ?? []).includes(perm)
    };
    const controller = new ConversationController();
    Object.assign(controller, {
      repos,
      actionWrapper: (_req: express.Request, _res: express.Response, action: (a: typeof au) => unknown) => action(au),
      json: (obj: unknown, status: number) => ({ obj, status })
    });
    return { controller, repos };
  }
  const seed = async (controller: ConversationController, contentType: string) => (await controller.save({ body: [{ contentType, contentId: "g1", groupId: "g1", title: "t", visibility: "hidden" }] } as express.Request<{}, {}, Conversation[]>, emptyRes)) as JsonResult;
  const start = async (controller: ConversationController, contentType: string) => (await controller.start({ body: { contentType, contentId: "g1", groupId: "g1", title: "t", comment: "hi" } } as express.Request<{}, {}, StartBody>, emptyRes)) as JsonResult;

  it("401s a non-leader member creating the announcement conversation", async () => {
    const { controller, repos } = makeConversationController({ groupIds: ["g1"] });
    expect((await seed(controller, "groupAnnouncement")).status).toBe(401);
    expect((await start(controller, "groupAnnouncement")).status).toBe(401);
    expect(repos.conversation.save).not.toHaveBeenCalled();
  });

  it("401s a member creating the discussion conversation when discussions are off", async () => {
    mockLoadGroup.mockImplementation(async () => ({ id: "g1", discussionsEnabled: false }));
    const { controller, repos } = makeConversationController({ groupIds: ["g1"] });
    expect((await seed(controller, "group")).status).toBe(401);
    expect((await start(controller, "group")).status).toBe(401);
    expect(repos.conversation.save).not.toHaveBeenCalled();
  });

  it("401s a signed-out caller creating any conversation", async () => {
    const { controller, repos } = makeConversationController({ churchId: "" });
    const res = (await controller.save({ body: [{ contentType: "privateMessage", contentId: "x", title: "anon" }] } as express.Request<{}, {}, Conversation[]>, emptyRes)) as JsonResult;
    expect(res.status).toBe(401);
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

describe("MessageController.save workflowCard notes", () => {
  const cardConv: Conversation = { id: "card1", churchId: "c1", contentType: "workflowCard", contentId: "t1", allowAnonymousPosts: false, visibility: "hidden" };

  it("lets the person the card is assigned to post without content.edit", async () => {
    mockLoadTask.mockImplementation(async () => ({ id: "t1", assignedToType: "person", assignedToId: "p1" }));
    const { controller, repos } = makeController({ conversation: cardConv });
    await post(controller, "card1");
    expect(repos.message.save).toHaveBeenCalled();
    expect(mockLoadTask).toHaveBeenCalledWith("c1", "t1");
  });

  it("lets a member of the assigned group post", async () => {
    mockLoadTask.mockImplementation(async () => ({ id: "t1", assignedToType: "group", assignedToId: "g9" }));
    const { controller, repos } = makeController({ conversation: cardConv, groupIds: ["g9"] });
    await post(controller, "card1");
    expect(repos.message.save).toHaveBeenCalled();
  });

  it("lets tasks.view staff post", async () => {
    mockLoadTask.mockImplementation(async () => ({ id: "t1", assignedToType: "person", assignedToId: "pX" }));
    const { controller, repos } = makeController({ conversation: cardConv, access: ["tasksView"] });
    await post(controller, "card1");
    expect(repos.message.save).toHaveBeenCalled();
  });

  it("401s an unrelated user", async () => {
    mockLoadTask.mockImplementation(async () => ({ id: "t1", assignedToType: "person", assignedToId: "pX", createdByType: "person", createdById: "pY" }));
    const { controller, repos } = makeController({ conversation: cardConv, groupIds: ["g1"] });
    expect((await post(controller, "card1")).status).toBe(401);
    expect(repos.message.save).not.toHaveBeenCalled();
  });

  it("401s when the card is missing", async () => {
    const { controller, repos } = makeController({ conversation: cardConv, access: ["tasksView"] });
    expect((await post(controller, "card1")).status).toBe(401);
    expect(repos.message.save).not.toHaveBeenCalled();
  });
});

describe("MessageController.save task notes", () => {
  const taskConv: Conversation = { id: "task1", churchId: "c1", contentType: "task", contentId: "t1", allowAnonymousPosts: false, visibility: "hidden" };

  it("lets the assignee post without content.edit", async () => {
    mockLoadTask.mockImplementation(async () => ({ id: "t1", assignedToType: "person", assignedToId: "p1" }));
    const { controller, repos } = makeController({ conversation: taskConv });
    await post(controller, "task1");
    expect(repos.message.save).toHaveBeenCalled();
    expect(mockLoadTask).toHaveBeenCalledWith("c1", "t1");
  });

  it("lets a member of the assigned group post", async () => {
    mockLoadTask.mockImplementation(async () => ({ id: "t1", assignedToType: "group", assignedToId: "g9" }));
    const { controller, repos } = makeController({ conversation: taskConv, groupIds: ["g9"] });
    await post(controller, "task1");
    expect(repos.message.save).toHaveBeenCalled();
  });

  it("401s an unrelated user", async () => {
    mockLoadTask.mockImplementation(async () => ({ id: "t1", assignedToType: "person", assignedToId: "pX", createdByType: "person", createdById: "pY" }));
    const { controller, repos } = makeController({ conversation: taskConv, groupIds: ["g1"] });
    expect((await post(controller, "task1")).status).toBe(401);
    expect(repos.message.save).not.toHaveBeenCalled();
  });
});
