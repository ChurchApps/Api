import "reflect-metadata";
import type { Request, Response } from "express";
import type { AuthenticatedUser } from "@churchapps/apihelper";
import { Connection, Conversation, Message, PrivateMessage } from "../../models/index.js";

const decrypt = jest.fn((s: string) => `decrypted:${s}`);

// Only the infrastructure is stubbed — MessagingBaseController itself is the real one, so these tests
// exercise the actual isAnonPublicConversation / isAuthenticated / isSameChurch gates.
jest.mock("../../../../shared/infrastructure/index", () => ({ BaseController: class { constructor(_module?: string) {} } }));
jest.mock("../../repositories/index", () => ({ Repos: class {} }));
jest.mock("@churchapps/apihelper", () => ({ ArrayHelper: { getOne: jest.fn() }, EncryptionHelper: { decrypt } }));
jest.mock("../../helpers/DeliveryHelper", () => ({ DeliveryHelper: { sendConversationMessages: jest.fn(), sendAttendance: jest.fn(), sendBlockedIps: jest.fn() } }));
jest.mock("../../helpers/NotificationHelper", () => ({ NotificationHelper: { checkShouldNotify: jest.fn() } }));
jest.mock("../../../../shared/helpers/Permissions", () => ({ Permissions: { content: { edit: "contentEdit" }, chat: { host: "chatHost" }, people: { edit: "peopleEdit", viewConfidentialNotes: "peopleViewConfidentialNotes" } } }));
const loadChurch = jest.fn(async (id: string) => (id === "c1" ? { id } : null));
jest.mock("../../../../shared/modules/MembershipModuleGateway.js", () => ({ getMembershipModuleGateway: () => ({ loadChurch }) }));

import { ConversationController } from "../ConversationController.js";
import { MessageController } from "../MessageController.js";
import { ConnectionController } from "../ConnectionController.js";
import { DeliveryHelper } from "../../helpers/DeliveryHelper.js";

const publicLive = { id: "live1", churchId: "c1", contentType: "streamingLive", contentId: "svc1", allowAnonymousPosts: true, visibility: "public" };
const groupConv = { id: "grp1", churchId: "c1", contentType: "group", contentId: "g1", allowAnonymousPosts: true, visibility: "public" };
const dmConv = { id: "dm1", churchId: "c1", contentType: "privateMessage", contentId: "pm1", allowAnonymousPosts: false, visibility: "hidden" };
const hostConv = { id: "host1", churchId: "c1", contentType: "streamingLiveHost", contentId: "svc1", allowAnonymousPosts: true, visibility: "public" };
const legacyFlag = { id: "leg1", churchId: "c1", contentType: "group", contentId: "g1", allowAnonymousPosts: true, visibility: "public" };

// What CustomBaseController.authUser() hands back with no Authorization header: an AuthenticatedUser
// built from an empty Principal, i.e. blank strings rather than null.
const ANON_AU = { id: "", churchId: "", personId: "", checkAccess: (_perm: unknown): boolean => false } as AuthenticatedUser;
const memberAu = (churchId = "c1") => ({ id: "u1", churchId, personId: "p1", checkAccess: (_perm: unknown): boolean => false }) as AuthenticatedUser;
// The mocked Permissions hand checkAccess plain strings.
const hostAu = (churchId = "c1") => ({ id: "u2", churchId, personId: "p2", checkAccess: (p: unknown): boolean => p === "chatHost" }) as AuthenticatedUser;

// What the stubbed json() hands back, and the shape the result assertions read.
interface JsonStub { obj?: unknown; status?: number }
const status = (result: unknown) => (result as JsonStub).status;

const res = {} as Response;
const req = (r: { body?: unknown } = {}) => r as Request;

function attach<C extends ConversationController | MessageController | ConnectionController>(controller: C, repos: ReturnType<typeof conversationRepos>, opts: { au?: AuthenticatedUser } = {}): C {
  const au = opts.au ?? ANON_AU;
  // Production actionWrapper does NOT reject anonymous callers — it runs the action with the empty
  // AuthenticatedUser above. Modelling that is the whole point: handlers must check the JWT themselves.
  controller.actionWrapper = (_req, _res, action) => action(au);
  controller.actionWrapperAnon = (_req, _res, action) => action();
  controller.authUser = () => au;
  // repos is a partial mock and json() is swapped for a plain stub, so neither matches the real type.
  Object.assign(controller, { repos, json: (obj: unknown, status: number): JsonStub => ({ obj, status }) });
  return controller;
}

