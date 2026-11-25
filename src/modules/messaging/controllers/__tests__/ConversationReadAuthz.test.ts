import "reflect-metadata";
import type { Request, Response } from "express";
import type { AuthenticatedUser } from "@churchapps/apihelper";
import { Connection, Conversation, Message, MessageReaction, PrivateMessage } from "../../models/index.js";

// The raw event and task rows the content and doing gateways hand back, as far as the notes gates read them.
interface EventRow { id: string; groupId?: string; notesViewRole?: string; notesPostRole?: string }
interface TaskRow { id: string; assignedToType?: string; assignedToId?: string }

// Same scaffolding as PublicChatAccess.test.ts - the real canReadConversation runs.
jest.mock("../../../../shared/infrastructure/index", () => ({ BaseController: class { constructor(_module?: string) {} async writeAuditLog() {} } }));
jest.mock("../../repositories/index", () => ({ Repos: class {} }));
jest.mock("@churchapps/apihelper", () => ({ ArrayHelper: { getOne: jest.fn() }, EncryptionHelper: { decrypt: jest.fn((s: string) => "decrypted:" + s) } }));
jest.mock("../../helpers/DeliveryHelper", () => ({ DeliveryHelper: { sendConversationMessages: jest.fn(), sendAttendance: jest.fn(), sendBlockedIps: jest.fn() } }));
jest.mock("../../helpers/NotificationHelper", () => ({ NotificationHelper: { checkShouldNotify: jest.fn() } }));
jest.mock("../../../../shared/helpers/Permissions", () => ({ Permissions: { content: { edit: "contentEdit" }, tasks: { view: "tasksView" }, chat: { host: "chatHost" }, people: { edit: "peopleEdit", viewConfidentialNotes: "peopleViewConfidentialNotes" }, groups: { edit: "groupsEdit" }, groupMembers: { view: "groupMembersView" }, calendars: { admin: "calendarsAdmin" } } }));
const mockLoadEvent = jest.fn<Promise<EventRow | null>, unknown[]>(async () => null);
jest.mock("../../../../shared/modules/ContentModuleGateway.js", () => ({ getContentModuleGateway: () => ({ loadEvent: (...args: unknown[]) => mockLoadEvent(...args) }) }));
jest.mock("../../../../shared/modules/MembershipModuleGateway.js", () => ({ getMembershipModuleGateway: () => ({ loadChurch: jest.fn(async () => ({ id: "c1" })) }) }));

// workflowCard notes check the card through the doing gateway (lazy import in the controller).
const mockLoadTask = jest.fn<Promise<TaskRow | null>, unknown[]>(async () => null);
jest.mock("../../../../shared/modules/DoingModuleGateway.js", () => ({ getDoingModuleGateway: () => ({ loadTask: (...args: unknown[]) => mockLoadTask(...args) }) }));

import { ConversationController } from "../ConversationController.js";
import { MessageController } from "../MessageController.js";
import { ConnectionController } from "../ConnectionController.js";

const groupConv = { id: "grp1", churchId: "c1", contentType: "group", contentId: "g1", allowAnonymousPosts: false, visibility: "public" };
const announceConv = { id: "ann1", churchId: "c1", contentType: "groupAnnouncement", contentId: "g1", allowAnonymousPosts: false, visibility: "public" };
const dmConv = { id: "dm1", churchId: "c1", contentType: "privateMessage", contentId: "pm1", allowAnonymousPosts: false, visibility: "hidden" };
const hostConv = { id: "host1", churchId: "c1", contentType: "streamingLiveHost", contentId: "svc1", allowAnonymousPosts: false, visibility: "public" };

interface PrincipalOpts { personId?: string; groupIds?: string[]; leaderGroupIds?: string[]; access?: string[] }

const au = (opts: PrincipalOpts = {}) => ({
  id: "u1",
  churchId: "c1",
  personId: opts.personId ?? "p1",
  groupIds: opts.groupIds ?? [],
  leaderGroupIds: opts.leaderGroupIds ?? [],
  // The mocked Permissions hand checkAccess plain strings.
  checkAccess: (perm: unknown) => (opts.access ?? []).some((a) => a === perm)
}) as AuthenticatedUser;

const MEMBER = au({ groupIds: ["g1"] });
const NON_MEMBER = au({ groupIds: ["other"] });
const LEADER = au({ leaderGroupIds: ["g1"] });
const STAFF = au({ access: ["contentEdit"] });
const HOST = au({ access: ["chatHost"] });

