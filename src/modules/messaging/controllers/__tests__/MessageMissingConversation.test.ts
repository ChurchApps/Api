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

import { MessageController } from "../MessageController.js";
import { ConversationRepo } from "../../repositories/ConversationRepo.js";

const au = { id: "u1", churchId: "c1", personId: "p1", groupIds: [] as string[], leaderGroupIds: [] as string[], checkAccess: () => false };

function makeController() {
  const conversationRepo = new ConversationRepo();
  (conversationRepo as any).loadById = jest.fn(async (): Promise<any> => null);
  const message = { loadForConversation: jest.fn(async () => [] as any[]), save: jest.fn(), convertAllToModel: (r: any[]) => r };
  const controller = new MessageController();
  (controller as any).repos = { conversation: conversationRepo, message };
  (controller as any).actionWrapper = (_req: any, _res: any, action: any) => action(au);
  (controller as any).json = (obj: any, status: number) => ({ obj, status });
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
    const result = await controller.loadByConversation("gone1", {} as any, {} as any);
    expect(result).toEqual({ obj: [], status: 401 });
    expect(message.loadForConversation).not.toHaveBeenCalled();
  });

  it("401s posting to it and saves nothing", async () => {
    const { controller, message } = makeController();
    const result = await controller.save({ body: [{ conversationId: "gone1", content: "hi" }] } as any, {} as any);
    expect(result.status).toBe(401);
    expect(message.save).not.toHaveBeenCalled();
  });
});
