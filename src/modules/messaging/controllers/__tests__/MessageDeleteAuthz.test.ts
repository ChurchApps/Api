import "reflect-metadata";
import type { Request, Response } from "express";
import type { AuthenticatedUser } from "@churchapps/apihelper";
import { Conversation, Message, PrivateMessage } from "../../models/index.js";

// The mocked Permissions below are plain strings, so the stub's checks pass strings to checkAccess.
type PermissionChecker = { checkAccess(perm: unknown): boolean };

jest.mock("../MessagingBaseController", () => ({
  MessagingBaseController: class {
    async writeAuditLog() {}
    json(obj: unknown, status: number) { return { obj, status }; }
    isPersonNote(contentType?: string) { return contentType === "person" || contentType === "personConfidential"; }
    canViewPersonNotes(au: PermissionChecker, contentType?: string) {
      if (!au) return false;
      return au.checkAccess(contentType === "personConfidential" ? "peopleViewConfidentialNotes" : "peopleEdit");
    }
    isNote(contentType?: string) { return this.isPersonNote(contentType) || contentType === "groupNote" || contentType === "eventNote"; }
    async canUseNotes(au: AuthenticatedUser, conv: { contentType?: string }) {
      if (this.isPersonNote(conv?.contentType)) return this.canViewPersonNotes(au, conv.contentType);
      return false;
    }
    isGroupFeed(contentType?: string) { return contentType === "group" || contentType === "groupAnnouncement"; }
    // Membership-only stand-in; the real toggle/leader rules are covered in MessageParticipation.test.ts.
    async canPostToGroupFeed(au: AuthenticatedUser, _contentType: string, contentId?: string) { return !!contentId && !!au?.groupIds?.includes(contentId); }
  }
}));
jest.mock("../../helpers/DeliveryHelper", () => ({ DeliveryHelper: { sendConversationMessages: jest.fn() } }));
jest.mock("../../helpers/NotificationHelper", () => ({ NotificationHelper: { checkShouldNotify: jest.fn() } }));
jest.mock("../../../../shared/helpers/Permissions", () => ({ Permissions: { content: { edit: "contentEdit" }, people: { edit: "peopleEdit", viewConfidentialNotes: "peopleViewConfidentialNotes" } } }));

import { MessageController } from "../MessageController.js";
import { DeliveryHelper } from "../../helpers/DeliveryHelper.js";

const sendMock = DeliveryHelper.sendConversationMessages as jest.Mock;

// What the stubbed json() hands back, and the shape the result assertions read.
interface JsonStub { obj?: unknown; status?: number }
type SaveRequest = Parameters<MessageController["save"]>[0];

interface ControllerOpts {
  message?: Message;
  conversation?: Conversation;
  privateMessage?: PrivateMessage;
  privateMessageByConversation?: PrivateMessage;
  personId?: string;
  groupIds?: string[];
  leaderGroupIds?: string[];
  access?: string[];
}

function makeController(opts: ControllerOpts = {}) {
  const repos = {
    message: {
      loadById: jest.fn(async () => opts.message ?? { id: "m1", conversationId: "conv1", personId: "p2" }),
      save: jest.fn(async (m: Message) => ({ ...m, id: m.id ?? "m9" })),
      delete: jest.fn(async (): Promise<void> => undefined),
      convertAllToModel: (r: Message[]) => r
    },
    conversation: {
      loadById: jest.fn(async () => opts.conversation),
      convertToModel: (c: Conversation) => c,
      updateStats: jest.fn(async (): Promise<void> => undefined)
    },
    privateMessage: { loadById: jest.fn(async () => opts.privateMessage), loadByConversationId: jest.fn(async () => opts.privateMessageByConversation ?? null) }
  };
  const au = {
    churchId: "c1",
    personId: opts.personId ?? "p1",
    firstName: "Test",
    lastName: "User",
    groupIds: opts.groupIds ?? [],
    leaderGroupIds: opts.leaderGroupIds ?? [],
    // The mocked Permissions hand checkAccess plain strings.
    checkAccess: (perm: unknown) => (opts.access ?? []).some((a) => a === perm)
  } as AuthenticatedUser;
  const controller = new MessageController();
  controller.actionWrapper = (_req, _res, action) => action(au);
  // repos is a partial mock and json() is swapped for a plain stub, so neither matches the real type.
  Object.assign(controller, { repos, json: (obj: unknown, status: number): JsonStub => ({ obj, status }) });
  return { controller, repos };
}

const emptyReq = {} as Request;
const res = {} as Response;

const groupConv = { id: "conv1", contentType: "group", contentId: "g1" };

beforeEach(() => sendMock.mockReset());

