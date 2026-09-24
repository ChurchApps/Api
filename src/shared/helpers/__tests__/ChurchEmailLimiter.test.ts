jest.mock("../../infrastructure/RepoManager.js", () => ({ RepoManager: { getRepos: jest.fn() } }));

import { RepoManager } from "../../infrastructure/RepoManager.js";
import { ChurchEmailLimiter } from "../ChurchEmailLimiter.js";
import { parseFeedback } from "../../../lambda/ses-feedback-handler.js";

interface Opts {
  church?: any;
  sent?: number;
  sentWeek?: number;
  best?: Record<string, number>;
  today?: { churchId: string; cnt: number }[];
  complaints?: number;
  bounces?: number;
}

function setup(o: Opts) {
  const repos: any = {
    church: { loadById: jest.fn(async (id: string) => (id === "archived" ? { id, archivedDate: new Date() } : o.church === undefined ? { id } : o.church)) },
    deliveryLog: {
      countChurchEmailsSince: jest.fn(async (_id: string, since: Date) => (Date.now() - since.getTime() > 2 * 86400000 ? (o.sentWeek ?? 0) : (o.sent ?? 0))),
      bestChurchEmailDay: jest.fn(async (id: string) => o.best?.[id] ?? 0),
      countChurchEmailsByChurchSince: jest.fn(async () => o.today ?? []),
      countFeedbackSince: jest.fn(async (_id: string, method: string) => (method === "sesComplaint" ? (o.complaints ?? 0) : (o.bounces ?? 0)))
    }
  };
  (RepoManager.getRepos as jest.Mock).mockResolvedValue(repos);
}

describe("ChurchEmailLimiter.remaining", () => {
  it("blocks archived and missing churches", async () => {
    setup({ church: { id: "c1", archivedDate: new Date() } });
    expect(await ChurchEmailLimiter.remaining("c1")).toBe(0);
    setup({ church: null });
    expect(await ChurchEmailLimiter.remaining("c1")).toBe(0);
  });

  it("gives a church with history twice its best day, capped at 2000", async () => {
    setup({ best: { c1: 141 }, sent: 100 });
    expect(await ChurchEmailLimiter.remaining("c1")).toBe(182);
    setup({ best: { c1: 5000 } });
    expect(await ChurchEmailLimiter.remaining("c1")).toBe(2000);
  });

  it("puts churches without history on a starter allowance inside a shared pool", async () => {
    setup({});
    expect(await ChurchEmailLimiter.remaining("c1")).toBe(150);
    setup({ today: [{ churchId: "c2", cnt: 100 }, { churchId: "c3", cnt: 120 }] });
    expect(await ChurchEmailLimiter.remaining("c1")).toBe(80);
    setup({ today: [{ churchId: "c2", cnt: 100 }, { churchId: "c3", cnt: 120 }], best: { c3: 500 } });
    expect(await ChurchEmailLimiter.remaining("c1")).toBe(150);
    setup({ today: [{ churchId: "archived", cnt: 2471 }] });
    expect(await ChurchEmailLimiter.remaining("c1")).toBe(150);
  });

  it("pauses a church generating complaints or hard bounces", async () => {
    setup({ best: { c1: 500 }, sentWeek: 400, complaints: 2 });
    expect(await ChurchEmailLimiter.remaining("c1")).toBe(0);
    setup({ best: { c1: 500 }, sentWeek: 2000, complaints: 2 });
    expect(await ChurchEmailLimiter.remaining("c1")).toBe(1000);
    setup({ best: { c1: 500 }, sentWeek: 150, bounces: 10 });
    expect(await ChurchEmailLimiter.remaining("c1")).toBe(0);
  });
});

describe("parseFeedback", () => {
  it("reads complaints and permanent bounces, ignores transient bounces", () => {
    expect(parseFeedback({ notificationType: "Complaint", complaint: { complainedRecipients: [{ emailAddress: "a@x.com" }], complaintFeedbackType: "abuse" } }))
      .toEqual({ method: "sesComplaint", addresses: ["a@x.com"], detail: "abuse" });
    expect(parseFeedback({ notificationType: "Bounce", bounce: { bounceType: "Permanent", bounceSubType: "General", bouncedRecipients: [{ emailAddress: "b@x.com" }] } }))
      .toEqual({ method: "sesBounce", addresses: ["b@x.com"], detail: "General" });
    expect(parseFeedback({ notificationType: "Bounce", bounce: { bounceType: "Transient", bouncedRecipients: [{ emailAddress: "c@x.com" }] } })).toBeNull();
  });
});
