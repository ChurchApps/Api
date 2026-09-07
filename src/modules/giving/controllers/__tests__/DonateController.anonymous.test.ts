import "reflect-metadata";

jest.mock("../GivingBaseController.js", () => ({ GivingBaseController: class { public repos: any; } }));
jest.mock("../../../../shared/helpers/Permissions.js", () => ({ Permissions: { donations: { edit: "e", view: "v" } } }));
jest.mock("../../../../shared/helpers/Environment.js", () => ({ Environment: { appEnv: "dev", membershipApi: "http://test" } }));
jest.mock("../../../../shared/helpers/TransactionalEmailHelper.js", () => ({ TransactionalEmailHelper: { sendTemplatedEmail: jest.fn() } }));
jest.mock("@churchapps/apihelper", () => ({ __esModule: true, CurrencyHelper: { formatCurrencyWithLocale: (a: number) => String(a) } }));
jest.mock("axios", () => ({ __esModule: true, default: { post: jest.fn(), get: jest.fn() } }));

const gatewayService = {
  getGatewayForChurch: jest.fn(),
  prepareCharge: jest.fn(),
  processCharge: jest.fn(),
  logsDonationsImmediately: jest.fn(),
  logEvent: jest.fn(),
  logDonation: jest.fn()
};
jest.mock("../../../../shared/helpers/GatewayService.js", () => ({ GatewayService: gatewayService }));

import { DonateController } from "../DonateController.js";

function makeController() {
  const controller: any = new DonateController();
  controller.repos = { gateway: {} };
  controller.actionWrapper = (_req: any, _res: any, action: any) => action({ churchId: "CHU1", checkAccess: () => true });
  controller.json = (obj: any, status: number) => ({ obj, status });
  return controller;
}

function chargeBody(extra: any = {}) {
  return {
    provider: "stripe",
    churchId: "CHU1",
    amount: 25,
    id: "pm_1",
    type: "card",
    funds: [{ id: "FUN1", amount: 25 }],
    person: { id: "PER1", email: "donor@example.com", name: "Donald Clark" },
    church: { name: "Grace", subDomain: "grace" },
    ...extra
  };
}

beforeEach(() => {
  Object.values(gatewayService).forEach((fn: any) => fn.mockReset());
  gatewayService.getGatewayForChurch.mockResolvedValue({ id: "GAT1", provider: "stripe", currency: "usd" });
  gatewayService.processCharge.mockResolvedValue({ success: true, data: { id: "pi_1", status: "succeeded" } });
  gatewayService.logsDonationsImmediately.mockReturnValue(false);
  jest.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe("DonateController.charge anonymous gifts", () => {
  it("strips the donor identity so no person is attached to the gift", async () => {
    const controller = makeController();
    await controller.charge({ body: chargeBody({ anonymous: true, customerId: "cus_1" }) }, {});

    const sent = gatewayService.processCharge.mock.calls[0][1];
    expect(sent.person).toEqual({ id: "", email: "donor@example.com", name: "" });
    expect(sent.anonymous).toBe(true);
  });

  it("keeps the donor identity on a normal gift", async () => {
    const controller = makeController();
    await controller.charge({ body: chargeBody() }, {});

    const sent = gatewayService.processCharge.mock.calls[0][1];
    expect(sent.person).toEqual({ id: "PER1", email: "donor@example.com", name: "Donald Clark" });
  });

  it("tells providers that log immediately the gift is anonymous", async () => {
    gatewayService.logsDonationsImmediately.mockReturnValue(true);
    const controller = makeController();
    await controller.charge({ body: chargeBody({ anonymous: true, provider: "paystack" }) }, {});

    const logged = gatewayService.logDonation.mock.calls[0][2];
    expect(logged.anonymous).toBe(true);
    expect(logged.person.id).toBe("");
    expect(logged.funds).toEqual([{ id: "FUN1", amount: 25 }]);
  });
});
