import "reflect-metadata";
import express from "express";
import { AuthenticatedUser } from "@churchapps/apihelper";
import { Conversation, Message } from "../../models/index.js";

type AuditDetails = { before: Partial<Message> | null; after: Partial<Message> | null };
const logMock = jest.fn<Promise<undefined>, [express.Request, AuthenticatedUser, string, string, string, string | undefined, AuditDetails]>(async () => undefined);

// Note edits and deletes go to the membership Audit Log (ChurchAppsSupport#1475); chat stays out.
jest.mock("../MessagingBaseController", () => ({
  MessagingBaseController: class {
    json(obj: unknown, status: number) { return { obj, status }; }
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

// The fixture mirrors a raw row, so timeSent is a string.
type NoteRow = Omit<Message, "timeSent"> & { timeSent?: string };

function makeController(conversation: Conversation, message: NoteRow) {
  const repos = {
    message: {
      loadById: jest.fn(async () => message),
      save: jest.fn(async (m: Message) => ({ ...m, id: m.id ?? "m9" })),
      delete: jest.fn(async (): Promise<void> => undefined),
      convertAllToModel: (r: Message[]) => r
    },
    conversation: { loadById: jest.fn(async () => conversation), convertToModel: (c: Conversation) => c, updateStats: jest.fn(async (): Promise<void> => undefined) }
  };
  const au = { id: "u1", churchId: "c1", personId: "p1", firstName: "Test", lastName: "User", groupIds: ["g1"], leaderGroupIds: [] as string[], checkAccess: () => true };
  const controller = new MessageController();
  Object.assign(controller, {
    repos,
    actionWrapper: (_req: express.Request, _res: express.Response, action: (a: typeof au) => unknown) => action(au),
    json: (obj: unknown, status: number) => ({ obj, status })
  });
  return { controller, repos };
}

const req = <T = null>(body: T = null) => ({ body, params: {}, headers: {}, socket: {} }) as express.Request<{}, {}, T>;
const res = {} as express.Response;
const note: NoteRow = { id: "m1", conversationId: "conv1", personId: "p1", displayName: "Test User", content: "Visited in hospital", timeSent: "2026-11-01" };

describe("Note audit logging", () => {
  beforeEach(() => logMock.mockClear());

  it("logs a deleted person note with its text", async () => {
    const { controller, repos } = makeController({ id: "conv1", contentType: "person", contentId: "per1" }, note);
    await controller.delete("m1", req(), res);
    expect(repos.message.delete).toHaveBeenCalled();
    expect(logMock).toHaveBeenCalledTimes(1);
    const [, au, category, action, entityType, entityId, details] = logMock.mock.calls[0];
    expect(au.churchId).toBe("c1");
    expect({ category, action, entityType, entityId }).toEqual({ category: "person", action: "note_deleted", entityType: "note", entityId: "per1" });
    expect(details.before.content).toBe("Visited in hospital");
    expect(details.after).toBeNull();
  });

  it("logs an edited group note with the previous text", async () => {
    const { controller } = makeController({ id: "conv1", contentType: "groupNote", contentId: "g1" }, note);
    await controller.save(req([{ id: "m1", conversationId: "conv1", content: "Visited at home" }]), res);
    expect(logMock).toHaveBeenCalledTimes(1);
    const [, , category, action, , entityId, details] = logMock.mock.calls[0];
    expect({ category, action, entityId }).toEqual({ category: "group", action: "note_updated", entityId: "g1" });
    expect(details.before.content).toBe("Visited in hospital");
    expect(details.after.content).toBe("Visited at home");
  });

  it("logs a new note as note_saved", async () => {
    const { controller } = makeController({ id: "conv1", contentType: "person", contentId: "per1" }, note);
    await controller.save(req([{ conversationId: "conv1", content: "First visit" }]), res);
    expect(logMock).toHaveBeenCalledTimes(1);
    const call = logMock.mock.calls[0];
    expect(call[3]).toBe("note_saved");
    expect(call[6].before).toBeNull();
  });

  it("does not log group chat", async () => {
    const { controller, repos } = makeController({ id: "conv1", contentType: "group", contentId: "g1" }, note);
    await controller.delete("m1", req(), res);
    await controller.save(req([{ id: "m1", conversationId: "conv1", content: "edited chat" }]), res);
    expect(repos.message.delete).toHaveBeenCalled();
    expect(logMock).not.toHaveBeenCalled();
  });
});
