import "reflect-metadata";

// Same scaffolding as PublicChatAccess.test.ts - the real canReadConversation runs.
jest.mock("../../../../shared/infrastructure/index", () => ({ BaseController: class { constructor(_module?: string) {} } }));
jest.mock("../../repositories/index", () => ({ Repos: class {} }));
jest.mock("@churchapps/apihelper", () => ({ ArrayHelper: { getOne: jest.fn() }, EncryptionHelper: { decrypt: jest.fn((s: string) => "decrypted:" + s) } }));
jest.mock("../../helpers/DeliveryHelper", () => ({ DeliveryHelper: { sendConversationMessages: jest.fn(), sendAttendance: jest.fn(), sendBlockedIps: jest.fn() } }));
jest.mock("../../helpers/NotificationHelper", () => ({ NotificationHelper: { checkShouldNotify: jest.fn() } }));
jest.mock("../../../../shared/helpers/Permissions", () => ({ Permissions: { content: { edit: "contentEdit" }, tasks: { view: "tasksView" }, chat: { host: "chatHost" }, people: { edit: "peopleEdit", viewConfidentialNotes: "peopleViewConfidentialNotes" } } }));
jest.mock("../../../../shared/modules/MembershipModuleGateway.js", () => ({ getMembershipModuleGateway: () => ({ loadChurch: jest.fn(async () => ({ id: "c1" })) }) }));

// workflowCard notes check the card through the doing gateway (lazy import in the controller).
const mockLoadTask = jest.fn(async () => null as any);
jest.mock("../../../../shared/modules/DoingModuleGateway.js", () => ({ getDoingModuleGateway: () => ({ loadTask: (...args: any[]) => mockLoadTask(...(args as [])) }) }));

import { ConversationController } from "../ConversationController.js";
import { MessageController } from "../MessageController.js";
import { ConnectionController } from "../ConnectionController.js";

const groupConv = { id: "grp1", churchId: "c1", contentType: "group", contentId: "g1", allowAnonymousPosts: false, visibility: "public" };
const announceConv = { id: "ann1", churchId: "c1", contentType: "groupAnnouncement", contentId: "g1", allowAnonymousPosts: false, visibility: "public" };
const dmConv = { id: "dm1", churchId: "c1", contentType: "privateMessage", contentId: "pm1", allowAnonymousPosts: false, visibility: "hidden" };
const hostConv = { id: "host1", churchId: "c1", contentType: "streamingLiveHost", contentId: "svc1", allowAnonymousPosts: false, visibility: "public" };

const au = (opts: any = {}) => ({
  id: "u1",
  churchId: "c1",
  personId: opts.personId ?? "p1",
  groupIds: opts.groupIds ?? [],
  leaderGroupIds: opts.leaderGroupIds ?? [],
  checkAccess: (perm: any) => (opts.access ?? []).includes(perm)
});

const MEMBER = au({ groupIds: ["g1"] });
const NON_MEMBER = au({ groupIds: ["other"] });
const LEADER = au({ leaderGroupIds: ["g1"] });
const STAFF = au({ access: ["contentEdit"] });
const HOST = au({ access: ["chatHost"] });

function repos(opts: any = {}) {
  return {
    conversation: {
      loadById: jest.fn(async () => opts.byId ?? null),
      loadByIdOnly: jest.fn(async () => opts.byIdOnly ?? opts.byId ?? null),
      loadByIds: jest.fn(async () => opts.byIds ?? []),
      loadForContent: jest.fn(async () => opts.forContent ?? []),
      loadCurrent: jest.fn(async () => opts.current ?? null),
      loadPosts: jest.fn(async () => []),
      save: jest.fn(async (c: any) => ({ ...c, id: c.id || "new1" })),
      updateStats: jest.fn(async () => undefined),
      convertToModel: (c: any) => c,
      convertAllToModel: (rows: any[]) => rows
    },
    message: {
      loadForConversation: jest.fn(async () => opts.messages ?? [{ id: "m1" }]),
      loadForConversationsPaginated: jest.fn(async (_churchId: string, ids: string[]) => new Map(ids.map((id) => [id, opts.messages ?? [{ id: "m1" }]]))),
      loadByIds: jest.fn(async () => []),
      convertToModel: (m: any) => m,
      convertAllToModel: (rows: any[]) => rows
    },
    messageReaction: { loadForMessages: jest.fn(async () => []) },
    connection: {
      loadForConversation: jest.fn(async () => []),
      loadById: jest.fn(async () => null),
      save: jest.fn(async (c: any) => ({ ...c, id: "cn1" })),
      delete: jest.fn(async () => undefined),
      convertToModel: (c: any) => c,
      convertAllToModel: (rows: any[]) => rows
    },
    privateMessage: { loadById: jest.fn(async () => opts.privateMessage ?? null) }
  };
}

