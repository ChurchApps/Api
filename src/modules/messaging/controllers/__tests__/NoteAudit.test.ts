import "reflect-metadata";

const logMock = jest.fn(async () => undefined);

// Note edits and deletes go to the membership Audit Log (ChurchAppsSupport#1475); chat stays out.
jest.mock("../MessagingBaseController", () => ({
  MessagingBaseController: class {
    json(obj: any, status: number) { return { obj, status }; }
    isPersonNote(contentType?: string) { return contentType === "person" || contentType === "personConfidential"; }
    isNote(contentType?: string) { return this.isPersonNote(contentType) || contentType === "groupNote" || contentType === "eventNote"; }
    async canUseNotes() { return true; }
    isGroupFeed(contentType?: string) { return contentType === "group" || contentType === "groupAnnouncement"; }
    async canPostToGroupFeed() { return true; }
    writeAuditLog = logMock;
  }
}));
jest.mock("../../helpers/DeliveryHelper", () => ({ DeliveryHelper: { sendConversationMessages: jest.fn() } }));
jest.mock("../../helpers/NotificationHelper", () => ({ NotificationHelper: { checkShouldNotify: jest.fn() } }));
jest.mock("../../../../shared/helpers/Permissions", () => ({ Permissions: { content: { edit: "contentEdit" }, people: { edit: "peopleEdit", viewConfidentialNotes: "peopleViewConfidentialNotes" } } }));

import { MessageController } from "../MessageController.js";

function makeController(conversation: any, message: any) {
  const repos: any = {
    message: {
      loadById: jest.fn(async () => message),
      save: jest.fn(async (m: any) => ({ ...m, id: m.id ?? "m9" })),
      delete: jest.fn(async () => undefined),
      convertAllToModel: (r: any[]) => r
    },
    conversation: { loadById: jest.fn(async () => conversation), convertToModel: (c: any) => c, updateStats: jest.fn(async () => undefined) }
  };
  const au = { id: "u1", churchId: "c1", personId: "p1", firstName: "Test", lastName: "User", groupIds: ["g1"], leaderGroupIds: [] as string[], checkAccess: () => true };
  const controller = new MessageController();
  (controller as any).repos = repos;
  (controller as any).actionWrapper = (_req: any, _res: any, action: any) => action(au);
  (controller as any).json = (obj: any, status: number) => ({ obj, status });
  return { controller, repos };
}

const req = (body: any = null) => ({ body, params: {}, headers: {}, socket: {} }) as any;
const note = { id: "m1", conversationId: "conv1", personId: "p1", displayName: "Test User", content: "Visited in hospital", timeSent: "2026-11-01" };

describe("Note audit logging", () => {
  beforeEach(() => logMock.mockClear());

  it("logs a deleted person note with its text", async () => {
    const { controller, repos } = makeController({ id: "conv1", contentType: "person", contentId: "per1" }, note);
    await controller.delete("m1", req(), {} as any);
    expect(repos.message.delete).toHaveBeenCalled();
    expect(logMock).toHaveBeenCalledTimes(1);
    const [, au, category, action, entityType, entityId, details] = logMock.mock.calls[0] as any[];
    expect(au.churchId).toBe("c1");
    expect({ category, action, entityType, entityId }).toEqual({ category: "person", action: "note_deleted", entityType: "note", entityId: "per1" });
    expect(details.before.content).toBe("Visited in hospital");
    expect(details.after).toBeNull();
  });

  it("logs an edited group note with the previous text", async () => {
    const { controller } = makeController({ id: "conv1", contentType: "groupNote", contentId: "g1" }, note);
    await controller.save(req([{ id: "m1", conversationId: "conv1", content: "Visited at home" }]), {} as any);
    expect(logMock).toHaveBeenCalledTimes(1);
    const [, , category, action, , entityId, details] = logMock.mock.calls[0] as any[];
    expect({ category, action, entityId }).toEqual({ category: "group", action: "note_updated", entityId: "g1" });
    expect(details.before.content).toBe("Visited in hospital");
    expect(details.after.content).toBe("Visited at home");
  });

  it("logs a new note as note_saved", async () => {
    const { controller } = makeController({ id: "conv1", contentType: "person", contentId: "per1" }, note);
    await controller.save(req([{ conversationId: "conv1", content: "First visit" }]), {} as any);
    expect(logMock).toHaveBeenCalledTimes(1);
    const call = logMock.mock.calls[0] as any[];
    expect(call[3]).toBe("note_saved");
    expect(call[6].before).toBeNull();
  });

  it("does not log group chat", async () => {
    const { controller, repos } = makeController({ id: "conv1", contentType: "group", contentId: "g1" }, note);
    await controller.delete("m1", req(), {} as any);
    await controller.save(req([{ id: "m1", conversationId: "conv1", content: "edited chat" }]), {} as any);
    expect(repos.message.delete).toHaveBeenCalled();
    expect(logMock).not.toHaveBeenCalled();
  });
});
