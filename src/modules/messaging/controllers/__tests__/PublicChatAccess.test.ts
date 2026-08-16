import "reflect-metadata";

const decrypt = jest.fn((s: string) => `decrypted:${s}`);

jest.mock("../MessagingBaseController", () => ({
  MessagingBaseController: class {
    json(obj: any, status: number) { return { obj, status }; }
    isPersonNote(contentType?: string) { return contentType === "person" || contentType === "personConfidential"; }
    canViewPersonNotes(au: any, contentType?: string) {
      if (!au) return false;
      return au.checkAccess(contentType === "personConfidential" ? "peopleViewConfidentialNotes" : "peopleEdit");
    }
    isAnonPublicConversation(conv: { contentType?: string; allowAnonymousPosts?: boolean; visibility?: string }) {
      return !!conv && conv.contentType === "streamingLive" && conv.allowAnonymousPosts === true && conv.visibility === "public";
    }
  }
}));
jest.mock("@churchapps/apihelper", () => ({ ArrayHelper: { getOne: jest.fn() }, EncryptionHelper: { decrypt } }));
jest.mock("../../helpers/DeliveryHelper", () => ({ DeliveryHelper: { sendConversationMessages: jest.fn(), sendAttendance: jest.fn(), sendBlockedIps: jest.fn() } }));
jest.mock("../../helpers/NotificationHelper", () => ({ NotificationHelper: { checkShouldNotify: jest.fn() } }));
jest.mock("../../../../shared/helpers/Permissions", () => ({ Permissions: { content: { edit: "contentEdit" }, people: { edit: "peopleEdit", viewConfidentialNotes: "peopleViewConfidentialNotes" } } }));

import { ConversationController } from "../ConversationController.js";
import { MessageController } from "../MessageController.js";
import { ConnectionController } from "../ConnectionController.js";
import { DeliveryHelper } from "../../helpers/DeliveryHelper.js";

const publicLive = { id: "live1", churchId: "c1", contentType: "streamingLive", contentId: "svc1", allowAnonymousPosts: true, visibility: "public" };
const groupConv = { id: "grp1", churchId: "c1", contentType: "group", contentId: "g1", allowAnonymousPosts: true, visibility: "public" };
const dmConv = { id: "dm1", churchId: "c1", contentType: "privateMessage", contentId: "pm1", allowAnonymousPosts: false, visibility: "hidden" };
const hostConv = { id: "host1", churchId: "c1", contentType: "streamingLiveHost", contentId: "svc1", allowAnonymousPosts: true, visibility: "public" };
const legacyFlag = { id: "leg1", churchId: "c1", contentType: "group", contentId: "g1", allowAnonymousPosts: true, visibility: "public" };

function attach(controller: any, repos: any, opts: any = {}) {
  const au = opts.au === undefined ? null : opts.au;
  controller.repos = repos;
  controller.actionWrapper = opts.requireAuthFail
    ? () => ({ obj: {}, status: 401 })
    : (_req: any, _res: any, action: any) => action(opts.wrapperAu ?? { churchId: "c1", checkAccess: () => false });
  controller.actionWrapperAnon = (_req: any, _res: any, action: any) => action();
  controller.authUser = () => au;
  controller.json = (obj: any, status: number) => ({ obj, status });
  return controller;
}

function conversationRepos(opts: any = {}) {
  return {
    conversation: {
      loadCurrent: jest.fn(async () => opts.current ?? null),
      loadById: jest.fn(async () => opts.byId ?? null),
      loadByIdOnly: jest.fn(async () => opts.byIdOnly ?? opts.byId ?? null),
      loadForContent: jest.fn(async () => opts.forContent ?? []),
      save: jest.fn(async (c: any) => ({ ...c, id: c.id || "new1" })),
      updateStats: jest.fn(async () => undefined),
      convertToModel: (c: any) => c,
      convertAllToModel: (rows: any[]) => rows
    }
  };
}