interface RepoOpts {
  byId?: Conversation;
  byIdOnly?: Conversation;
  byIds?: Conversation[];
  forContent?: Conversation[];
  current?: Conversation;
  posts?: Conversation[];
  messages?: Message[];
  privateMessage?: PrivateMessage;
  privateMessageByConversation?: PrivateMessage;
}

function repos(opts: RepoOpts = {}) {
  return {
    conversation: {
      loadById: jest.fn(async () => opts.byId ?? null),
      loadByIdOnly: jest.fn(async () => opts.byIdOnly ?? opts.byId ?? null),
      loadByIds: jest.fn(async () => opts.byIds ?? []),
      loadForContent: jest.fn(async () => opts.forContent ?? []),
      loadCurrent: jest.fn(async () => opts.current ?? null),
      loadPosts: jest.fn(async () => opts.posts ?? []),
      save: jest.fn(async (c: Conversation) => ({ ...c, id: c.id || "new1" })),
      updateStats: jest.fn(async (): Promise<void> => undefined),
      convertToModel: (c: Conversation) => c,
      convertAllToModel: (rows: Conversation[]) => rows
    },
    message: {
      loadForConversation: jest.fn(async () => opts.messages ?? [{ id: "m1" }]),
      loadForConversationsPaginated: jest.fn(async (_churchId: string, ids: string[]) => new Map(ids.map((id) => [id, opts.messages ?? [{ id: "m1" }]]))),
      loadByIds: jest.fn(async (): Promise<Message[]> => []),
      loadById: jest.fn(async (): Promise<Message | null> => null),
      save: jest.fn(async (m: Message) => ({ ...m, id: m.id || "msg1" })),
      convertToModel: (m: Message) => m,
      convertAllToModel: (rows: Message[]) => rows
    },
    messageReaction: { loadForMessages: jest.fn(async (): Promise<MessageReaction[]> => []) },
    connection: {
      loadForConversation: jest.fn(async (): Promise<Connection[]> => []),
      loadById: jest.fn(async (): Promise<Connection | null> => null),
      save: jest.fn(async (c: Connection) => ({ ...c, id: "cn1" })),
      delete: jest.fn(async (): Promise<void> => undefined),
      convertToModel: (c: Connection) => c,
      convertAllToModel: (rows: Connection[]) => rows
    },
    privateMessage: { loadById: jest.fn(async () => opts.privateMessage ?? null), loadByConversationId: jest.fn(async () => opts.privateMessageByConversation ?? null) }
  };
}

// What the stubbed json() hands back, and the shape the result assertions read.
interface JsonStub { obj?: unknown; status?: number }
const status = (result: unknown) => (result as JsonStub).status;

const res = {} as Response;
const req = (r: { body?: unknown; query?: Request["query"] } = {}) => r as Request;

function attach<C extends ConversationController | MessageController | ConnectionController>(controller: C, r: ReturnType<typeof repos>, principal: AuthenticatedUser): C {
  controller.actionWrapper = (_req, _res, action) => action(principal);
  controller.actionWrapperAnon = (_req, _res, action) => action();
  controller.authUser = () => principal;
  // repos is a partial mock and json() is swapped for a plain stub, so neither matches the real type.
  Object.assign(controller, { repos: r, json: (obj: unknown, status: number): JsonStub => ({ obj, status }) });
  return controller;
}

describe("ConversationController.forContent group membership", () => {
  const call = (principal: AuthenticatedUser, contentType = "group") => {
    const r = repos({ forContent: [contentType === "group" ? groupConv : announceConv] });
    const c = attach(new ConversationController(), r, principal);
    return { r, result: c.forContent(contentType, "g1", req({ query: {} }), res) };
  };

  it("401s a non-member and never loads the conversations", async () => {
    const { r, result } = call(NON_MEMBER);
    expect(status(await result)).toBe(401);
    expect(r.conversation.loadForContent).not.toHaveBeenCalled();
  });

  it("allows a member, a leader, and content.edit staff", async () => {
    for (const principal of [MEMBER, LEADER, STAFF]) {
      expect(await call(principal).result).toEqual([groupConv]);
    }
  });

  it("gates groupAnnouncement the same way", async () => {
    expect(status(await call(NON_MEMBER, "groupAnnouncement").result)).toBe(401);
    expect(await call(MEMBER, "groupAnnouncement").result).toEqual([announceConv]);
  });

  it("401s a non-host asking for the host room and allows chat.host", async () => {
    const nonHost = repos({ forContent: [hostConv] });
    expect(status(await attach(new ConversationController(), nonHost, MEMBER).forContent("streamingLiveHost", "svc1", req({ query: {} }), res))).toBe(401);
    const host = repos({ forContent: [hostConv] });
    expect(await attach(new ConversationController(), host, HOST).forContent("streamingLiveHost", "svc1", req({ query: {} }), res)).toEqual([hostConv]);
  });
});

