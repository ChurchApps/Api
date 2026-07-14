import { WebhookDispatcher } from "../WebhookDispatcher";

const enrich = (repos: any, event: string, payload: any) => (WebhookDispatcher as any).enrich(repos, "c1", event, payload);

const repos = {
  person: { load: jest.fn().mockResolvedValue({ id: "p1", displayName: "Jane Doe", firstName: "Jane", lastName: "Doe" }) },
  group: { load: jest.fn().mockResolvedValue({ id: "g1", name: "Youth Group" }) },
  form: { load: jest.fn().mockResolvedValue({ id: "f1", name: "Connect Card" }) }
};

describe("WebhookDispatcher.enrich", () => {
  it("adds personName and groupName to group member events", async () => {
    const out = await enrich(repos, "group.member.added", { id: "gm1", groupId: "g1", personId: "p1" });
    expect(out).toMatchObject({ personName: "Jane Doe", groupName: "Youth Group" });
  });

  it("resolves the person from contentId for form submissions and adds formName", async () => {
    const out = await enrich(repos, "form.submission.created", { id: "fs1", formId: "f1", contentType: "person", contentId: "p1" });
    expect(out).toMatchObject({ formName: "Connect Card", personName: "Jane Doe" });
  });

  it("falls back to first/last when displayName is missing", async () => {
    const r = { ...repos, person: { load: jest.fn().mockResolvedValue({ firstName: "Jane", lastName: "Doe" }) } };
    const out = await enrich(r, "donation.created", { id: "d1", personId: "p1", amount: 5 });
    expect(out.personName).toBe("Jane Doe");
  });

  it("leaves unmapped events and anonymous donations untouched", async () => {
    const person = { id: "p1", name: { first: "Jane" } };
    expect(await enrich(repos, "person.created", person)).toBe(person);
    const anon = await enrich(repos, "donation.created", { id: "d1", personId: null, amount: 5 });
    expect(anon.personName).toBeUndefined();
  });

  it("delivers the original payload when a lookup throws", async () => {
    const r = { ...repos, person: { load: jest.fn().mockRejectedValue(new Error("db down")) } };
    const out = await enrich(r, "attendance.recorded", { id: "v1", personId: "p1" });
    expect(out).toMatchObject({ id: "v1", personId: "p1" });
    expect(out.personName).toBeUndefined();
  });
});