function messageRepos(opts: any = {}) {
  return {
    ...conversationRepos(opts),
    message: {
      loadForConversation: jest.fn(async () => opts.messages ?? [{ id: "m1", conversationId: opts.byId?.id }]),
      loadById: jest.fn(async () => opts.message ?? { id: "m1", conversationId: opts.byId?.id }),
      save: jest.fn(async (m: any) => ({ ...m, id: m.id || "mNew" })),
      convertToModel: (m: any) => m,
      convertAllToModel: (rows: any[]) => rows
    }
  };
}

function connectionRepos(opts: any = {}) {
  return {
    ...conversationRepos(opts),
    connection: {
      loadForConversation: jest.fn(async () => opts.connections ?? [{ id: "cn1" }]),
      loadBySocketId: jest.fn(async () => opts.socketConnections ?? []),
      save: jest.fn(async (c: any) => ({ ...c, id: c.id || "cnNew" })),
      deleteForRoom: jest.fn(async () => undefined),
      convertAllToModel: (rows: any[]) => rows
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
    const result = await (controller as any).current("c1", "streamingLive", "svc1", {}, {});
    expect(result).toMatchObject({ id: "live1", contentType: "streamingLive" });
    expect(repos.conversation.save).not.toHaveBeenCalled();
    expect(decrypt).not.toHaveBeenCalled();
  });

  it("404s for anon when the streamingLive room is missing", async () => {
    const repos = conversationRepos({ current: null });
    const controller = attach(new ConversationController(), repos);
    const result = await (controller as any).current("c1", "streamingLive", "svc1", {}, {});
    expect(result.status).toBe(404);
    expect(repos.conversation.save).not.toHaveBeenCalled();
  });

  it("rejects anon /current for group, person, and privateMessage", async () => {
    for (const contentType of ["group", "person", "privateMessage"]) {
      const repos = conversationRepos();
      const controller = attach(new ConversationController(), repos, { requireAuthFail: true });
      const result = await (controller as any).current("c1", contentType, "x1", {}, {});
      expect(result.status).toBe(401);
      expect(repos.conversation.save).not.toHaveBeenCalled();
      expect(decrypt).not.toHaveBeenCalled();
    }
  });

  it("does not decrypt or create streamingLiveHost for anon", async () => {
    const repos = conversationRepos();
    const controller = attach(new ConversationController(), repos, { requireAuthFail: true });
    const result = await (controller as any).current("c1", "streamingLiveHost", "encrypted-room-id-longer-than-eleven", {}, {});
    expect(result.status).toBe(401);
    expect(decrypt).not.toHaveBeenCalled();
    expect(repos.conversation.save).not.toHaveBeenCalled();
  });

  it("creates a public livestream room for a same-church authenticated caller", async () => {
    const repos = conversationRepos({ current: null });
    const controller = attach(new ConversationController(), repos, { au: { churchId: "c1", checkAccess: () => false } });
    const result = await (controller as any).current("c1", "streamingLive", "svc1", {}, {});
    expect(repos.conversation.save).toHaveBeenCalledWith(expect.objectContaining({ contentType: "streamingLive", visibility: "public", allowAnonymousPosts: true, contentId: "svc1" }));
    expect(result.allowAnonymousPosts).toBe(true);
    expect(decrypt).not.toHaveBeenCalled();
  });

  it("does not flip flags on an existing livestream row", async () => {
    const existing = { ...publicLive, allowAnonymousPosts: false, visibility: "hidden" };
    const repos = conversationRepos({ current: existing });
    const controller = attach(new ConversationController(), repos, { au: { churchId: "c1", checkAccess: () => false } });
    const result = await (controller as any).current("c1", "streamingLive", "svc1", {}, {});
    expect(result).toEqual(existing);
    expect(repos.conversation.save).not.toHaveBeenCalled();
  });

  it("ensures a public livestream room when an authenticated host opens host chat", async () => {
    const repos = conversationRepos({ current: null });
    repos.conversation.loadCurrent = jest.fn(async (_churchId: string, contentType: string) => contentType === "streamingLiveHost" ? null : null);
    const controller = attach(new ConversationController(), repos, { wrapperAu: { churchId: "c1", checkAccess: () => false } });
    await (controller as any).current("c1", "streamingLiveHost", "encrypted-room-id-longer-than-eleven", {}, {});
    expect(decrypt).toHaveBeenCalledWith("encrypted-room-id-longer-than-eleven");
    expect(repos.conversation.save).toHaveBeenCalledWith(expect.objectContaining({ contentType: "streamingLiveHost", allowAnonymousPosts: false, contentId: "decrypted:encrypted-room-id-longer-than-eleven" }));
    expect(repos.conversation.save).toHaveBeenCalledWith(expect.objectContaining({ contentType: "streamingLive", allowAnonymousPosts: true, visibility: "public", contentId: "decrypted:encrypted-room-id-longer-than-eleven" }));
  });
});

