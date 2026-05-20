import { ALL_WEBHOOK_EVENTS } from "../WebhookEvents.js";
import { samplePayloadFor } from "../WebhookSamplePayloads.js";
import { formatForConnector, describeEvent } from "../WebhookFormatters.js";

function envelopeFor(event: string) {
  return { event, churchId: "church123", occurredAt: "2026-05-19T00:00:00.000Z", data: samplePayloadFor(event, "church123") };
}

describe("formatForConnector", () => {
  it("returns the raw envelope JSON for the standard connector", () => {
    const env = envelopeFor("person.created");
    const body = formatForConnector("standard", env);
    expect(JSON.parse(body)).toEqual(env);
  });

  it("treats an undefined connectorType as standard", () => {
    const env = envelopeFor("group.created");
    expect(JSON.parse(formatForConnector(undefined, env))).toEqual(env);
  });

  it("wraps every event in a Slack {text} message", () => {
    ALL_WEBHOOK_EVENTS.forEach((event) => {
      const body = JSON.parse(formatForConnector("slack", envelopeFor(event)));
      expect(typeof body.text).toBe("string");
      expect(body.text.length).toBeGreaterThan(0);
      expect(body.content).toBeUndefined();
    });
  });

  it("wraps every event in a Discord {content} message", () => {
    ALL_WEBHOOK_EVENTS.forEach((event) => {
      const body = JSON.parse(formatForConnector("discord", envelopeFor(event)));
      expect(typeof body.content).toBe("string");
      expect(body.content.length).toBeGreaterThan(0);
      expect(body.text).toBeUndefined();
    });
  });
});

describe("describeEvent", () => {
  it("includes the person name for person events", () => {
    expect(describeEvent(envelopeFor("person.created"))).toContain("Sample Person");
  });

  it("formats a USD donation amount", () => {
    expect(describeEvent(envelopeFor("donation.created"))).toContain("$50.00");
  });

  it("includes the event title for calendar events", () => {
    expect(describeEvent(envelopeFor("event.created"))).toContain("Sample Event");
  });

  it("falls back to the raw event name for an unknown event", () => {
    expect(describeEvent({ event: "mystery.event", churchId: "c", occurredAt: "", data: {} })).toContain("mystery.event");
  });
});
