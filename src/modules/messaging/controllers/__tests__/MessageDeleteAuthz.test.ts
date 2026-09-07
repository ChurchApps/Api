import "reflect-metadata";
jest.mock("../MessagingBaseController", () => ({
  MessagingBaseController: class {
    json(obj: any, status: number) { return { obj, status }; }
    isPersonNote(contentType?: string) { return contentType === "person" || contentType === "personConfidential"; }
    canViewPersonNotes(au: any, contentType?: string) {
      if (!au) return false;
      return au.checkAccess(contentType === "personConfidential" ? "peopleViewConfidentialNotes" : "peopleEdit");
    }
    isGroupFeed(contentType?: string) { return contentType === "group" || contentType === "groupAnnouncement"; }
    // Membership-only stand-in; the real toggle/leader rules are covered in MessageParticipation.test.ts.
    async canPostToGroupFeed(au: any, _contentType: string, contentId?: string) { return !!contentId && !!au?.groupIds?.includes(contentId); }
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
    message: {
      loadById: jest.fn(async () => opts.message ?? { id: "m1", conversationId: "conv1", personId: "p2" }),
      save: jest.fn(async (m: any) => ({ ...m, id: m.id ?? "m9" })),
      delete: jest.fn(async () => undefined),
      convertAllToModel: (r: any[]) => r
    },
    conversation: {
      loadById: jest.fn(async () => opts.conversation),
      convertToModel: (c: any) => c,
      updateStats: jest.fn(async () => undefined)
    },
    privateMessage: { loadById: jest.fn(async () => opts.privateMessage) }
  };
  const au = {
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

const groupConv = { id: "conv1", contentType: "group", contentId: "g1" };

beforeEach(() => sendMock.mockReset());

describe("MessageController.delete authorization", () => {
  it("lets the author delete their own message", async () => {
    const { controller, repos } = makeController({ conversation: groupConv, message: { id: "m1", conversationId: "conv1", personId: "p1" } });
    const result = await (controller as any).delete("m1", {}, {});
    expect(repos.message.delete).toHaveBeenCalledWith("c1", "m1");
    expect(result.status).toBe(200);
    expect(sendMock).toHaveBeenCalledWith(expect.objectContaining({ action: "deleteMessage" }));
  });

  it("lets a group leader delete another member's message in their group", async () => {
    const { controller, repos } = makeController({ conversation: groupConv, leaderGroupIds: ["g1"], groupIds: ["g1"] });
    const result = await (controller as any).delete("m1", {}, {});
    expect(repos.message.delete).toHaveBeenCalledWith("c1", "m1");
    expect(result.status).toBe(200);
  });

  it("lets a leader moderate a groupAnnouncement conversation", async () => {
    const { controller, repos } = makeController({ conversation: { id: "conv1", contentType: "groupAnnouncement", contentId: "g1" }, leaderGroupIds: ["g1"] });
    await (controller as any).delete("m1", {}, {});
    expect(repos.message.delete).toHaveBeenCalled();
  });

  it("rejects a plain group member deleting someone else's message", async () => {
    const { controller, repos } = makeController({ conversation: groupConv, groupIds: ["g1"] });
    const result = await (controller as any).delete("m1", {}, {});
    expect(result.status).toBe(401);
    expect(repos.message.delete).not.toHaveBeenCalled();
  });

  it("rejects a leader of another group", async () => {
    const { controller, repos } = makeController({ conversation: groupConv, leaderGroupIds: ["g2"], groupIds: ["g1"] });
    const result = await (controller as any).delete("m1", {}, {});
    expect(result.status).toBe(401);
    expect(repos.message.delete).not.toHaveBeenCalled();
  });

  it("never leader-moderates a person-note conversation", async () => {
    const { controller, repos } = makeController({ conversation: { id: "conv1", contentType: "person", contentId: "g1" }, leaderGroupIds: ["g1"], access: ["contentEdit"] });
    const result = await (controller as any).delete("m1", {}, {});
    expect(result.status).toBe(401);
    expect(repos.message.delete).not.toHaveBeenCalled();
  });

  it("allows people.edit staff on a person-note conversation", async () => {
    const { controller, repos } = makeController({ conversation: { id: "conv1", contentType: "person", contentId: "p9" }, access: ["peopleEdit"] });
    await (controller as any).delete("m1", {}, {});
    expect(repos.message.delete).toHaveBeenCalled();
  });

  it("allows staff with content.edit anywhere", async () => {
    const { controller, repos } = makeController({ conversation: groupConv, access: ["contentEdit"] });
    const result = await (controller as any).delete("m1", {}, {});
    expect(result.status).toBe(200);
    expect(repos.message.delete).toHaveBeenCalled();
  });

  it("404s when the message is missing", async () => {
    const { controller } = makeController({ conversation: groupConv, message: {} });
    const result = await (controller as any).delete("m1", {}, {});
    expect(result.status).toBe(404);
  });
});

describe("MessageController.save update authorization", () => {
  it("rejects a plain member updating someone else's message", async () => {
    const { controller, repos } = makeController({ conversation: groupConv, groupIds: ["g1"] });
    const req = { body: [{ id: "m1", conversationId: "conv1", content: "hacked" }] };
    const result = await (controller as any).save(req, {});
    expect(result.status).toBe(401);
    expect(repos.message.save).not.toHaveBeenCalled();
  });

  it("does not let a group leader edit another member's message", async () => {
    const { controller, repos } = makeController({ conversation: groupConv, leaderGroupIds: ["g1"], groupIds: ["g1"] });
    const req = { body: [{ id: "m1", conversationId: "conv1", content: "rewritten" }] };
    const result = await (controller as any).save(req, {});
    expect(result.status).toBe(401);
    expect(repos.message.save).not.toHaveBeenCalled();
  });

  it("cannot reassign authorship when updating your own message", async () => {
    const { controller, repos } = makeController({ conversation: groupConv, message: { id: "m1", conversationId: "conv1", personId: "p1" } });
    const req = { body: [{ id: "m1", conversationId: "conv1", content: "edited", personId: "p2" }] };
    await (controller as any).save(req, {});
    expect(repos.message.save).toHaveBeenCalledWith(expect.objectContaining({ id: "m1", personId: "p1" }));
  });

  it("still creates new messages for the caller", async () => {
    const { controller, repos } = makeController({ conversation: groupConv, groupIds: ["g1"] });
    const req = { body: [{ conversationId: "conv1", content: "hello" }] };
    await (controller as any).save(req, {});
    expect(repos.message.save).toHaveBeenCalledWith(expect.objectContaining({ personId: "p1", content: "hello" }));
  });
});