function attach(controller: any, r: any, principal: any) {
  controller.repos = r;
  controller.actionWrapper = (_req: any, _res: any, action: any) => action(principal);
  controller.actionWrapperAnon = (_req: any, _res: any, action: any) => action();
  controller.authUser = () => principal;
  controller.json = (obj: any, status: number) => ({ obj, status });
  return controller;
}

describe("ConversationController.forContent group membership", () => {
  const call = (principal: any, contentType = "group") => {
    const r = repos({ forContent: [contentType === "group" ? groupConv : announceConv] });
    const c = attach(new ConversationController(), r, principal);
    return { r, result: (c as any).forContent(contentType, "g1", { query: {} }, {}) };
  };

  it("401s a non-member and never loads the conversations", async () => {
    const { r, result } = call(NON_MEMBER);
    expect((await result).status).toBe(401);
    expect(r.conversation.loadForContent).not.toHaveBeenCalled();
  });

  it("allows a member, a leader, and content.edit staff", async () => {
    for (const principal of [MEMBER, LEADER, STAFF]) {
      expect(await call(principal).result).toEqual([groupConv]);
    }
  });

  it("gates groupAnnouncement the same way", async () => {
    expect((await call(NON_MEMBER, "groupAnnouncement").result).status).toBe(401);
    expect(await call(MEMBER, "groupAnnouncement").result).toEqual([announceConv]);
  });

  it("401s a non-host asking for the host room and allows chat.host", async () => {
    const nonHost = repos({ forContent: [hostConv] });
    expect((await (attach(new ConversationController(), nonHost, MEMBER) as any).forContent("streamingLiveHost", "svc1", { query: {} }, {})).status).toBe(401);
    const host = repos({ forContent: [hostConv] });
    expect(await (attach(new ConversationController(), host, HOST) as any).forContent("streamingLiveHost", "svc1", { query: {} }, {})).toEqual([hostConv]);
  });
});

describe("ConversationController.loadByContent / current on the host room", () => {
  it("401s loadByContent for a non-host and returns rows for a host", async () => {
    const nonHost = repos({ forContent: [hostConv] });
    expect((await (attach(new ConversationController(), nonHost, MEMBER) as any).loadByContent("c1", "streamingLiveHost", "svc1", {}, {})).status).toBe(401);
    const host = repos({ forContent: [hostConv] });
    expect(await (attach(new ConversationController(), host, HOST) as any).loadByContent("c1", "streamingLiveHost", "svc1", {}, {})).toEqual([hostConv]);
  });

  it("401s current for a non-host and returns the room for a host", async () => {
    const nonHost = repos({ current: hostConv });
    expect((await (attach(new ConversationController(), nonHost, MEMBER) as any).current("c1", "streamingLiveHost", "svc1", {}, {})).status).toBe(401);
    expect(nonHost.conversation.loadCurrent).not.toHaveBeenCalled();
    const host = repos({ current: hostConv });
    expect(await (attach(new ConversationController(), host, HOST) as any).current("c1", "streamingLiveHost", "svc1", {}, {})).toEqual(hostConv);
  });

  it("401s current for a group the caller does not belong to", async () => {
    const r = repos({ current: groupConv });
    expect((await (attach(new ConversationController(), r, NON_MEMBER) as any).current("c1", "group", "g1", {}, {})).status).toBe(401);
    const ok = repos({ current: groupConv });
    expect(await (attach(new ConversationController(), ok, MEMBER) as any).current("c1", "group", "g1", {}, {})).toEqual(groupConv);
  });
});

describe("ConversationController.getTimelineByIds", () => {
  const call = (principal: any) => {
    const r = repos({ byIds: [groupConv, dmConv] });
    return (attach(new ConversationController(), r, principal) as any).getTimelineByIds({ query: { ids: "grp1,dm1" } }, {});
  };

  it("drops conversations the caller cannot read", async () => {
    expect(await call(NON_MEMBER)).toEqual([]);
  });

  it("keeps the group for a member and everything for staff", async () => {
    expect(await call(MEMBER)).toEqual([groupConv]);
    expect(await call(STAFF)).toEqual([groupConv, dmConv]);
  });
});

