import { StripeHelper } from "../StripeHelper";

describe("StripeHelper.logEvent", () => {
  it("does not throw when outcome is missing", async () => {
    const save = jest.fn(async (row) => row);
    await StripeHelper.logEvent("CHU1", { id: "evt_1", type: "charge.failed" }, {
      status: "failed",
      failure_message: "card_declined",
      created: 1700000000,
      customer: "cus_1"
    }, { eventLog: { save } });
    expect(save).toHaveBeenCalledWith(expect.objectContaining({
      churchId: "CHU1",
      message: "card_declined",
      status: "failed"
    }));
  });
});