interface RepoOpts {
  current?: Conversation;
  byId?: Conversation;
  byIdOnly?: Conversation;
  forContent?: Conversation[];
  privateMessage?: PrivateMessage;
  messages?: Message[];
  message?: Message;
  connections?: Connection[];
  socketConnections?: Connection[];
  existingConnection?: Connection;
}

function conversationRepos(opts: RepoOpts = {}) {
  return {
    conversation: {
      loadCurrent: jest.fn(async () => opts.current ?? null),
      loadById: jest.fn<Promise<Conversation | null>, [string, string]>(async () => opts.byId ?? null),
      loadByIdOnly: jest.fn<Promise<Conversation | null>, [string]>(async () => opts.byIdOnly ?? opts.byId ?? null),
      loadForContent: jest.fn(async () => opts.forContent ?? []),
      save: jest.fn(async (c: Conversation) => ({ ...c, id: c.id || "new1" })),
      updateStats: jest.fn(async (): Promise<void> => undefined),
      convertToModel: (c: Conversation) => c,
      convertAllToModel: (rows: Conversation[]) => rows
    },
    privateMessage: { loadById: jest.fn(async () => opts.privateMessage ?? null) }
  };
}

function messageRepos(opts: RepoOpts = {}) {
  return {
    ...conversationRepos(opts),
    message: {
      loadForConversation: jest.fn(async () => opts.messages ?? [{ id: "m1", conversationId: opts.byId?.id }]),
      loadById: jest.fn(async () => opts.message ?? { id: "m1", conversationId: opts.byId?.id }),
      save: jest.fn(async (m: Message) => ({ ...m, id: m.id || "mNew" })),
      convertToModel: (m: Message) => m,
      convertAllToModel: (rows: Message[]) => rows
    }
  };
}

function connectionRepos(opts: RepoOpts = {}) {
  let created = 0;
  return {
    ...conversationRepos(opts),
    connection: {
      loadForConversation: jest.fn(async () => opts.connections ?? [{ id: "cn1", displayName: "Anonymous_1" }]),
      loadBySocketId: jest.fn(async () => opts.socketConnections ?? []),
      loadById: jest.fn(async () => opts.existingConnection ?? null),
      save: jest.fn(async (c: Connection) => ({ ...c, id: c.id || `cnNew${++created}` })),
      delete: jest.fn(async (): Promise<void> => undefined),
      deleteForRoom: jest.fn(async (): Promise<void> => undefined),
      convertToModel: (c: Connection) => c,
      convertAllToModel: (rows: Connection[]) => rows
    }
  };
}

beforeEach(() => {
  decrypt.mockClear();
  (DeliveryHelper.sendAttendance as jest.Mock).mockReset();
  (DeliveryHelper.sendBlockedIps as jest.Mock).mockReset();
  (DeliveryHelper.sendConversationMessages as jest.Mock).mockReset();
});