describe("ConversationController.loadByContent / loadById", () => {
  it("returns public livestream conversations", async () => {
    const repos = conversationRepos({ forContent: [publicLive], byId: publicLive });
    const controller = attach(new ConversationController(), repos);
    const list = await (controller as any).loadByContent("c1", "streamingLive", "svc1", {}, {});
    expect(list).toEqual([publicLive]);
    const one = await (controller as any).loadById("c1", "live1", {}, {});
    expect(one).toEqual(publicLive);
  });

  it("401s group and person conversations", async () => {
    const repos = conversationRepos({ forContent: [groupConv], byId: groupConv });
    const controller = attach(new ConversationController(), repos);
    expect((await (controller as any).loadByContent("c1", "group", "g1", {}, {})).status).toBe(401);
    expect((await (controller as any).loadById("c1", "grp1", {}, {})).status).toBe(401);
  });
});

describe("ConversationController.ensure", () => {
  it("creates a public streamingLive room for the JWT church", async () => {
    const repos = conversationRepos({ current: null });
    const controller = attach(new ConversationController(), repos, { wrapperAu: { churchId: "c1", checkAccess: () => false } });
    await (controller as any).ensure({ body: { contentType: "streamingLive", contentId: "svc1" } }, {});
    expect(repos.conversation.save).toHaveBeenCalledWith(expect.objectContaining({ churchId: "c1", contentType: "streamingLive", allowAnonymousPosts: true, visibility: "public" }));
  });

  it("rejects ensure for non-livestream types", async () => {
    const repos = conversationRepos();
    const controller = attach(new ConversationController(), repos, { wrapperAu: { churchId: "c1", checkAccess: () => false } });
    const result = await (controller as any).ensure({ body: { contentType: "group", contentId: "g1" } }, {});
    expect(result.status).toBe(401);
    expect(repos.conversation.save).not.toHaveBeenCalled();
  });
});

describe("MessageController.catchup / loadById / send", () => {
  it("allows catchup and send on a public streamingLive room", async () => {
    const repos = messageRepos({ byId: publicLive, messages: [{ id: "m1" }] });
    const controller = attach(new MessageController(), repos);
    const catchup = await (controller as any).catchup("c1", "live1", {}, {});
    expect(catchup).toEqual([{ id: "m1" }]);
    const sent = await (controller as any).send({ body: [{ churchId: "other", conversationId: "live1", content: "hi", personId: "pHack" }] }, {});
    expect(repos.message.save).toHaveBeenCalledWith(expect.objectContaining({ personId: null, churchId: "c1", content: "hi" }));
    expect(sent).toEqual([expect.objectContaining({ personId: null, churchId: "c1" })]);
  });

  it("401s catchup against a group or DM conversation", async () => {
    for (const conv of [groupConv, dmConv]) {
      const repos = messageRepos({ byId: conv });
      const controller = attach(new MessageController(), repos);
      expect((await (controller as any).catchup("c1", conv.id, {}, {})).status).toBe(401);
      expect(repos.message.loadForConversation).not.toHaveBeenCalled();
    }
  });

  it("401s send to a legacy non-livestream row that has allowAnonymousPosts", async () => {
    const repos = messageRepos({ byId: legacyFlag });
    const controller = attach(new MessageController(), repos);
    const result = await (controller as any).send({ body: [{ churchId: "c1", conversationId: "leg1", content: "hi" }] }, {});
    expect(result.status).toBe(401);
    expect(repos.message.save).not.toHaveBeenCalled();
  });

  it("401s loadById for a message in a group conversation", async () => {
    const repos = messageRepos({ byId: groupConv, message: { id: "m9", conversationId: "grp1" } });
    const controller = attach(new MessageController(), repos);
    expect((await (controller as any).loadById("c1", "m9", {}, {})).status).toBe(401);
  });
});

