const loadMulipleChurches = jest.fn();
jest.mock("../../../../shared/infrastructure/index.js", () => ({ BaseController: class {} }));
jest.mock("../../../../shared/infrastructure/RepoManager.js", () => ({ RepoManager: { getRepos: jest.fn(async () => ({ setting: { loadMulipleChurches } })) } }));
jest.mock("../../../../shared/helpers/ExchangeRateHelper.js", () => ({ ExchangeRateHelper: { getRateTable: jest.fn(async (base: string) => ({ base, rates: {}, asOf: "2026-11-03" })) } }));
jest.mock("../../repositories/index.js", () => ({}));

import { GivingBaseController } from "../GivingBaseController.js";

class TestController extends GivingBaseController {
  public run(churchId: string) { return this.loadChurchRates(churchId); }
}

const makeController = (gateways: any[]) => {
  const c = new TestController();
  c.repos = { gateway: { loadAll: jest.fn(async () => gateways) } } as any;
  return c;
};

describe("GivingBaseController.loadChurchRates church currency", () => {
  beforeEach(() => loadMulipleChurches.mockReset());

  it("uses the church currency setting when there is no gateway", async () => {
    loadMulipleChurches.mockResolvedValue([{ keyName: "currency", value: "PHP" }]);
    const result = await makeController([]).run("CHU1");
    expect(result.currency).toBe("php");
    expect(loadMulipleChurches).toHaveBeenCalledWith(["currency"], ["CHU1"]);
  });

  it("keeps the gateway currency when a provider exists", async () => {
    loadMulipleChurches.mockResolvedValue([{ keyName: "currency", value: "php" }]);
    const result = await makeController([{ currency: "eur" }]).run("CHU1");
    expect(result.currency).toBe("eur");
  });

  it("falls back to usd with no gateway and no setting", async () => {
    loadMulipleChurches.mockResolvedValue([]);
    const result = await makeController([]).run("CHU1");
    expect(result.currency).toBe("usd");
  });

  it("falls back to usd when the settings lookup fails", async () => {
    loadMulipleChurches.mockRejectedValue(new Error("db down"));
    const result = await makeController([]).run("CHU1");
    expect(result.currency).toBe("usd");
  });
});
