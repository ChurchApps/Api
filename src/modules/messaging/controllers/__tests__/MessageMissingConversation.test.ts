import "reflect-metadata";

// Production 500s (fix-log-errors 2026-10-10): a client still polling a deleted conversation hit
// ConversationRepo.rowToModel with a null row. The real convertToModel runs here.
jest.mock("../../../../shared/infrastructure/index", () => ({ BaseController: class { constructor(_module?: string) {} } }));
jest.mock("../../repositories/index", () => ({ Repos: class {} }));
jest.mock("../../db/index", () => ({ getDb: jest.fn() }));
jest.mock("@churchapps/apihelper", () => ({ ArrayHelper: { getOne: jest.fn() }, UniqueIdHelper: { shortId: () => "id1" } }));
jest.mock("../../helpers/DeliveryHelper", () => ({ DeliveryHelper: { sendConversationMessages: jest.fn() } }));
jest.mock("../../helpers/NotificationHelper", () => ({ NotificationHelper: { checkShouldNotify: jest.fn() } }));
jest.mock("../../../../shared/helpers/Permissions", () => ({ Permissions: { content: { edit: "contentEdit" }, chat: { host: "chatHost" }, people: { edit: "peopleEdit", viewConfidentialNotes: "peopleViewConfidentialNotes" } } }));
jest.mock("../../../../shared/modules/MembershipModuleGateway.js", () => ({ getMembershipModuleGateway: () => ({ loadChurch: jest.fn(async () => ({ id: "c1" })) }) }));

import express from "express";
import { MessageController } from "../MessageController.js";
import { Message } from "../../models/index.js";
import { ConversationRepo } from "../../repositories/ConversationRepo.js";

const au = { id: "u1", churchId: "c1", personId: "p1", groupIds: [] as string[], leaderGroupIds: [] as string[], checkAccess: () => false };

function makeController() {
  const conversationRepo = new ConversationRepo();
  jest.spyOn(conversationRepo, "loadById").mockResolvedValue(null);
  const message = { loadForConversation: jest.fn(async () => [] as Message[]), save: jest.fn(), convertAllToModel: (r: Message[]) => r };
  const controller = new MessageController();
  Object.assign(controller, {
    repos: { conversation: conversationRepo, message },
    actionWrapper: (_req: express.Request, _res: express.Response, action: (a: typeof au) => unknown) => action(au),
    json: (obj: unknown, status: number) => ({ obj, status })
  });
  return { controller, message };
}

describe("ConversationRepo.convertToModel", () => {
  it("returns null for a missing row", () => {
    expect(new ConversationRepo().convertToModel(null)).toBeNull();
  });
});

describe("MessageController on a conversation that no longer exists", () => {
  it("401s loading its messages, like catchup", async () => {
    const { controller, message } = makeController();
    const result = await controller.loadByConversation("gone1", {} as express.Request<{}, {}, []>, {} as express.Response);
    expect(result).toEqual({ obj: [], status: 401 });
    expect(message.loadForConversation).not.toHaveBeenCalled();
  });

  it("401s posting to it and saves nothing", async () => {
    const { controller, message } = makeController();
    const result = (await controller.save({ body: [{ conversationId: "gone1", content: "hi" }] } as express.Request<{}, {}, Message[]>, {} as express.Response)) as { status: number };
    expect(result.status).toBe(401);
    expect(message.save).not.toHaveBeenCalled();
  });
});