describe("group and event notes", () => {
  const noteConv = { id: "gn1", churchId: "c1", contentType: "groupNote", contentId: "g1", allowAnonymousPosts: false, visibility: "hidden" };
  const eventConv = { id: "en1", churchId: "c1", contentType: "eventNote", contentId: "e1", allowAnonymousPosts: false, visibility: "hidden" };
  const forContent = (principal: AuthenticatedUser, conv: Conversation) =>
    attach(new ConversationController(), repos({ forContent: [conv] }), principal).forContent(conv.contentType, conv.contentId, req({ query: {} }), res);
  const post = (principal: AuthenticatedUser, conv: Conversation) =>
    attach(new MessageController(), repos({ byId: conv }), principal).save(req({ body: [{ conversationId: conv.id, content: "hi" }] }), res);

  it("hides group notes from members and every staff permission", async () => {
    for (const principal of [MEMBER, STAFF, au({ access: ["groupsEdit", "groupMembersView"] }), au({ leaderGroupIds: ["other"] })]) {
      expect(status(await forContent(principal, noteConv))).toBe(401);
      expect(status(await post(principal, noteConv))).toBe(401);
    }
  });

  it("lets the group's leaders read and post group notes", async () => {
    expect(await forContent(LEADER, noteConv)).toEqual([noteConv]);
    expect(status(await post(LEADER, noteConv))).not.toBe(401);
  });

  it("gates event notes by the event's view and post roles", async () => {
    mockLoadEvent.mockResolvedValue({ id: "e1", groupId: "g1", notesViewRole: "members", notesPostRole: "leaders" });
    expect(await forContent(MEMBER, eventConv)).toEqual([eventConv]);
    expect(status(await forContent(NON_MEMBER, eventConv))).toBe(401);
    expect(status(await post(MEMBER, eventConv))).toBe(401);
    expect(status(await post(LEADER, eventConv))).not.toBe(401);
    expect(await forContent(STAFF, eventConv)).toEqual([eventConv]);
  });

  it("defaults event notes to staff only", async () => {
    mockLoadEvent.mockResolvedValue({ id: "e1", groupId: "g1" });
    expect(status(await forContent(LEADER, eventConv))).toBe(401);
    expect(await forContent(au({ access: ["calendarsAdmin"] }), eventConv)).toEqual([eventConv]);
  });
});

describe("ConversationController.loadByContent / current on the host room", () => {
  it("401s loadByContent for a non-host and returns rows for a host", async () => {
    const nonHost = repos({ forContent: [hostConv] });
    expect(status(await attach(new ConversationController(), nonHost, MEMBER).loadByContent("c1", "streamingLiveHost", "svc1", req(), res))).toBe(401);
    const host = repos({ forContent: [hostConv] });
    expect(await attach(new ConversationController(), host, HOST).loadByContent("c1", "streamingLiveHost", "svc1", req(), res)).toEqual([hostConv]);
  });

  it("401s current for a non-host and returns the room for a host", async () => {
    const nonHost = repos({ current: hostConv });
    expect(status(await attach(new ConversationController(), nonHost, MEMBER).current("c1", "streamingLiveHost", "svc1", req(), res))).toBe(401);
    expect(nonHost.conversation.loadCurrent).not.toHaveBeenCalled();
    const host = repos({ current: hostConv });
    expect(await attach(new ConversationController(), host, HOST).current("c1", "streamingLiveHost", "svc1", req(), res)).toEqual(hostConv);
  });

  it("401s current for a group the caller does not belong to", async () => {
    const r = repos({ current: groupConv });
    expect(status(await attach(new ConversationController(), r, NON_MEMBER).current("c1", "group", "g1", req(), res))).toBe(401);
    const ok = repos({ current: groupConv });
    expect(await attach(new ConversationController(), ok, MEMBER).current("c1", "group", "g1", req(), res)).toEqual(groupConv);
  });
});