describe("ConversationController.current", () => {
  it("returns an existing public streamingLive room and does not create", async () => {
    const repos = conversationRepos({ current: publicLive });
    const controller = attach(new ConversationController(), repos);
    const result = await controller.current("c1", "streamingLive", "svc1", req(), res);
    expect(result).toMatchObject({ id: "live1", contentType: "streamingLive" });
    expect(repos.conversation.save).not.toHaveBeenCalled();
    expect(decrypt).not.toHaveBeenCalled();
  });

  it("lazily creates the public streamingLive room for anon when the church is real", async () => {
    const repos = conversationRepos({ current: null });
    const controller = attach(new ConversationController(), repos);
    const result = await controller.current("c1", "streamingLive", "svc1", req(), res);
    expect(repos.conversation.save).toHaveBeenCalled();
    expect(result).toMatchObject({ contentType: "streamingLive", visibility: "public", allowAnonymousPosts: true });
  });

  it("404s for anon when the streamingLive room is missing and the church does not exist", async () => {
    const repos = conversationRepos({ current: null });
    const controller = attach(new ConversationController(), repos);
    const result = await controller.current("ghost", "streamingLive", "svc1", req(), res);
    expect(status(result)).toBe(404);
    expect(repos.conversation.save).not.toHaveBeenCalled();
  });

  it("rejects anon /current for group, person, and privateMessage", async () => {
    for (const contentType of ["group", "person", "privateMessage"]) {
      const repos = conversationRepos();
      const controller = attach(new ConversationController(), repos);
      const result = await controller.current("c1", contentType, "x1", req(), res);
      expect(status(result)).toBe(401);
      expect(repos.conversation.save).not.toHaveBeenCalled();
      expect(decrypt).not.toHaveBeenCalled();
    }
  });

  it("does not decrypt or create streamingLiveHost for anon", async () => {
    const repos = conversationRepos();
    const controller = attach(new ConversationController(), repos);
    const result = await controller.current("c1", "streamingLiveHost", "encrypted-room-id-longer-than-eleven", req(), res);
    expect(status(result)).toBe(401);
    expect(decrypt).not.toHaveBeenCalled();
    expect(repos.conversation.save).not.toHaveBeenCalled();
  });

  it("401s an authenticated caller asking for another church's rooms", async () => {
    const repos = conversationRepos();
    const controller = attach(new ConversationController(), repos, { au: memberAu("c2") });
    const result = await controller.current("c1", "group", "g1", req(), res);
    expect(status(result)).toBe(401);
    expect(repos.conversation.save).not.toHaveBeenCalled();
  });

  it("creates a public livestream room for a same-church authenticated caller", async () => {
    const repos = conversationRepos({ current: null });
    const controller = attach(new ConversationController(), repos, { au: memberAu() });
    const result = await controller.current("c1", "streamingLive", "svc1", req(), res);
    expect(repos.conversation.save).toHaveBeenCalledWith(expect.objectContaining({ contentType: "streamingLive", visibility: "public", allowAnonymousPosts: true, contentId: "svc1" }));
    expect((result as Conversation).allowAnonymousPosts).toBe(true);
    expect(decrypt).not.toHaveBeenCalled();
  });

  it("does not flip flags on an existing livestream row", async () => {
    const existing = { ...publicLive, allowAnonymousPosts: false, visibility: "hidden" };
    const repos = conversationRepos({ current: existing });
    const controller = attach(new ConversationController(), repos, { au: memberAu() });
    const result = await controller.current("c1", "streamingLive", "svc1", req(), res);
    expect(result).toEqual(existing);
    expect(repos.conversation.save).not.toHaveBeenCalled();
  });

  it("ensures a public livestream room when an authenticated host opens host chat", async () => {
    const repos = conversationRepos({ current: null });
    const controller = attach(new ConversationController(), repos, { au: hostAu() });
    await controller.current("c1", "streamingLiveHost", "encrypted-room-id-longer-than-eleven", req(), res);
    expect(decrypt).toHaveBeenCalledWith("encrypted-room-id-longer-than-eleven");
    expect(repos.conversation.save).toHaveBeenCalledWith(expect.objectContaining({ contentType: "streamingLiveHost", allowAnonymousPosts: false, contentId: "decrypted:encrypted-room-id-longer-than-eleven" }));
    expect(repos.conversation.save).toHaveBeenCalledWith(expect.objectContaining({ contentType: "streamingLive", allowAnonymousPosts: true, visibility: "public", contentId: "decrypted:encrypted-room-id-longer-than-eleven" }));
  });
});

describe("ConversationController.loadByContent / loadById", () => {
  it("returns public livestream conversations", async () => {
    const repos = conversationRepos({ forContent: [publicLive], byId: publicLive });
    const controller = attach(new ConversationController(), repos);
    const list = await controller.loadByContent("c1", "streamingLive", "svc1", req(), res);
    expect(list).toEqual([publicLive]);
    const one = await controller.loadById("c1", "live1", req(), res);
    expect(one).toEqual(publicLive);
  });

  it("401s group and person conversations", async () => {
    const repos = conversationRepos({ forContent: [groupConv], byId: groupConv });
    const controller = attach(new ConversationController(), repos);
    expect(status(await controller.loadByContent("c1", "group", "g1", req(), res))).toBe(401);
    expect(status(await controller.loadById("c1", "grp1", req(), res))).toBe(401);
  });
});

