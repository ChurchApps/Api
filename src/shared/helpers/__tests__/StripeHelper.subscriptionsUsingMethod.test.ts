jest.mock("stripe", () => ({ __esModule: true, default: jest.fn() }));

import Stripe from "stripe";
import { StripeHelper } from "../StripeHelper";

describe("StripeHelper.getActiveSubscriptionIdsUsingMethod", () => {
  const list = jest.fn();
  const retrieve = jest.fn();
  beforeEach(() => {
    list.mockReset();
    retrieve.mockReset();
    (Stripe as unknown as jest.Mock).mockImplementation(() => ({ subscriptions: { list }, customers: { retrieve } }));
  });

  const find = () => StripeHelper.getActiveSubscriptionIdsUsingMethod("sk_test", "cus_1", "pm_1");

  it("returns live subscriptions whose default method is the one being deleted", async () => {
    list.mockResolvedValue({
      data: [
        { id: "sub_a", status: "active", default_payment_method: "pm_1" },
        { id: "sub_b", status: "past_due", default_payment_method: { id: "pm_1" } },
        { id: "sub_c", status: "active", default_payment_method: "pm_2" }
      ]
    });
    expect(await find()).toEqual(["sub_a", "sub_b"]);
    expect(list).toHaveBeenCalledWith({ customer: "cus_1", limit: 100 });
    expect(retrieve).not.toHaveBeenCalled();
  });

  it("ignores ended subscriptions", async () => {
    list.mockResolvedValue({
      data: [
        { id: "sub_a", status: "canceled", default_payment_method: "pm_1" },
        { id: "sub_b", status: "incomplete_expired", default_payment_method: "pm_1" }
      ]
    });
    expect(await find()).toEqual([]);
  });

  it("matches a legacy bank source", async () => {
    list.mockResolvedValue({ data: [{ id: "sub_a", status: "active", default_payment_method: null, default_source: "ba_1" }] });
    expect(await StripeHelper.getActiveSubscriptionIdsUsingMethod("sk_test", "cus_1", "ba_1")).toEqual(["sub_a"]);
  });

  it("falls back to the customer's default method when the subscription has none", async () => {
    list.mockResolvedValue({ data: [{ id: "sub_a", status: "active", default_payment_method: null, default_source: null }] });
    retrieve.mockResolvedValue({ id: "cus_1", invoice_settings: { default_payment_method: "pm_1" }, default_source: null });
    expect(await find()).toEqual(["sub_a"]);
    retrieve.mockResolvedValue({ id: "cus_1", invoice_settings: { default_payment_method: "pm_2" }, default_source: null });
    expect(await find()).toEqual([]);
  });
});