describe("ConversationController.getTimelineByIds", () => {
  const call = (principal: AuthenticatedUser) => {
    const r = repos({ byIds: [groupConv, dmConv] });
    return attach(new ConversationController(), r, principal).getTimelineByIds(req({ query: { ids: "grp1,dm1" } }), res);
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
  const loadByConversation = (principal: AuthenticatedUser, opts: RepoOpts) => {
    const r = repos(opts);
    const c = attach(new MessageController(), r, principal);
    return { r, result: c.loadByConversation(opts.byId.id, req(), res) };
  };

  it("401s a non-member reading a group conversation and allows a member", async () => {
    const denied = loadByConversation(NON_MEMBER, { byId: groupConv });
    expect(status(await denied.result)).toBe(401);
    expect(denied.r.message.loadForConversation).not.toHaveBeenCalled();
    expect(await loadByConversation(MEMBER, { byId: groupConv }).result).toEqual([{ id: "m1" }]);
  });

  it("401s a DM for a non-participant and allows a participant", async () => {
    const denied = loadByConversation(NON_MEMBER, { byId: dmConv, privateMessage: { fromPersonId: "pX", toPersonId: "pY" } });
    expect(status(await denied.result)).toBe(401);
    expect(await loadByConversation(NON_MEMBER, { byId: dmConv, privateMessage: { fromPersonId: "p1", toPersonId: "pY" } }).result).toEqual([{ id: "m1" }]);
  });

  it("lets a participant read a DM whose contentId is a person id", async () => {
    const personKeyed = { ...dmConv, contentId: "pY" };
    expect(await loadByConversation(NON_MEMBER, { byId: personKeyed, privateMessageByConversation: { fromPersonId: "pY", toPersonId: "p1" } }).result).toEqual([{ id: "m1" }]);
    expect(status(await loadByConversation(NON_MEMBER, { byId: personKeyed, privateMessageByConversation: { fromPersonId: "pY", toPersonId: "pZ" } }).result)).toBe(401);
  });

  it("401s catchup on the host room for a non-host and allows a host", async () => {
    const denied = repos({ byId: hostConv });
    expect(status(await attach(new MessageController(), denied, MEMBER).catchup("c1", "host1", req(), res))).toBe(401);
    const allowed = repos({ byId: hostConv });
    expect(await attach(new MessageController(), allowed, HOST).catchup("c1", "host1", req(), res)).toEqual([{ id: "m1" }]);
  });
});

describe("ConnectionController.save on the host room", () => {
  it("401s a non-host and lets a host join", async () => {
    const denied = repos({ byIdOnly: hostConv });
    expect(status(await attach(new ConnectionController(), denied, MEMBER).save(req({ body: [{ conversationId: "host1", socketId: "s1" }] }), res))).toBe(401);
    expect(denied.connection.save).not.toHaveBeenCalled();
    const allowed = repos({ byIdOnly: hostConv });
    await attach(new ConnectionController(), allowed, HOST).save(req({ body: [{ conversationId: "host1", socketId: "s1" }] }), res);
    expect(allowed.connection.save).toHaveBeenCalledWith(expect.objectContaining({ churchId: "c1", conversationId: "host1" }));
  });

  it("401s a non-member joining a group room", async () => {
    const r = repos({ byIdOnly: groupConv });
    expect(status(await attach(new ConnectionController(), r, NON_MEMBER).save(req({ body: [{ conversationId: "grp1", socketId: "s1" }] }), res))).toBe(401);
    expect(r.connection.save).not.toHaveBeenCalled();
  });
});

describe("cross-church and ownership gates", () => {
  const otherChurchNote = { id: "note1", churchId: "c2", contentType: "person", contentId: "pv1", allowAnonymousPosts: false, visibility: "hidden" };
  const NOTES_STAFF = au({ access: ["peopleEdit"] });

  it("401s another church's person-note conversation even with people.edit", async () => {
    const r = repos({ byId: otherChurchNote });
    expect(status(await attach(new ConversationController(), r, NOTES_STAFF).loadById("c2", "note1", req(), res))).toBe(401);
  });

  it("401s listing another church's person notes by content", async () => {
    const r = repos({ forContent: [otherChurchNote] });
    expect(status(await attach(new ConversationController(), r, NOTES_STAFF).loadByContent("c2", "person", "pv1", req(), res))).toBe(401);
  });

  it("401s /posts/group for a non-member", async () => {
    const r = repos();
    expect(status(await attach(new ConversationController(), r, NON_MEMBER).getPostsForGroup("g1", req(), res))).toBe(401);
    expect(r.conversation.loadPosts).not.toHaveBeenCalled();
  });

  describe("posts feeds hide leader-only notes", () => {
    const postRows = () => [
      { id: "grp1", contentType: "group", contentId: "g1", groupId: "g1" },
      { id: "gn1", contentType: "groupNote", contentId: "g1", groupId: "g1" }
    ];
    const ids = (rows: unknown) => (rows as Conversation[]).map((c) => c.id);

    it("drops group notes from /posts for a member who is not a leader", async () => {
      const r = repos({ posts: postRows() });
      expect(ids(await attach(new ConversationController(), r, MEMBER).getPosts(req(), res))).toEqual(["grp1"]);
    });

    it("drops group notes from /posts/group for content.edit staff", async () => {
      const r = repos({ posts: postRows() });
      expect(ids(await attach(new ConversationController(), r, STAFF).getPostsForGroup("g1", req(), res))).toEqual(["grp1"]);
    });

    it("keeps group notes for the group's leader", async () => {
      const r = repos({ posts: postRows() });
      const leader = au({ groupIds: ["g1"], leaderGroupIds: ["g1"] });
      expect(ids(await attach(new ConversationController(), r, leader).getPosts(req(), res))).toEqual(["grp1", "gn1"]);
    });
  });

  it("401s a member rewriting an existing DM conversation", async () => {
    const r = repos({ byId: dmConv });
    const result = await attach(new ConversationController(), r, MEMBER).save(req({ body: [{ id: "dm1", contentType: "group", contentId: "g1", groupId: "g1" }] }), res);
    expect(status(result)).toBe(401);
    expect(r.conversation.save).not.toHaveBeenCalled();
  });

  it("forces the connection personId to the caller", async () => {
    const r = repos({ byIdOnly: groupConv });
    await attach(new ConnectionController(), r, MEMBER).save(req({ body: [{ conversationId: "grp1", socketId: "s1", personId: "pVictim" }] }), res);
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
  const pages: Record<string, Message[]> = {
    cv1: [{ id: "m12", conversationId: "cv1" }, { id: "m11", conversationId: "cv1" }],
    cv3: [{ id: "m31", conversationId: "cv3" }]
  };
  const setup = () => {
    const r = repos({ forContent: convs.map((c) => ({ ...c })) });
    r.message.loadForConversationsPaginated = jest.fn(async (_churchId: string, ids: string[]) => new Map(ids.filter((id) => pages[id]).map((id) => [id, pages[id]])));
    r.messageReaction.loadForMessages = jest.fn(async () => [{ messageId: "m11", emoji: "👍", personId: "p1" }]);
    const c = attach(new ConversationController(), r, MEMBER);
    return { r, run: () => c.forContent("group", "g1", req({ query: { page: "2", limit: "5" } }), res) };
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

  const readers: [string, (principal: AuthenticatedUser) => Promise<unknown>][] = [
    ["messages/conversation/:id", (p) => attach(new MessageController(), repos({ byId: cardConv }), p).loadByConversation("card1", req(), res)],
    ["messages/catchup/:churchId/:id", (p) => attach(new MessageController(), repos({ byId: cardConv }), p).catchup("c1", "card1", req(), res)],
    ["conversations/messages/workflowCard/:taskId", (p) => attach(new ConversationController(), repos({ forContent: [cardConv] }), p).forContent("workflowCard", "t1", req({ query: {} }), res)],
    ["conversations/:churchId/workflowCard/:taskId", (p) => attach(new ConversationController(), repos({ forContent: [cardConv] }), p).loadByContent("c1", "workflowCard", "t1", req(), res)],
    ["conversations/current/:churchId/workflowCard/:taskId", (p) => attach(new ConversationController(), repos({ current: cardConv }), p).current("c1", "workflowCard", "t1", req(), res)]
  ];

  it.each(readers)("%s refuses a church member with no tie to the card", async (_name, read) => {
    expect(status(await read(MEMBER))).toBe(401);
  });

  it.each(readers)("%s still serves the assignee and tasks.view staff", async (_name, read) => {
    for (const principal of [ASSIGNEE, TASK_VIEWER]) {
      const result = await read(principal);
      expect((result as JsonStub | undefined)?.status).not.toBe(401);
    }
  });
});
