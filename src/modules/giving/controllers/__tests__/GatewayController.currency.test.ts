import "reflect-metadata";
import express from "express";
const loadMulipleChurches = jest.fn();
jest.mock("../../../../shared/infrastructure/index.js", () => ({ BaseController: class {} }));
jest.mock("../../../../shared/infrastructure/RepoManager.js", () => ({ RepoManager: { getRepos: jest.fn(async () => ({ setting: { loadMulipleChurches } })) } }));
jest.mock("../../../../shared/helpers/ExchangeRateHelper.js", () => ({ ExchangeRateHelper: { getRateTable: jest.fn() } }));
jest.mock("../../../../shared/helpers/GatewayService.js", () => ({ GatewayService: { createProduct: jest.fn(async (): Promise<null> => null), deleteWebhooks: jest.fn(), createWebhook: jest.fn() } }));
jest.mock("@churchapps/apihelper", () => ({ EncryptionHelper: { encrypt: (v: string) => "enc:" + v } }));
jest.mock("../../../../shared/helpers/Permissions.js", () => ({ Permissions: { settings: { edit: "settingsEdit" } } }));
jest.mock("../../repositories/index.js", () => ({}));
jest.mock("../../models/index.js", () => ({}));

import { GatewayController } from "../GatewayController.js";
import { Gateway } from "../../models/index.js";

const makeController = () => {
  const controller = new GatewayController();
  const save = jest.fn(async (g: Gateway) => g);
  const au = { churchId: "CHU1", checkAccess: () => true };
  Object.assign(controller, {
    repos: { gateway: { save, convertAllToModel: (_c: string, rows: Gateway[]) => rows } },
    actionWrapper: (_req: express.Request, _res: express.Response, action: (a: typeof au) => unknown) => action(au),
    validateProviderSettings: (_p: string, s: unknown) => s,
    normalizeEnvironment: (e: unknown) => e
  });
  return { controller, save };
};

const saveGateway = async (gateway: Gateway) => {
  const { controller, save } = makeController();
  await controller.save({ body: [gateway], hostname: "localhost" } as express.Request, {} as express.Response);
  return save.mock.calls[0][0];
};

describe("GatewayController.save currency", () => {
  beforeEach(() => loadMulipleChurches.mockReset());

  it("inherits the church currency setting when the gateway has none", async () => {
    loadMulipleChurches.mockResolvedValue([{ keyName: "currency", value: "kes" }]);
    const saved = await saveGateway({ provider: "stripe" });
    expect(saved.currency).toBe("kes");
    expect(loadMulipleChurches).toHaveBeenCalledWith(["currency"], ["CHU1"]);
  });

  it("keeps an explicit gateway currency", async () => {
    loadMulipleChurches.mockResolvedValue([{ keyName: "currency", value: "kes" }]);
    const saved = await saveGateway({ provider: "stripe", currency: "eur" });
    expect(saved.currency).toBe("eur");
  });

  it("falls back to USD with no church setting", async () => {
    loadMulipleChurches.mockResolvedValue([]);
    const saved = await saveGateway({ provider: "stripe" });
    expect(saved.currency).toBe("USD");
  });

  it("falls back to USD when the settings lookup fails", async () => {
    loadMulipleChurches.mockRejectedValue(new Error("db down"));
    const saved = await saveGateway({ provider: "stripe", currency: "" });
    expect(saved.currency).toBe("USD");
  });
});
