jest.mock("stripe", () => ({ __esModule: true, default: jest.fn() }));

import Stripe from "stripe";
import { StripeHelper } from "../StripeHelper";

describe("StripeHelper Canadian PAD (acss_debit)", () => {
  const create = jest.fn().mockResolvedValue({ id: "seti_test" });
  beforeEach(() => {
    create.mockClear();
    (Stripe as unknown as jest.Mock).mockImplementation(() => ({ setupIntents: { create } }));
  });

  it("maps cad to acss_debit and everything else to us_bank_account", () => {
    expect(StripeHelper.bankMethodType("cad")).toBe("acss_debit");
    expect(StripeHelper.bankMethodType("CAD")).toBe("acss_debit");
    expect(StripeHelper.bankMethodType("usd")).toBe("us_bank_account");
    expect(StripeHelper.bankMethodType(undefined)).toBe("us_bank_account");
  });

  it("creates an acss_debit SetupIntent whose mandate is default for invoices/subscriptions", async () => {
    await StripeHelper.createACHSetupIntent("sk_test", "cus_1", "cad");
    const params = create.mock.calls[0][0];
    expect(params.payment_method_types).toEqual(["acss_debit"]);
    expect(params.payment_method_options.acss_debit.mandate_options.default_for).toEqual(["invoice", "subscription"]);
    expect(params.payment_method_options.acss_debit.currency).toBe("cad");
  });

  it("finds the mandate from the customer's succeeded SetupIntent", async () => {
    const list = jest.fn().mockResolvedValue({ data: [{ status: "canceled", mandate: "mandate_old" }, { status: "succeeded", mandate: "mandate_1" }] });
    (Stripe as unknown as jest.Mock).mockImplementation(() => ({ setupIntents: { create, list } }));
    expect(await StripeHelper.findAcssMandate("sk_test", "cus_1", "pm_1")).toBe("mandate_1");
    expect(list).toHaveBeenCalledWith({ customer: "cus_1", payment_method: "pm_1", limit: 10 });
  });

  it("keeps the Financial Connections us_bank_account SetupIntent for usd", async () => {
    await StripeHelper.createACHSetupIntent("sk_test", "cus_1", "usd");
    expect(create.mock.calls[0][0].payment_method_types).toEqual(["us_bank_account"]);
  });
});
