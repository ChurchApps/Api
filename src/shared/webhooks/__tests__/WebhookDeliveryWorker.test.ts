jest.mock("../MailchimpConnector", () => ({ MailchimpConnector: {} }));

import { WebhookDeliveryWorker } from "../WebhookDeliveryWorker";

describe("WebhookDeliveryWorker.process", () => {
  afterEach(() => jest.restoreAllMocks());

  it("skips deliveries another run has already claimed", async () => {
    const attempt = jest.spyOn(WebhookDeliveryWorker, "attempt").mockResolvedValue(true);
    const repos = {
      webhookDelivery: {
        loadDuePending: jest.fn().mockResolvedValue([{ id: "D1", churchId: "C", webhookId: "W" }, { id: "D2", churchId: "C", webhookId: "W" }]),
        claim: jest.fn().mockImplementation(async (id: string) => id === "D2"),
        update: jest.fn()
      },
      webhook: { load: jest.fn().mockResolvedValue({ id: "W", churchId: "C", active: true }) }
    };
    await WebhookDeliveryWorker.process(repos);
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(attempt.mock.calls[0][2]).toMatchObject({ id: "D2" });
  });
});
