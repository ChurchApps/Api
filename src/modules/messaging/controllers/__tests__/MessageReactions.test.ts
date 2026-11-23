import "reflect-metadata";
import type { Response } from "express";
import type { AuthenticatedUser } from "@churchapps/apihelper";
import type { Repos } from "../../repositories/index.js";
import { Conversation, Message, MessageReaction, PrivateMessage } from "../../models/index.js";

// The mocked Permissions below are plain strings, so the stub's checks pass strings to checkAccess.
type PermissionChecker = { checkAccess(perm: unknown): boolean };

jest.mock("../MessagingBaseController", () => ({
  MessagingBaseController: class {
    json(obj: unknown, status: number) { return { obj, status }; }
    isPersonNote(contentType?: string) { return contentType === "person" || contentType === "personConfidential"; }
    canViewPersonNotes(au: PermissionChecker, contentType?: string) {
      if (!au) return false;
      return au.checkAccess(contentType === "personConfidential" ? "peopleViewConfidentialNotes" : "peopleEdit");
    }
    isNote(contentType?: string) { return this.isPersonNote(contentType) || contentType === "groupNote" || contentType === "eventNote"; }
    async isPrivateMessageParticipant(this: { repos: Pick<Repos, "privateMessage"> }, au: AuthenticatedUser, conv: Conversation) {
      const pm = (await this.repos.privateMessage.loadByConversationId(au.churchId, conv.id)) ?? (await this.repos.privateMessage.loadById(au.churchId, conv.contentId));
      return !!pm && (pm.fromPersonId === au.personId || pm.toPersonId === au.personId);
    }
    async canUseNotes(au: AuthenticatedUser, conv: { contentType?: string }) {
      if (this.isPersonNote(conv?.contentType)) return this.canViewPersonNotes(au, conv.contentType);
      return false;
    }
  }
}));
jest.mock("../../helpers/DeliveryHelper", () => ({ DeliveryHelper: { sendConversationMessages: jest.fn() } }));
jest.mock("../../helpers/NotificationHelper", () => ({ NotificationHelper: { checkShouldNotify: jest.fn() } }));
jest.mock("../../../../shared/helpers/Permissions", () => ({ Permissions: { content: { edit: "contentEdit" }, people: { edit: "peopleEdit", viewConfidentialNotes: "peopleViewConfidentialNotes" } } }));

import { MessageController } from "../MessageController.js";
import { DeliveryHelper } from "../../helpers/DeliveryHelper.js";

const sendMock = DeliveryHelper.sendConversationMessages as jest.Mock;

// What the stubbed json() hands back, and the shape the result assertions read.
interface JsonStub { obj?: unknown; status?: number; added?: boolean }
type ReactionRequest = Parameters<MessageController["toggleReaction"]>[1];

interface ControllerOpts {
  message?: Message;
  conversation?: Conversation;
  privateMessage?: PrivateMessage;
  existing?: MessageReaction;
  personId?: string;
  groupIds?: string[];
  access?: string[];
}

function makeController(opts: ControllerOpts = {}) {
  const repos = {
    message: { loadById: jest.fn(async () => opts.message ?? { id: "m1", conversationId: "conv1" }) },
    conversation: {
      loadById: jest.fn(async () => opts.conversation),
      convertToModel: (c: Conversation) => c
    },
    privateMessage: { loadById: jest.fn(async () => opts.privateMessage), loadByConversationId: jest.fn(async (): Promise<PrivateMessage | null> => null) },
    messageReaction: {
      loadOne: jest.fn(async () => opts.existing ?? null),
      create: jest.fn(async (m: MessageReaction) => ({ ...m, id: "rx1" })),
      delete: jest.fn(async (): Promise<void> => undefined)
    }
  };
  // The mocked Permissions hand checkAccess plain strings.
  const au = { churchId: "c1", personId: opts.personId ?? "p1", groupIds: opts.groupIds ?? [], checkAccess: (perm: unknown) => (opts.access ?? []).some((a) => a === perm) } as AuthenticatedUser;
  const controller = new MessageController();
  controller.actionWrapper = (_req, _res, action) => action(au);
  // repos is a partial mock and json() is swapped for a plain stub, so neither matches the real type.
  Object.assign(controller, { repos, json: (obj: unknown, status: number): JsonStub => ({ obj, status }) });
  return { controller, repos };
}

const res = {} as Response;

