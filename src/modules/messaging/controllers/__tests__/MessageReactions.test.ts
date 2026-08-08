import "reflect-metadata";
jest.mock("../MessagingBaseController", () => ({
  MessagingBaseController: class {
    json(obj: any, status: number) { return { obj, status }; }
    isPersonNote(contentType?: string) { return contentType === "person" || contentType === "personConfidential"; }
    canViewPersonNotes(au: any, contentType?: string) {
      if (!au) return false;
      return au.checkAccess(contentType === "personConfidential" ? "peopleViewConfidentialNotes" : "peopleEdit");
    }
  }
}));
jest.mock("../../helpers/DeliveryHelper", () => ({ DeliveryHelper: { sendConversationMessages: jest.fn() } }));
jest.mock("../../helpers/NotificationHelper", () => ({ NotificationHelper: { checkShouldNotify: jest.fn() } }));
jest.mock("../../../../shared/helpers/Permissions", () => ({ Permissions: { content: { edit: "contentEdit" }, people: { edit: "peopleEdit", viewConfidentialNotes: "peopleViewConfidentialNotes" } } }));

import { MessageController } from "../MessageController.js";
import { DeliveryHelper } from "../../helpers/DeliveryHelper.js";

const sendMock = DeliveryHelper.sendConversationMessages as jest.Mock;

function makeController(opts: any = {}) {
  const repos: any = {
    message: { loadById: jest.fn(async () => opts.message ?? { id: "m1", conversationId: "conv1" }) },
    conversation: {
      loadById: jest.fn(async () => opts.conversation),
      convertToModel: (c: any) => c
    },
    privateMessage: { loadById: jest.fn(async () => opts.privateMessage) },
    messageReaction: {
      loadOne: jest.fn(async () => opts.existing ?? null),
      create: jest.fn(async (m: any) => ({ ...m, id: "rx1" })),
      delete: jest.fn(async () => undefined)
    }
  };
  const au = { churchId: "c1", personId: opts.personId ?? "p1", groupIds: opts.groupIds ?? [], checkAccess: (perm: any) => (opts.access ?? []).includes(perm) };
  const controller = new MessageController();
  (controller as any).repos = repos;
  (controller as any).actionWrapper = (_req: any, _res: any, action: any) => action(au);
  (controller as any).json = (obj: any, status: number) => ({ obj, status });
  return { controller, repos };
}

beforeEach(() => sendMock.mockReset());

describe("MessageController.toggleReaction", () => {
  const req = { body: { emoji: "👍" } };

  it("adds a reaction and broadcasts when none exists (group member)", async () => {
    const { controller, repos } = makeController({ conversation: { id: "conv1", contentType: "group", contentId: "g1" }, groupIds: ["g1"] });
    const result = await (controller as any).toggleReaction("m1", req, {});
    expect(repos.messageReaction.create).toHaveBeenCalled();
    expect(result).toMatchObject({ messageId: "m1", emoji: "👍", added: true });
    expect(sendMock).toHaveBeenCalledWith(expect.objectContaining({ action: "reaction", data: expect.objectContaining({ messageId: "m1", added: true }) }));
  });

  it("removes the reaction on the second toggle", async () => {
    const { controller, repos } = makeController({ conversation: { id: "conv1", contentType: "group", contentId: "g1" }, groupIds: ["g1"], existing: { id: "rx1" } });
    const result = await (controller as any).toggleReaction("m1", req, {});
    expect(repos.messageReaction.delete).toHaveBeenCalledWith("c1", "rx1");
    expect(result.added).toBe(false);
  });

  it("rejects a non-member of the group (401)", async () => {
    const { controller, repos } = makeController({ conversation: { id: "conv1", contentType: "group", contentId: "g1" }, groupIds: ["other"] });
    const result = await (controller as any).toggleReaction("m1", req, {});
    expect(result.status).toBe(401);
    expect(repos.messageReaction.create).not.toHaveBeenCalled();
  });

  it("allows a private-message participant", async () => {
    const { controller, repos } = makeController({ conversation: { id: "conv1", contentType: "privateMessage", contentId: "pm1" }, privateMessage: { fromPersonId: "p1", toPersonId: "p2" } });
    await (controller as any).toggleReaction("m1", req, {});
    expect(repos.messageReaction.create).toHaveBeenCalled();
  });

  it("rejects a non-participant of a private message", async () => {
    const { controller } = makeController({ conversation: { id: "conv1", contentType: "privateMessage", contentId: "pm1" }, privateMessage: { fromPersonId: "pX", toPersonId: "pY" } });
    const result = await (controller as any).toggleReaction("m1", req, {});
    expect(result.status).toBe(401);
  });

  it("allows staff with content.edit (moderation override)", async () => {
    const { controller, repos } = makeController({ conversation: { id: "conv1", contentType: "group", contentId: "g1" }, groupIds: ["other"], access: ["contentEdit"] });
    await (controller as any).toggleReaction("m1", req, {});
    expect(repos.messageReaction.create).toHaveBeenCalled();
  });

  it("allows people.edit on a person-notes conversation", async () => {
    const { controller, repos } = makeController({ conversation: { id: "conv1", contentType: "person", contentId: "p9" }, access: ["peopleEdit"] });
    await (controller as any).toggleReaction("m1", req, {});
    expect(repos.messageReaction.create).toHaveBeenCalled();
  });

  it("rejects person-notes conversations without people.edit, even with content.edit", async () => {
    const { controller } = makeController({ conversation: { id: "conv1", contentType: "person", contentId: "p9" }, access: ["contentEdit"] });
    const result = await (controller as any).toggleReaction("m1", req, {});
    expect(result.status).toBe(401);
  });

  it("rejects confidential person notes without the confidential permission", async () => {
    const { controller } = makeController({ conversation: { id: "conv1", contentType: "personConfidential", contentId: "p9" }, access: ["peopleEdit"] });
    const result = await (controller as any).toggleReaction("m1", req, {});
    expect(result.status).toBe(401);
  });

  it("404s when the message is missing", async () => {
    const { controller } = makeController({ message: {}, conversation: { id: "conv1", contentType: "group", contentId: "g1" }, groupIds: ["g1"] });
    const result = await (controller as any).toggleReaction("m1", req, {});
    expect(result.status).toBe(404);
  });

  it("400s when emoji is missing", async () => {
    const { controller } = makeController({ conversation: { id: "conv1", contentType: "group", contentId: "g1" }, groupIds: ["g1"] });
    const result = await (controller as any).toggleReaction("m1", { body: {} }, {});
    expect(result.status).toBe(400);
  });
});
