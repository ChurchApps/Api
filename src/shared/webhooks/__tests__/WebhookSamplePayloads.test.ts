import { ALL_WEBHOOK_EVENTS, isValidWebhookEvent } from "../WebhookEvents.js";
import { samplePayloadFor, hasSamplePayload } from "../WebhookSamplePayloads.js";

describe("WebhookEvents catalog", () => {
  const phase2Events = [
    "donation.created",
    "donation.updated",
    "attendance.recorded",
    "session.created",
    "form.submission.created",
    "event.created",
    "event.updated",
    "event.destroyed"
  ];

  it("includes every Phase 2 event", () => {
    phase2Events.forEach((e) => {
      expect(ALL_WEBHOOK_EVENTS).toContain(e);
      expect(isValidWebhookEvent(e)).toBe(true);
    });
  });

  it("rejects unknown events", () => {
    expect(isValidWebhookEvent("donation.refunded")).toBe(false);
  });
});

describe("WebhookSamplePayloads", () => {
  it("has an explicit sample for every catalog event", () => {
    ALL_WEBHOOK_EVENTS.forEach((e) => expect(hasSamplePayload(e)).toBe(true));
  });

  it("stamps the given churchId onto the sample data", () => {
    ALL_WEBHOOK_EVENTS.forEach((e) => {
      const data = samplePayloadFor(e, "church123");
      expect(data.churchId).toBe("church123");
    });
  });
});