beforeEach(() => sendMock.mockReset());

describe("MessageController.toggleReaction", () => {
  const req = { body: { emoji: "👍" } } as ReactionRequest;

  it("adds a reaction and broadcasts when none exists (group member)", async () => {
    const { controller, repos } = makeController({ conversation: { id: "conv1", contentType: "group", contentId: "g1" }, groupIds: ["g1"] });
    const result = await controller.toggleReaction("m1", req, res) as JsonStub;
    expect(repos.messageReaction.create).toHaveBeenCalled();
    expect(result).toMatchObject({ messageId: "m1", emoji: "👍", added: true });
    expect(sendMock).toHaveBeenCalledWith(expect.objectContaining({ action: "reaction", data: expect.objectContaining({ messageId: "m1", added: true }) }));
  });

  it("removes the reaction on the second toggle", async () => {
    const { controller, repos } = makeController({ conversation: { id: "conv1", contentType: "group", contentId: "g1" }, groupIds: ["g1"], existing: { id: "rx1" } });
    const result = await controller.toggleReaction("m1", req, res) as JsonStub;
    expect(repos.messageReaction.delete).toHaveBeenCalledWith("c1", "rx1");
    expect(result.added).toBe(false);
  });

  it("rejects a non-member of the group (401)", async () => {
    const { controller, repos } = makeController({ conversation: { id: "conv1", contentType: "group", contentId: "g1" }, groupIds: ["other"] });
    const result = await controller.toggleReaction("m1", req, res) as JsonStub;
    expect(result.status).toBe(401);
    expect(repos.messageReaction.create).not.toHaveBeenCalled();
  });

  it("allows a private-message participant", async () => {
    const { controller, repos } = makeController({ conversation: { id: "conv1", contentType: "privateMessage", contentId: "pm1" }, privateMessage: { fromPersonId: "p1", toPersonId: "p2" } });
    await controller.toggleReaction("m1", req, res);
    expect(repos.messageReaction.create).toHaveBeenCalled();
  });

  it("rejects a non-participant of a private message", async () => {
    const { controller } = makeController({ conversation: { id: "conv1", contentType: "privateMessage", contentId: "pm1" }, privateMessage: { fromPersonId: "pX", toPersonId: "pY" } });
    const result = await controller.toggleReaction("m1", req, res) as JsonStub;
    expect(result.status).toBe(401);
  });

  it("allows staff with content.edit (moderation override)", async () => {
    const { controller, repos } = makeController({ conversation: { id: "conv1", contentType: "group", contentId: "g1" }, groupIds: ["other"], access: ["contentEdit"] });
    await controller.toggleReaction("m1", req, res);
    expect(repos.messageReaction.create).toHaveBeenCalled();
  });

  it("allows people.edit on a person-notes conversation", async () => {
    const { controller, repos } = makeController({ conversation: { id: "conv1", contentType: "person", contentId: "p9" }, access: ["peopleEdit"] });
    await controller.toggleReaction("m1", req, res);
    expect(repos.messageReaction.create).toHaveBeenCalled();
  });

  it("rejects person-notes conversations without people.edit, even with content.edit", async () => {
    const { controller } = makeController({ conversation: { id: "conv1", contentType: "person", contentId: "p9" }, access: ["contentEdit"] });
    const result = await controller.toggleReaction("m1", req, res) as JsonStub;
    expect(result.status).toBe(401);
  });

  it("rejects confidential person notes without the confidential permission", async () => {
    const { controller } = makeController({ conversation: { id: "conv1", contentType: "personConfidential", contentId: "p9" }, access: ["peopleEdit"] });
    const result = await controller.toggleReaction("m1", req, res) as JsonStub;
    expect(result.status).toBe(401);
  });

  it("404s when the message is missing", async () => {
    const { controller } = makeController({ message: {}, conversation: { id: "conv1", contentType: "group", contentId: "g1" }, groupIds: ["g1"] });
    const result = await controller.toggleReaction("m1", req, res) as JsonStub;
    expect(result.status).toBe(404);
  });

  it("400s when emoji is missing", async () => {
    const { controller } = makeController({ conversation: { id: "conv1", contentType: "group", contentId: "g1" }, groupIds: ["g1"] });
    const result = await controller.toggleReaction("m1", { body: {} } as ReactionRequest, res) as JsonStub;
    expect(result.status).toBe(400);
  });
});