describe("MessageController read paths", () => {
  const loadByConversation = (principal: any, opts: any) => {
    const r = repos(opts);
    const c = attach(new MessageController(), r, principal);
    return { r, result: (c as any).loadByConversation(opts.byId.id, {}, {}) };
  };

  it("401s a non-member reading a group conversation and allows a member", async () => {
    const denied = loadByConversation(NON_MEMBER, { byId: groupConv });
    expect((await denied.result).status).toBe(401);
    expect(denied.r.message.loadForConversation).not.toHaveBeenCalled();
    expect(await loadByConversation(MEMBER, { byId: groupConv }).result).toEqual([{ id: "m1" }]);
  });

  it("401s a DM for a non-participant and allows a participant", async () => {
    const denied = loadByConversation(NON_MEMBER, { byId: dmConv, privateMessage: { fromPersonId: "pX", toPersonId: "pY" } });
    expect((await denied.result).status).toBe(401);
    expect(await loadByConversation(NON_MEMBER, { byId: dmConv, privateMessage: { fromPersonId: "p1", toPersonId: "pY" } }).result).toEqual([{ id: "m1" }]);
  });

  it("401s catchup on the host room for a non-host and allows a host", async () => {
    const denied = repos({ byId: hostConv });
    expect((await (attach(new MessageController(), denied, MEMBER) as any).catchup("c1", "host1", {}, {})).status).toBe(401);
    const allowed = repos({ byId: hostConv });
    expect(await (attach(new MessageController(), allowed, HOST) as any).catchup("c1", "host1", {}, {})).toEqual([{ id: "m1" }]);
  });
});

describe("ConnectionController.save on the host room", () => {
  it("401s a non-host and lets a host join", async () => {
    const denied = repos({ byIdOnly: hostConv });
    expect((await (attach(new ConnectionController(), denied, MEMBER) as any).save({ body: [{ conversationId: "host1", socketId: "s1" }] }, {})).status).toBe(401);
    expect(denied.connection.save).not.toHaveBeenCalled();
    const allowed = repos({ byIdOnly: hostConv });
    await (attach(new ConnectionController(), allowed, HOST) as any).save({ body: [{ conversationId: "host1", socketId: "s1" }] }, {});
    expect(allowed.connection.save).toHaveBeenCalledWith(expect.objectContaining({ churchId: "c1", conversationId: "host1" }));
  });

  it("401s a non-member joining a group room", async () => {
    const r = repos({ byIdOnly: groupConv });
    expect((await (attach(new ConnectionController(), r, NON_MEMBER) as any).save({ body: [{ conversationId: "grp1", socketId: "s1" }] }, {})).status).toBe(401);
    expect(r.connection.save).not.toHaveBeenCalled();
  });
});

describe("cross-church and ownership gates", () => {
  const otherChurchNote = { id: "note1", churchId: "c2", contentType: "person", contentId: "pv1", allowAnonymousPosts: false, visibility: "hidden" };
  const NOTES_STAFF = au({ access: ["peopleEdit"] });

  it("401s another church's person-note conversation even with people.edit", async () => {
    const r = repos({ byId: otherChurchNote });
    expect((await (attach(new ConversationController(), r, NOTES_STAFF) as any).loadById("c2", "note1", {}, {})).status).toBe(401);
  });

  it("401s listing another church's person notes by content", async () => {
    const r = repos({ forContent: [otherChurchNote] });
    expect((await (attach(new ConversationController(), r, NOTES_STAFF) as any).loadByContent("c2", "person", "pv1", {}, {})).status).toBe(401);
  });

  it("401s /posts/group for a non-member", async () => {
    const r = repos();
    expect((await (attach(new ConversationController(), r, NON_MEMBER) as any).getPostsForGroup("g1", {}, {})).status).toBe(401);
    expect(r.conversation.loadPosts).not.toHaveBeenCalled();
  });

  it("401s a member rewriting an existing DM conversation", async () => {
    const r = repos({ byId: dmConv });
    const result = await (attach(new ConversationController(), r, MEMBER) as any).save({ body: [{ id: "dm1", contentType: "group", contentId: "g1", groupId: "g1" }] }, {});
    expect(result.status).toBe(401);
    expect(r.conversation.save).not.toHaveBeenCalled();
  });

  it("forces the connection personId to the caller", async () => {
    const r = repos({ byIdOnly: groupConv });
    await (attach(new ConnectionController(), r, MEMBER) as any).save({ body: [{ conversationId: "grp1", socketId: "s1", personId: "pVictim" }] }, {});
    expect(r.connection.save).toHaveBeenCalledWith(expect.objectContaining({ personId: "p1" }));
  });
});

