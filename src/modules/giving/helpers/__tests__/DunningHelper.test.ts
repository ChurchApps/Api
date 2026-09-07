// Environment is ESM-only (import.meta.url) and the email helper must not reach SES under test.
jest.mock("@churchapps/apihelper", () => ({ CurrencyHelper: { formatCurrencyWithLocale: (amount: number) => `$${amount.toFixed(2)}` } }));
jest.mock("../../../../shared/helpers/Environment", () => ({ Environment: { appEnv: "prod", supportEmail: "support@test" } }));
jest.mock("../../../../shared/helpers/TransactionalEmailHelper", () => ({ TransactionalEmailHelper: { sendTransactional: jest.fn().mockResolvedValue(undefined) } }));
jest.mock("../../../../shared/infrastructure/RepoManager", () => ({ RepoManager: { getRepos: jest.fn() } }));

import { DunningHelper } from "../DunningHelper";
import { TransactionalEmailHelper } from "../../../../shared/helpers/TransactionalEmailHelper";
import { RepoManager } from "../../../../shared/infrastructure/RepoManager";

const sendTransactional = TransactionalEmailHelper.sendTransactional as jest.Mock;
const getRepos = RepoManager.getRepos as jest.Mock;

const failedDonation = { id: "don1", churchId: "ch1", personId: "per1", amount: 25, currency: "usd", donationDate: new Date("2026-09-01") };

const makeGivingRepos = (byAge: Record<number, any[]> = {}) => ({
  eventLog: { loadByProviderId: jest.fn().mockResolvedValue(null), save: jest.fn().mockResolvedValue({}) },
  donation: { loadFailedByAge: jest.fn().mockImplementation(async (days: number) => byAge[days] || []) }
});

const makeMembershipRepos = (person: any = { id: "per1", email: "donor@test" }) => ({
  person: { load: jest.fn().mockResolvedValue(person) },
  church: { loadById: jest.fn().mockResolvedValue({ id: "ch1", name: "Grace Church", subDomain: "grace" }) }
});

describe("DunningHelper", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getRepos.mockImplementation(async (name: string) => (name === "membership" ? makeMembershipRepos() : makeGivingRepos()));
  });

  describe("notify", () => {
    it("emails the donor and records the send so a rerun cannot double-send", async () => {
      const repos = makeGivingRepos();
      expect(await DunningHelper.notify("ch1", failedDonation, 0, repos)).toBe(true);

      expect(sendTransactional).toHaveBeenCalledTimes(1);
      const [, to, appName, , subject, contents] = sendTransactional.mock.calls[0];
      expect(to).toEqual("donor@test");
      expect(appName).toEqual("Grace Church");
      expect(subject).toContain("Recurring Donation");
      expect(contents).toContain("https://grace.b1.church/member/donate");

      const logged = repos.eventLog.save.mock.calls[0][0];
      expect(logged.provider).toEqual("dunning");
      expect(logged.providerId).toEqual("don1:0");
    });

    it("skips a day that was already sent", async () => {
      const repos = makeGivingRepos();
      repos.eventLog.loadByProviderId.mockResolvedValue({ id: "log1", providerId: "don1:3" });

      expect(await DunningHelper.notify("ch1", failedDonation, 3, repos)).toBe(false);
      expect(sendTransactional).not.toHaveBeenCalled();
    });

    it("skips donors with no email and anonymous gifts", async () => {
      getRepos.mockImplementation(async (name: string) => (name === "membership" ? makeMembershipRepos({ id: "per1", email: null }) : makeGivingRepos()));
      expect(await DunningHelper.notify("ch1", failedDonation, 0, makeGivingRepos())).toBe(false);
      expect(await DunningHelper.notify("ch1", { ...failedDonation, personId: undefined }, 0, makeGivingRepos())).toBe(false);
      expect(sendTransactional).not.toHaveBeenCalled();
    });
  });

  describe("run", () => {
    it("selects donations that are 3 and 7 days old and emails each once", async () => {
      const givingRepos = makeGivingRepos({ 3: [failedDonation], 7: [{ ...failedDonation, id: "don2" }] });
      getRepos.mockImplementation(async (name: string) => (name === "membership" ? makeMembershipRepos() : givingRepos));

      const result = await DunningHelper.run();

      expect(givingRepos.donation.loadFailedByAge.mock.calls.map((c: any[]) => c[0])).toEqual([3, 7]);
      expect(result).toEqual({ sent: 2 });
      expect(sendTransactional).toHaveBeenCalledTimes(2);
      expect(givingRepos.eventLog.save.mock.calls.map((c: any[]) => c[0].providerId)).toEqual(["don1:3", "don2:7"]);
    });

    it("keeps going when one donor's email throws", async () => {
      const givingRepos = makeGivingRepos({ 3: [failedDonation, { ...failedDonation, id: "don2" }], 7: [] });
      getRepos.mockImplementation(async (name: string) => (name === "membership" ? makeMembershipRepos() : givingRepos));
      sendTransactional.mockRejectedValueOnce(new Error("SES down"));
      jest.spyOn(console, "error").mockImplementation(() => {});

      expect(await DunningHelper.run()).toEqual({ sent: 1 });
    });
  });
});
