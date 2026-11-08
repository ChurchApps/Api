const loadDonationSummaryMock = jest.fn();
jest.mock("../../../../shared/modules/index.js", () => ({ getGivingModuleGateway: () => ({ loadDonationSummary: loadDonationSummaryMock, buildReceiptHtml: (s: any) => jest.requireActual("../../../giving/helpers/ReceiptHelper.js").ReceiptHelper.oneTimeTable(s.funds, s.amount, s.currency) }) }));
jest.mock("@churchapps/apihelper", () => ({ CurrencyHelper: { formatCurrencyWithLocale: (amount: number, currency: string) => (currency === "USD" ? "$" : currency + " ") + amount.toFixed(2) } }));

import { DonationMergeHelper } from "../DonationMergeHelper.js";

const event = { type: "donation.created", donationId: "d1" };
const summary = {
  amount: 75,
  currency: "usd",
  donationDate: "2026-11-08",
  method: "Check",
  funds: [{ name: "General Fund", amount: 50 }, { name: "Missions <Intl>", amount: 25 }]
};

describe("DonationMergeHelper.extras", () => {
  beforeEach(() => { loadDonationSummaryMock.mockReset(); });

  it("is empty when the card was not started by a donation", async () => {
    expect(await DonationMergeHelper.extras("c1", undefined, "html")).toEqual({});
    expect(await DonationMergeHelper.extras("c1", { type: "person.created" }, "text")).toEqual({});
    expect(loadDonationSummaryMock).not.toHaveBeenCalled();
  });

  it("formats the amount, date and funds, and renders an HTML receipt table", async () => {
    loadDonationSummaryMock.mockResolvedValue(summary);
    const extras = await DonationMergeHelper.extras("c1", event, "html");
    expect(loadDonationSummaryMock).toHaveBeenCalledWith("c1", "d1");
    expect(extras.amount).toBe("$75.00");
    expect(extras.giftDate).toBe("Nov 8, 2026");
    expect(extras.fund).toBe("General Fund, Missions <Intl>");
    expect(extras.receipt).toContain("<table");
    expect(extras.receipt).toContain("Missions &lt;Intl&gt;");
    expect(extras.receipt).toContain("$50.00");
    expect(extras.receipt).toContain("Check");
  });

  it("uses a one-line receipt in a text", async () => {
    loadDonationSummaryMock.mockResolvedValue({ ...summary, amount: 50, funds: [{ name: "General Fund", amount: 50 }] });
    const extras = await DonationMergeHelper.extras("c1", event, "text");
    expect(extras.receipt).toBe("$50.00 to General Fund on Nov 8, 2026");
  });

  it("never throws, so the message still sends", async () => {
    loadDonationSummaryMock.mockRejectedValue(new Error("db down"));
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await DonationMergeHelper.extras("c1", event, "html")).toEqual({});
  });
});