describe("MessageController.delete authorization", () => {
  it("lets the author delete their own message", async () => {
    const { controller, repos } = makeController({ conversation: groupConv, message: { id: "m1", conversationId: "conv1", personId: "p1" } });
    const result = await controller.delete("m1", emptyReq, res) as JsonStub;
    expect(repos.message.delete).toHaveBeenCalledWith("c1", "m1");
    expect(result.status).toBe(200);
    expect(sendMock).toHaveBeenCalledWith(expect.objectContaining({ action: "deleteMessage" }));
  });

  it("lets a group leader delete another member's message in their group", async () => {
    const { controller, repos } = makeController({ conversation: groupConv, leaderGroupIds: ["g1"], groupIds: ["g1"] });
    const result = await controller.delete("m1", emptyReq, res) as JsonStub;
    expect(repos.message.delete).toHaveBeenCalledWith("c1", "m1");
    expect(result.status).toBe(200);
  });

  it("lets a leader moderate a groupAnnouncement conversation", async () => {
    const { controller, repos } = makeController({ conversation: { id: "conv1", contentType: "groupAnnouncement", contentId: "g1" }, leaderGroupIds: ["g1"] });
    await controller.delete("m1", emptyReq, res);
    expect(repos.message.delete).toHaveBeenCalled();
  });

  it("rejects a plain group member deleting someone else's message", async () => {
    const { controller, repos } = makeController({ conversation: groupConv, groupIds: ["g1"] });
    const result = await controller.delete("m1", emptyReq, res) as JsonStub;
    expect(result.status).toBe(401);
    expect(repos.message.delete).not.toHaveBeenCalled();
  });

  it("rejects a leader of another group", async () => {
    const { controller, repos } = makeController({ conversation: groupConv, leaderGroupIds: ["g2"], groupIds: ["g1"] });
    const result = await controller.delete("m1", emptyReq, res) as JsonStub;
    expect(result.status).toBe(401);
    expect(repos.message.delete).not.toHaveBeenCalled();
  });

  it("never leader-moderates a person-note conversation", async () => {
    const { controller, repos } = makeController({ conversation: { id: "conv1", contentType: "person", contentId: "g1" }, leaderGroupIds: ["g1"], access: ["contentEdit"] });
    const result = await controller.delete("m1", emptyReq, res) as JsonStub;
    expect(result.status).toBe(401);
    expect(repos.message.delete).not.toHaveBeenCalled();
  });

  it("allows people.edit staff on a person-note conversation", async () => {
    const { controller, repos } = makeController({ conversation: { id: "conv1", contentType: "person", contentId: "p9" }, access: ["peopleEdit"] });
    await controller.delete("m1", emptyReq, res);
    expect(repos.message.delete).toHaveBeenCalled();
  });

  it("allows staff with content.edit anywhere", async () => {
    const { controller, repos } = makeController({ conversation: groupConv, access: ["contentEdit"] });
    const result = await controller.delete("m1", emptyReq, res) as JsonStub;
    expect(result.status).toBe(200);
    expect(repos.message.delete).toHaveBeenCalled();
  });

  it("404s when the message is missing", async () => {
    const { controller } = makeController({ conversation: groupConv, message: {} });
    const result = await controller.delete("m1", emptyReq, res) as JsonStub;
    expect(result.status).toBe(404);
  });
});

describe("MessageController.save update authorization", () => {
  it("rejects a plain member updating someone else's message", async () => {
    const { controller, repos } = makeController({ conversation: groupConv, groupIds: ["g1"] });
    const req = { body: [{ id: "m1", conversationId: "conv1", content: "hacked" }] } as SaveRequest;
    const result = await controller.save(req, res) as JsonStub;
    expect(result.status).toBe(401);
    expect(repos.message.save).not.toHaveBeenCalled();
  });

  it("does not let a group leader edit another member's message", async () => {
    const { controller, repos } = makeController({ conversation: groupConv, leaderGroupIds: ["g1"], groupIds: ["g1"] });
    const req = { body: [{ id: "m1", conversationId: "conv1", content: "rewritten" }] } as SaveRequest;
    const result = await controller.save(req, res) as JsonStub;
    expect(result.status).toBe(401);
    expect(repos.message.save).not.toHaveBeenCalled();
  });

  it("cannot reassign authorship when updating your own message", async () => {
    const { controller, repos } = makeController({ conversation: groupConv, message: { id: "m1", conversationId: "conv1", personId: "p1" } });
    const req = { body: [{ id: "m1", conversationId: "conv1", content: "edited", personId: "p2" }] } as SaveRequest;
    await controller.save(req, res);
    expect(repos.message.save).toHaveBeenCalledWith(expect.objectContaining({ id: "m1", personId: "p1" }));
  });

  it("still creates new messages for the caller", async () => {
    const { controller, repos } = makeController({ conversation: groupConv, groupIds: ["g1"] });
    const req = { body: [{ conversationId: "conv1", content: "hello" }] } as SaveRequest;
    await controller.save(req, res);
    expect(repos.message.save).toHaveBeenCalledWith(expect.objectContaining({ personId: "p1", content: "hello" }));
  });
});
