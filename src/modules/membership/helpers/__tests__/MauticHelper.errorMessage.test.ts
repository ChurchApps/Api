jest.mock("../index.js", () => ({ Environment: { mauticUrl: "https://mautic.test", mauticUser: "u", mauticPassword: "p" } }));

import { MauticHelper } from "../MauticHelper.js";

// Production: during the 2026-10-28 Mautic outage every failed contact lookup logged
// "Mautic /api/contacts?search=<address>&limit=1 failed: 500", writing contact emails to CloudWatch.
describe("MauticHelper request errors", () => {
  beforeEach(() => {
    jest.useFakeTimers({ advanceTimers: true });
    (global as any).fetch = jest.fn(async () => ({ ok: false, status: 500, text: async () => "Internal Server Error" }));
  });
  afterEach(() => jest.useRealTimers());

  it("keeps the search query (the contact's email) out of the error message", async () => {
    const errors: string[] = [];
    const spy = jest.spyOn(console, "error").mockImplementation((...args: any[]) => { errors.push(args.map((a) => String(a?.message ?? a)).join(" ")); });
    await MauticHelper.createAndUpdate("demo@example.com", "Demo", "User", { tags: ["b1"] });
    spy.mockRestore();
    expect(errors.join("\n")).toContain("Mautic /api/contacts failed: 500");
    expect(errors.join("\n")).not.toContain("example.com");
  });
});