describe("ConnectionController", () => {
  it("allows anon join/list/leave on a public streamingLive room", async () => {
    const repos = connectionRepos({ byId: publicLive, byIdOnly: publicLive });
    const controller = attach(new ConnectionController(), repos);
    const listed = await (controller as any).load("c1", "live1", {}, {});
    expect(listed).toEqual([{ id: "cn1" }]);
    const saved = await (controller as any).save({ body: [{ churchId: "attacker", conversationId: "live1", displayName: "Anonymous " }] }, {});
    expect(repos.connection.save).toHaveBeenCalledWith(expect.objectContaining({ churchId: "c1", conversationId: "live1" }));
    expect(saved[0].churchId).toBe("c1");
    const left = await (controller as any).leaveRoom("c1", "live1", "sock1", {}, {});
    expect(left).toEqual({ success: true });
  });

  it("401s anon catchup-style join against a group or DM conversation", async () => {
    for (const conv of [groupConv, dmConv]) {
      const repos = connectionRepos({ byId: conv, byIdOnly: conv });
      const controller = attach(new ConnectionController(), repos);
      expect((await (controller as any).load("c1", conv.id, {}, {})).status).toBe(401);
      expect((await (controller as any).save({ body: [{ churchId: "c1", conversationId: conv.id }] }, {})).status).toBe(401);
      expect(repos.connection.save).not.toHaveBeenCalled();
    }
  });

  it("ignores body churchId and stamps the conversation church", async () => {
    const repos = connectionRepos({ byIdOnly: publicLive });
    const controller = attach(new ConnectionController(), repos);
    await (controller as any).save({ body: [{ churchId: "evilChurch", conversationId: "live1", socketId: "s1" }] }, {});
    expect(repos.connection.save).toHaveBeenCalledWith(expect.objectContaining({ churchId: "c1" }));
    expect(repos.conversation.loadByIdOnly).toHaveBeenCalledWith("live1");
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
    await (controller as any).setName({ body: { socketId: "s1", name: "Pat" } }, {});
    expect(repos.connection.save).toHaveBeenCalledTimes(1);
    expect(repos.connection.save).toHaveBeenCalledWith(expect.objectContaining({ id: "a", displayName: "Pat" }));
  });

  it("401s setName when every connection is a private room", async () => {
    const repos = connectionRepos({ socketConnections: [{ id: "b", churchId: "c1", conversationId: "grp1" }] });
    repos.conversation.loadById = jest.fn(async () => groupConv);
    const controller = attach(new ConnectionController(), repos);
    const result = await (controller as any).setName({ body: { socketId: "s1", name: "Pat" } }, {});
    expect(result.status).toBe(401);
    expect(repos.connection.save).not.toHaveBeenCalled();
  });

  it("allows an authenticated same-church client to join host chat", async () => {
    const repos = connectionRepos({ byIdOnly: hostConv, byId: hostConv });
    const controller = attach(new ConnectionController(), repos, { au: { churchId: "c1" } });
    await (controller as any).save({ body: [{ churchId: "ignored", conversationId: "host1" }] }, {});
    expect(repos.connection.save).toHaveBeenCalledWith(expect.objectContaining({ churchId: "c1" }));
  });
});