describe("ConversationController.ensure", () => {
  it("creates a public streamingLive room for the JWT church", async () => {
    const repos = conversationRepos({ current: null });
    const controller = attach(new ConversationController(), repos, { au: memberAu() });
    await controller.ensure(req({ body: { contentType: "streamingLive", contentId: "svc1" } }), res);
    expect(repos.conversation.save).toHaveBeenCalledWith(expect.objectContaining({ churchId: "c1", contentType: "streamingLive", allowAnonymousPosts: true, visibility: "public" }));
  });

  // actionWrapper runs the action for anonymous callers too, so without the explicit JWT check this
  // used to create a streamingLive room under churchId "".
  it("401s an anonymous caller instead of creating a room", async () => {
    const repos = conversationRepos({ current: null });
    const controller = attach(new ConversationController(), repos);
    const result = await controller.ensure(req({ body: { contentType: "streamingLive", contentId: "svc1" } }), res);
    expect(status(result)).toBe(401);
    expect(repos.conversation.save).not.toHaveBeenCalled();
    expect(repos.conversation.loadCurrent).not.toHaveBeenCalled();
  });

  it("401s a token that carries no church", async () => {
    const repos = conversationRepos({ current: null });
    const controller = attach(new ConversationController(), repos, { au: { id: "u1", churchId: "", checkAccess: (_perm: unknown): boolean => false } as AuthenticatedUser });
    const result = await controller.ensure(req({ body: { contentType: "streamingLive", contentId: "svc1" } }), res);
    expect(status(result)).toBe(401);
    expect(repos.conversation.save).not.toHaveBeenCalled();
  });

  it("rejects ensure for non-livestream types and for a missing contentId", async () => {
    const repos = conversationRepos();
    const controller = attach(new ConversationController(), repos, { au: memberAu() });
    expect(status(await controller.ensure(req({ body: { contentType: "group", contentId: "g1" } }), res))).toBe(401);
    expect(status(await controller.ensure(req({ body: { contentType: "streamingLive" } }), res))).toBe(401);
    expect(repos.conversation.save).not.toHaveBeenCalled();
  });
});

describe("MessageController.catchup / loadById / send", () => {
  it("allows catchup and send on a public streamingLive room", async () => {
    const repos = messageRepos({ byId: publicLive, messages: [{ id: "m1" }] });
    const controller = attach(new MessageController(), repos);
    const catchup = await controller.catchup("c1", "live1", req(), res);
    expect(catchup).toEqual([{ id: "m1" }]);
    const sent = await controller.send(req({ body: [{ churchId: "other", conversationId: "live1", content: "hi", personId: "pHack" }] }), res);
    expect(repos.message.save).toHaveBeenCalledWith(expect.objectContaining({ personId: null, churchId: "c1", content: "hi" }));
    expect(sent).toEqual([expect.objectContaining({ personId: null, churchId: "c1" })]);
  });

  it("401s catchup against a group or DM conversation", async () => {
    for (const conv of [groupConv, dmConv]) {
      const repos = messageRepos({ byId: conv });
      const controller = attach(new MessageController(), repos);
      expect(status(await controller.catchup("c1", conv.id, req(), res))).toBe(401);
      expect(repos.message.loadForConversation).not.toHaveBeenCalled();
    }
  });

  it("401s send to a legacy non-livestream row that has allowAnonymousPosts", async () => {
    const repos = messageRepos({ byId: legacyFlag });
    const controller = attach(new MessageController(), repos);
    const result = await controller.send(req({ body: [{ churchId: "c1", conversationId: "leg1", content: "hi" }] }), res);
    expect(status(result)).toBe(401);
    expect(repos.message.save).not.toHaveBeenCalled();
  });

  it("401s loadById for a message in a group conversation", async () => {
    const repos = messageRepos({ byId: groupConv, message: { id: "m9", conversationId: "grp1" } });
    const controller = attach(new MessageController(), repos);
    expect(status(await controller.loadById("c1", "m9", req(), res))).toBe(401);
  });
});