// forContent used to await one messages query per conversation in turn; a busy group feed paid that N times.
describe("ConversationController.forContent message loading", () => {
  const convs = [
    { id: "cv1", churchId: "c1", contentType: "group", contentId: "g1" },
    { id: "cv2", churchId: "c1", contentType: "group", contentId: "g1" },
    { id: "cv3", churchId: "c1", contentType: "group", contentId: "g1" }
  ];
  const pages: Record<string, any[]> = {
    cv1: [{ id: "m12", conversationId: "cv1" }, { id: "m11", conversationId: "cv1" }],
    cv3: [{ id: "m31", conversationId: "cv3" }]
  };
  const setup = () => {
    const r: any = repos({ forContent: convs.map((c) => ({ ...c })) });
    r.message.loadForConversationsPaginated = jest.fn(async (_churchId: string, ids: string[]) => new Map(ids.filter((id) => pages[id]).map((id) => [id, pages[id]])));
    r.messageReaction.loadForMessages = jest.fn(async () => [{ messageId: "m11", emoji: "👍", personId: "p1" }]);
    const c = attach(new ConversationController(), r, MEMBER);
    return { r, run: () => (c as any).forContent("group", "g1", { query: { page: "2", limit: "5" } }, {}) };
  };

  it("loads every conversation's page in one repo call with the caller's church, page and limit", async () => {
    const { r, run } = setup();
    await run();
    expect(r.message.loadForConversationsPaginated).toHaveBeenCalledTimes(1);
    expect(r.message.loadForConversationsPaginated).toHaveBeenCalledWith("c1", ["cv1", "cv2", "cv3"], 2, 5);
  });

  it("returns the same shape as before: conversations in order, their messages, empty ones dropped, reactions attached", async () => {
    const { run } = setup();
    expect(await run()).toEqual([
      {
        ...convs[0],
        messages: [
          { id: "m12", conversationId: "cv1", reactions: [] },
          { id: "m11", conversationId: "cv1", reactions: [{ emoji: "👍", count: 1, mine: true }] }
        ]
      },
      { ...convs[2], messages: [{ id: "m31", conversationId: "cv3", reactions: [] }] }
    ]);
  });
});

describe("workflowCard notes are readable only by people who can open the card", () => {
  const cardConv = { id: "card1", churchId: "c1", contentType: "workflowCard", contentId: "t1", allowAnonymousPosts: false, visibility: "hidden" };
  const ASSIGNEE = au({ personId: "p9" });
  const TASK_VIEWER = au({ access: ["tasksView"] });
  beforeEach(() => mockLoadTask.mockImplementation(async () => ({ id: "t1", assignedToType: "person", assignedToId: "p9" })));

  const readers: [string, (principal: any) => Promise<any>][] = [
    ["messages/conversation/:id", (p) => (attach(new MessageController(), repos({ byId: cardConv }), p) as any).loadByConversation("card1", {}, {})],
    ["messages/catchup/:churchId/:id", (p) => (attach(new MessageController(), repos({ byId: cardConv }), p) as any).catchup("c1", "card1", {}, {})],
    ["conversations/messages/workflowCard/:taskId", (p) => (attach(new ConversationController(), repos({ forContent: [cardConv] }), p) as any).forContent("workflowCard", "t1", { query: {} }, {})],
    ["conversations/:churchId/workflowCard/:taskId", (p) => (attach(new ConversationController(), repos({ forContent: [cardConv] }), p) as any).loadByContent("c1", "workflowCard", "t1", {}, {})],
    ["conversations/current/:churchId/workflowCard/:taskId", (p) => (attach(new ConversationController(), repos({ current: cardConv }), p) as any).current("c1", "workflowCard", "t1", {}, {})]
  ];

  it.each(readers)("%s refuses a church member with no tie to the card", async (_name, read) => {
    expect((await read(MEMBER)).status).toBe(401);
  });

  it.each(readers)("%s still serves the assignee and tasks.view staff", async (_name, read) => {
    for (const principal of [ASSIGNEE, TASK_VIEWER]) {
      const result = await read(principal);
      expect(result?.status).not.toBe(401);
    }
  });
});
