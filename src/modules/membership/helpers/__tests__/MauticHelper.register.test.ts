jest.mock("../index.js", () => ({ Environment: { mauticUrl: "https://mautic.test", mauticUser: "u", mauticPassword: "p" } }));

import { MauticHelper } from "../MauticHelper.js";

// Production: POST /api/companies/new answered 400 "companyaddress1: This value is too long. It should have 64 characters
// or less." for churches registered with a long street address, so the whole Mautic sync for that church failed.
describe("MauticHelper.register", () => {
  const calls: { path: string; body: any }[] = [];

  beforeEach(() => {
    calls.length = 0;
    (global as any).fetch = jest.fn(async (url: string, init: any) => {
      const path = url.replace("https://mautic.test", "");
      const body = init.body ? JSON.parse(init.body) : undefined;
      calls.push({ path, body });
      if (path === "/api/companies/new" && body.companyaddress1.length > 64) return { ok: false, status: 400, text: async () => "companyaddress1: This value is too long." };
      if (path === "/api/companies/new") return { ok: true, status: 200, json: async () => ({ company: { id: 7 } }) };
      if (path === "/api/contacts/new") return { ok: true, status: 200, json: async () => ({ contact: { id: 9 } }) };
      return { ok: true, status: 200, json: async () => ({}) };
    });
  });

  it("registers a church whose street address is longer than Mautic's 64-character company field", async () => {
    const address = "1234 Very Long Church Campus Boulevard, Building C, Suite 400, Rear Entrance";
    await expect(MauticHelper.register("CHURCH1", "Grace Church", "Demo", "User", address, "Springfield", "IL", "62701", "US", "demo@example.com", "B1Admin")).resolves.toBeUndefined();
    const company = calls.find((c) => c.path === "/api/companies/new")!.body;
    expect(company.companyaddress1).toBe(address.substring(0, 64));
    expect(calls.map((c) => c.path)).toContain("/api/companies/7/contact/9/add");
  });
});