describe("ConnectionController", () => {
  it("allows anon join/list/leave on a public streamingLive room", async () => {
    const repos = connectionRepos({ byId: publicLive, byIdOnly: publicLive });
    const controller = attach(new ConnectionController(), repos);
    const listed = await controller.load("c1", "live1", req(), res);
    expect(listed).toEqual([{ id: "cn1", displayName: "Anonymous_1" }]);
    const saved = await controller.save(req({ body: [{ churchId: "attacker", conversationId: "live1", displayName: "Anonymous " }] }), res);
    expect(repos.connection.save).toHaveBeenCalledWith(expect.objectContaining({ churchId: "c1", conversationId: "live1" }));
    expect((saved as Connection[])[0].churchId).toBe("c1");
    const left = await controller.leaveRoom("c1", "live1", "sock1", req(), res);
    expect(left).toEqual({ success: true });
  });

  it("lists only id and displayName so socketIds, personIds and IPs stay private", async () => {
    const repos = connectionRepos({ byId: publicLive, connections: [{ id: "cn1", displayName: "Pat", socketId: "sock1", personId: "p9", ipAddress: "1.2.3.4", churchId: "c1" }] });
    const controller = attach(new ConnectionController(), repos);
    expect(await controller.load("c1", "live1", req(), res)).toEqual([{ id: "cn1", displayName: "Pat" }]);
  });

  it("401s anon catchup-style join against a group or DM conversation", async () => {
    for (const conv of [groupConv, dmConv]) {
      const repos = connectionRepos({ byId: conv, byIdOnly: conv });
      const controller = attach(new ConnectionController(), repos);
      expect(status(await controller.load("c1", conv.id, req(), res))).toBe(401);
      expect(status(await controller.save(req({ body: [{ churchId: "c1", conversationId: conv.id }] }), res))).toBe(401);
      expect(repos.connection.save).not.toHaveBeenCalled();
    }
  });

  it("ignores body churchId and stamps the conversation church", async () => {
    const repos = connectionRepos({ byIdOnly: publicLive });
    const controller = attach(new ConnectionController(), repos);
    await controller.save(req({ body: [{ churchId: "evilChurch", conversationId: "live1", socketId: "s1" }] }), res);
    expect(repos.connection.save).toHaveBeenCalledWith(expect.objectContaining({ churchId: "c1" }));
    expect(repos.conversation.loadByIdOnly).toHaveBeenCalledWith("live1");
  });

  // The batch used to be authorized inside the write loop, so entry 1 was already persisted (and its
  // attendance broadcast) by the time entry 2 was rejected.
  it("writes nothing when a later entry in the batch is unauthorized", async () => {
    const repos = connectionRepos();
    repos.conversation.loadByIdOnly = jest.fn(async (id: string) => (id === "live1" ? publicLive : groupConv));
    const controller = attach(new ConnectionController(), repos);
    const result = await controller.save(req({
      body: [
        { conversationId: "live1", socketId: "s1" },
        { conversationId: "grp1", socketId: "s2" }
      ]
    }), res);
    expect(status(result)).toBe(401);
    expect(repos.connection.save).not.toHaveBeenCalled();
    expect(DeliveryHelper.sendAttendance).not.toHaveBeenCalled();
  });

  it("rolls back the rows it created when a later save fails", async () => {
    const repos = connectionRepos({ byIdOnly: publicLive });
    let calls = 0;
    repos.connection.save = jest.fn(async (c: Connection) => {
      calls++;
      if (calls === 2) throw new Error("db down");
      return { ...c, id: `cn${calls}` };
    });
    const controller = attach(new ConnectionController(), repos);
    await expect(controller.save(req({
      body: [
        { conversationId: "live1", socketId: "s1" },
        { conversationId: "live1", socketId: "s2" }
      ]
    }), res)).rejects.toThrow("db down");
    expect(repos.connection.delete).toHaveBeenCalledTimes(1);
    expect(repos.connection.delete).toHaveBeenCalledWith("c1", "cn1");
    expect(DeliveryHelper.sendAttendance).not.toHaveBeenCalled();
  });

  it("broadcasts attendance once per room, after every row is written", async () => {
    const repos = connectionRepos({ byIdOnly: publicLive });
    const controller = attach(new ConnectionController(), repos);
    await controller.save(req({
      body: [
        { conversationId: "live1", socketId: "s1" },
        { conversationId: "live1", socketId: "s2" }
      ]
    }), res);
    expect(repos.connection.save).toHaveBeenCalledTimes(2);
    expect(DeliveryHelper.sendAttendance).toHaveBeenCalledTimes(1);
    expect(DeliveryHelper.sendAttendance).toHaveBeenCalledWith("c1", "live1");
    expect(DeliveryHelper.sendBlockedIps).toHaveBeenCalledTimes(1);
  });

  it("drops a connection id that belongs to a different socket instead of updating it", async () => {
    const repos = connectionRepos({ byIdOnly: publicLive, existingConnection: { id: "victim", churchId: "c1", conversationId: "live1", socketId: "victimSocket", displayName: "Pastor" } });
    const controller = attach(new ConnectionController(), repos);
    await controller.save(req({ body: [{ id: "victim", conversationId: "live1", socketId: "attackerSocket", displayName: "Pastor" }] }), res);
    expect(repos.connection.save.mock.calls[0][0].id).toBeUndefined();
    expect(repos.connection.save).toHaveBeenCalledWith(expect.objectContaining({ socketId: "attackerSocket" }));
  });

  it("keeps a connection id that already belongs to the same socket and room", async () => {
    const repos = connectionRepos({ byIdOnly: publicLive, existingConnection: { id: "mine", churchId: "c1", conversationId: "live1", socketId: "s1", displayName: "Old" } });
    const controller = attach(new ConnectionController(), repos);
    await controller.save(req({ body: [{ id: "mine", conversationId: "live1", socketId: "s1", displayName: "New" }] }), res);
    expect(repos.connection.save).toHaveBeenCalledWith(expect.objectContaining({ id: "mine", displayName: "New" }));
    expect(repos.connection.delete).not.toHaveBeenCalled();
  });

  it("setName only updates connections on public livestream rooms", async () => {
    const repos = connectionRepos({
      socketConnections: [
        { id: "a", churchId: "c1", conversationId: "live1", displayName: "Old" },
        { id: "b", churchId: "c1", conversationId: "grp1", displayName: "Old" }
      ]
    });
    repos.conversation.loadById = jest.fn(async (_churchId: string, id: string) => id === "live1" ? publicLive : groupConv);
    const controller = attach(new ConnectionController(), repos);
    await controller.setName(req({ body: { socketId: "s1", name: "Pat" } }), res);
    expect(repos.connection.save).toHaveBeenCalledTimes(1);
    expect(repos.connection.save).toHaveBeenCalledWith(expect.objectContaining({ id: "a", displayName: "Pat" }));
  });

  it("401s setName when every connection is a private room", async () => {
    const repos = connectionRepos({ socketConnections: [{ id: "b", churchId: "c1", conversationId: "grp1" }] });
    repos.conversation.loadById = jest.fn<Promise<Conversation | null>, [string, string]>(async () => groupConv);
    const controller = attach(new ConnectionController(), repos);
    const result = await controller.setName(req({ body: { socketId: "s1", name: "Pat" } }), res);
    expect(status(result)).toBe(401);
    expect(repos.connection.save).not.toHaveBeenCalled();
  });

  it("401s an authenticated same-church client without chat.host joining host chat", async () => {
    const repos = connectionRepos({ byIdOnly: hostConv, byId: hostConv });
    const controller = attach(new ConnectionController(), repos, { au: memberAu() });
    const result = await controller.save(req({ body: [{ churchId: "ignored", conversationId: "host1" }] }), res);
    expect(status(result)).toBe(401);
    expect(repos.connection.save).not.toHaveBeenCalled();
  });

  it("allows a chat.host client to join host chat", async () => {
    const repos = connectionRepos({ byIdOnly: hostConv, byId: hostConv });
    const controller = attach(new ConnectionController(), repos, { au: hostAu() });
    await controller.save(req({ body: [{ churchId: "ignored", conversationId: "host1" }] }), res);
    expect(repos.connection.save).toHaveBeenCalledWith(expect.objectContaining({ churchId: "c1" }));
  });

  it("401s a different church's authenticated client joining host chat", async () => {
    const repos = connectionRepos({ byIdOnly: hostConv, byId: hostConv });
    const controller = attach(new ConnectionController(), repos, { au: hostAu("c2") });
    const result = await controller.save(req({ body: [{ churchId: "c2", conversationId: "host1" }] }), res);
    expect(status(result)).toBe(401);
    expect(repos.connection.save).not.toHaveBeenCalled();
  });
});
