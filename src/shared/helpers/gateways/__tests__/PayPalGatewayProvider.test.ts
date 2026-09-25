jest.mock("../../Environment", () => ({ Environment: { membershipApi: "http://test", apiEnv: "dev" } }));

import { PayPalHelper } from "../../PayPalHelper";
import { PayPalGatewayProvider } from "../PayPalGatewayProvider";
import { GatewayConfig } from "../IGatewayProvider";

describe("PayPalGatewayProvider", () => {
  const provider = new PayPalGatewayProvider();
  const config = { churchId: "CHU1", gatewayId: "GAT1", privateKey: "secret", publicKey: "client", webhookKey: "", settings: {} } as GatewayConfig;

  afterEach(() => jest.restoreAllMocks());

  describe("processCharge", () => {
    const captureWith = (status: string) => ({ purchase_units: [{ payments: { captures: [{ id: "CAP1", status, amount: { value: "25.00", currency_code: "USD" } }] } }] });

    it("succeeds only for a completed capture", async () => {
      jest.spyOn(PayPalHelper, "captureOrder").mockResolvedValue(captureWith("COMPLETED"));
      const result = await provider.processCharge(config, { id: "ORDER1", amount: 25 });
      expect(result.success).toBe(true);
      expect(result.transactionId).toBe("CAP1");
      expect(result.data.currency).toBe("USD");
    });

    it("fails when the capture amount differs from the requested amount", async () => {
      jest.spyOn(PayPalHelper, "captureOrder").mockResolvedValue(captureWith("COMPLETED"));
      jest.spyOn(console, "error").mockImplementation(() => {});
      const result = await provider.processCharge(config, { id: "ORDER1", amount: 10000 });
      expect(result.success).toBe(false);
    });

    it.each(["DECLINED", "PENDING", "FAILED"])("fails a %s capture", async (status) => {
      jest.spyOn(PayPalHelper, "captureOrder").mockResolvedValue(captureWith(status));
      const result = await provider.processCharge(config, { id: "ORDER1", amount: 25 });
      expect(result.success).toBe(false);
    });
  });

  describe("logDonation", () => {
    const makeRepos = () => ({
      customer: { load: jest.fn().mockResolvedValue(null) },
      donationBatch: { getOrCreateCurrent: jest.fn().mockResolvedValue({ id: "BAT1" }) },
      donation: { save: jest.fn().mockImplementation(async (d: any) => ({ ...d, id: "DON1" })) },
      fundDonation: { save: jest.fn().mockImplementation(async (f: any) => f) },
      fund: { getOrCreateGeneral: jest.fn().mockResolvedValue({ id: "GEN" }) }
    });

    it("records the charged amount, transaction id and funds from the synchronous charge path", async () => {
      const repos = makeRepos();
      const capture = { id: "CAP1", status: "COMPLETED", amount: { value: "25.00", currency_code: "USD" }, create_time: "2026-09-01T00:00:00Z" };
      await provider.logDonation(config, "CHU1", { ...capture, amount: 25, person: { id: "PER1" }, funds: [{ id: "F1", amount: 25 }] }, repos);
      const saved = repos.donation.save.mock.calls[0][0];
      expect(saved.amount).toBe(25);
      expect(saved.transactionId).toBe("CAP1");
      expect(saved.personId).toBe("PER1");
      expect(repos.fundDonation.save).toHaveBeenCalledWith({ churchId: "CHU1", donationId: "DON1", fundId: "F1", amount: 25 });
      expect(repos.fund.getOrCreateGeneral).not.toHaveBeenCalled();
    });

    it("reads the amount from a webhook capture and falls back to the General Fund", async () => {
      const repos = makeRepos();
      await provider.logDonation(config, "CHU1", { id: "CAP2", amount: { value: "10.50", currency_code: "USD" }, create_time: "2026-09-01T00:00:00Z" }, repos);
      const saved = repos.donation.save.mock.calls[0][0];
      expect(saved.amount).toBe(10.5);
      expect(saved.currency).toBe("usd");
      expect(repos.fundDonation.save).toHaveBeenCalledWith({ churchId: "CHU1", donationId: "DON1", fundId: "GEN", amount: 10.5 });
    });
  });
});
