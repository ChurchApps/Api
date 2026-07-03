import "reflect-metadata";

jest.mock("../../infrastructure/RepoManager.js", () => ({ RepoManager: { getRepos: jest.fn() } }));
jest.mock("../../../modules/messaging/helpers/MergeFieldHelper.js", () => ({ MergeFieldHelper: { resolve: (s: string) => s } }));
jest.mock("../../../modules/messaging/helpers/NotificationHelper.js", () => ({ NotificationHelper: { createNotifications: jest.fn() } }));
jest.mock("@churchapps/apihelper", () => ({ EncryptionHelper: { decrypt: (x: string) => x } }));

const provider = { sendBulk: jest.fn(), capabilities: {} };
jest.mock("@churchapps/texting", () => ({ getProvider: () => provider }));

import { RepoManager } from "../../infrastructure/RepoManager.js";
import { getMessagingModuleGateway } from "../MessagingModuleGateway.js";

function fakeRepos(opts: any = {}) {
  return {
    textingProvider: {
      loadByChurchId: jest.fn(async () => opts.providers ?? [{ provider: "clearstream", enabled: true, apiKey: "k", apiSecret: "s", fromNumber: "+1" }]),
      convertAllToModel: (rows: any[]) => rows
    },
    sentText: { save: jest.fn(async (m: any) => { m.id = "st1"; return m; }) },
    deliveryLog: { save: jest.fn(async (m: any) => m) }
  };
}

beforeEach(() => {
  provider.sendBulk.mockReset();
});

describe("MessagingModuleGateway.sendBulkText", () => {
  it("resolves recipients, records SentText + per-recipient DeliveryLog", async () => {
    const repos = fakeRepos();
    (RepoManager.getRepos as jest.Mock).mockResolvedValue(repos);
    provider.sendBulk.mockResolvedValue([{ success: true }, { success: true }]);

    const result = await getMessagingModuleGateway().sendBulkText("c1", [
      { personId: "p1", phoneNumber: "+15550001" },
      { personId: "p2", phoneNumber: "+15550002" }
    ], "Come to the nursery");

    expect(provider.sendBulk.mock.calls[0][1]).toEqual(["+15550001", "+15550002"]);
    expect(repos.sentText.save).toHaveBeenCalled();
    expect(repos.sentText.save.mock.calls[0][0].recipientCount).toBe(2);
    expect(repos.sentText.save.mock.calls[0][0].successCount).toBe(2);
    expect(repos.deliveryLog.save).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ ok: true, sent: 2, failed: 0 });
  });

  it("counts failures from the provider results", async () => {
    const repos = fakeRepos();
    (RepoManager.getRepos as jest.Mock).mockResolvedValue(repos);
    provider.sendBulk.mockResolvedValue([{ success: true }, { success: false, error: "bad number" }]);

    const result = await getMessagingModuleGateway().sendBulkText("c1", [
      { personId: "p1", phoneNumber: "+1" },
      { personId: "p2", phoneNumber: "+2" }
    ], "msg");
    expect(result.sent).toBe(1);
    expect(result.failed).toBe(1);
  });

  it("returns no_provider (and never dispatches) when no provider is configured", async () => {
    const repos = fakeRepos({ providers: [] });
    (RepoManager.getRepos as jest.Mock).mockResolvedValue(repos);

    const result = await getMessagingModuleGateway().sendBulkText("c1", [{ phoneNumber: "+1" }], "msg");
    expect(result).toEqual({ ok: false, reason: "no_provider" });
    expect(provider.sendBulk).not.toHaveBeenCalled();
  });

  it("caps at 500 recipients", async () => {
    const repos = fakeRepos();
    (RepoManager.getRepos as jest.Mock).mockResolvedValue(repos);
    provider.sendBulk.mockImplementation(async (_c: any, phones: string[]) => phones.map(() => ({ success: true })));

    const recipients = Array.from({ length: 600 }, (_, i) => ({ phoneNumber: "+" + i }));
    await getMessagingModuleGateway().sendBulkText("c1", recipients, "msg");
    expect(provider.sendBulk.mock.calls[0][1]).toHaveLength(500);
  });
});
