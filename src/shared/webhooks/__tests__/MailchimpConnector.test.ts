jest.mock("@churchapps/apihelper", () => ({
  EncryptionHelper: {
    encrypt: (v: string) => "enc:" + Buffer.from(v).toString("base64"),
    decrypt: (v: string) => (v.startsWith("enc:") ? Buffer.from(v.slice(4), "base64").toString() : "")
  }
}));

import crypto from "crypto";
import { MailchimpConnector, MAILCHIMP_EVENTS } from "../MailchimpConnector";

const config = { apiKey: "abc123-us21", audienceId: "aud1" };
const webhook: any = { connectorType: "mailchimp", connectorConfig: "enc:" + Buffer.from(JSON.stringify(config)).toString("base64") };
const BASE = "https://us21.api.mailchimp.com/3.0/lists/aud1";
const hashOf = (email: string) => crypto.createHash("md5").update(email.toLowerCase()).digest("hex");

const mockFetch = (responses: Array<{ status: number; body?: string }>) => {
  const fn = jest.fn();
  responses.forEach((r) => fn.mockResolvedValueOnce({ status: r.status, text: async () => r.body ?? "{}" }));
  global.fetch = fn as any;
  return fn;
};

const delivery = (event: string, data: any): any => ({ payload: JSON.stringify({ event, churchId: "c1", occurredAt: "2026-08-18T00:00:00.000Z", data }) });

describe("MailchimpConnector.dataCenter", () => {
  it("extracts the dc suffix", () => expect(MailchimpConnector.dataCenter("xyz-us21")).toBe("us21"));
  it("returns null without a suffix", () => expect(MailchimpConnector.dataCenter("xyz")).toBeNull());
});

describe("MailchimpConnector.parseConfig", () => {
  it("round-trips the encrypted config", () => expect(MailchimpConnector.parseConfig(webhook)).toEqual(config));
  it("returns null for missing config", () => expect(MailchimpConnector.parseConfig({} as any)).toBeNull());
});

describe("MailchimpConnector.deliver", () => {
  it("upserts a subscriber on person.created with only safe merge fields", async () => {
    const fetch = mockFetch([{ status: 200 }]);
    const d = delivery("person.created", { name: { first: "Jane", last: "Doe" }, contactInfo: { email: "Jane@Example.com", mobilePhone: "555" } });
    const result = await MailchimpConnector.deliver(webhook, d);
    expect(result.status).toBe(200);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(`${BASE}/members/${hashOf("jane@example.com")}`);
    expect(init.method).toBe("PUT");
    const body = JSON.parse(init.body);
    expect(body).toEqual({ email_address: "jane@example.com", status_if_new: "subscribed", merge_fields: { FNAME: "Jane", LNAME: "Doe", PHONE: "555" } });
  });

  it("reads flat row shapes too", async () => {
    const fetch = mockFetch([{ status: 200 }]);
    await MailchimpConnector.deliver(webhook, delivery("person.updated", { email: "a@b.co", firstName: "A", lastName: "B" }));
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.merge_fields).toEqual({ FNAME: "A", LNAME: "B" });
  });

  it("skips a person with no email as success", async () => {
    global.fetch = jest.fn() as any;
    const result = await MailchimpConnector.deliver(webhook, delivery("person.created", { name: { first: "X" } }));
    expect(result.status).toBe(200);
    expect(result.responseBody).toMatch(/Skipped/);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("archives on person.destroyed and treats 404 as success", async () => {
    const fetch = mockFetch([{ status: 404 }]);
    const result = await MailchimpConnector.deliver(webhook, delivery("person.destroyed", { id: "p1", email: "gone@x.co" }));
    expect(result.status).toBe(200);
    expect(fetch.mock.calls[0][0]).toBe(`${BASE}/members/${hashOf("gone@x.co")}`);
    expect(fetch.mock.calls[0][1].method).toBe("DELETE");
  });

  it("upserts then tags on group.member.added", async () => {
    const fetch = mockFetch([{ status: 200 }, { status: 204, body: "" }]);
    const result = await MailchimpConnector.deliver(webhook, delivery("group.member.added", { groupId: "g1", personId: "p1", groupName: "Youth", personEmail: "kid@x.co" }));
    expect(result.status).toBe(204);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1][0]).toBe(`${BASE}/members/${hashOf("kid@x.co")}/tags`);
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ tags: [{ name: "Youth", status: "active" }] });
  });

  it("does not tag when the upsert fails", async () => {
    const fetch = mockFetch([{ status: 400, body: "bad" }]);
    const result = await MailchimpConnector.deliver(webhook, delivery("group.member.added", { groupName: "Youth", personEmail: "kid@x.co" }));
    expect(result.status).toBe(400);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("untags on list.member.removed and treats 404 as success", async () => {
    const fetch = mockFetch([{ status: 404 }]);
    const result = await MailchimpConnector.deliver(webhook, delivery("list.member.removed", { listId: "l1", listName: "Newsletter", personEmail: "a@b.co" }));
    expect(result.status).toBe(200);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ tags: [{ name: "Newsletter", status: "inactive" }] });
  });

  it("skips unmapped events as success", async () => {
    global.fetch = jest.fn() as any;
    const result = await MailchimpConnector.deliver(webhook, delivery("donation.created", { amount: 5 }));
    expect(result.status).toBe(200);
    expect(result.responseBody).toMatch(/not mapped/);
  });

  it("fails without retryable side effects when unconfigured", async () => {
    const result = await MailchimpConnector.deliver({ connectorType: "mailchimp" } as any, delivery("person.created", { email: "a@b.co" }));
    expect(result.status).toBe(0);
  });
});

describe("MailchimpConnector.verify", () => {
  it("passes on 200", async () => {
    mockFetch([{ status: 200 }]);
    expect(await MailchimpConnector.verify(config)).toBeNull();
  });
  it("names the failure on 401 and 404", async () => {
    mockFetch([{ status: 401 }]);
    expect(await MailchimpConnector.verify(config)).toMatch(/API key/);
    mockFetch([{ status: 404 }]);
    expect(await MailchimpConnector.verify(config)).toMatch(/[Aa]udience/);
  });
  it("rejects a key without a dc suffix without calling out", async () => {
    global.fetch = jest.fn() as any;
    expect(await MailchimpConnector.verify({ apiKey: "nope", audienceId: "a" })).toMatch(/data center/);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe("MAILCHIMP_EVENTS", () => {
  it("every supported event has a mapping in deliver", async () => {
    for (const event of MAILCHIMP_EVENTS) {
      mockFetch([{ status: 200 }, { status: 200 }]);
      const result = await MailchimpConnector.deliver(webhook, delivery(event, { email: "a@b.co", personEmail: "a@b.co", groupName: "G", listName: "L", name: { first: "A" } }));
      expect(result.responseBody).not.toMatch(/not mapped/);
      expect(result.status).toBeGreaterThanOrEqual(200);
      expect(result.status).toBeLessThan(300);
    }
  });
});
