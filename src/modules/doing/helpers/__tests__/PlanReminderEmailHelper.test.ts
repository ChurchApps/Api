const load = jest.fn();
const loadForReminder = jest.fn();
jest.mock("../../../../shared/infrastructure/RepoManager.js", () => ({ RepoManager: { getRepos: jest.fn(async () => ({ plan: { load }, assignment: { loadForReminder } })) } }));

const loadChurch = jest.fn(async () => ({ subDomain: "demo", name: "Demo Church" }));
const loadPeople = jest.fn(async () => [{ id: "p1", displayName: "Pat Smith" }, { id: "p2", displayName: "Sam Lee" }]);
jest.mock("../../../../shared/modules/index.js", () => ({ getMembershipModuleGateway: () => ({ loadChurch, loadPeople }) }));

jest.mock("../../../../shared/helpers/Environment.js", () => ({ Environment: { supportEmail: "support@test", doingApi: "https://api.test/doing", jwtSecret: "test-secret" } }));

import { PlanReminderEmailHelper } from "../PlanReminderEmailHelper.js";

describe("PlanReminderEmailHelper.build", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    load.mockResolvedValue({ id: "plan1", churchId: "c1", name: "Sunday AM", serviceDate: "2026-07-01", notes: "Wear blue" });
    loadForReminder.mockResolvedValue([
      { id: "a1", personId: "p1", status: "Accepted", positionName: "Guitar" },
      { id: "a2", personId: "p2", status: "Unconfirmed", positionName: "Usher" }
    ]);
  });

  it("renders positions, notes and custom message; unconfirmed gets Accept+Decline token links, confirmed does not", async () => {
    const emails = await PlanReminderEmailHelper.build("c1", "plan1", ["p1", "p2"], "Arrive 30 min early");

    expect(Object.keys(emails).sort()).toEqual(["p1", "p2"]);
    expect(emails.p1.subject).toBe("Serving Reminder: Sunday AM");

    // Unconfirmed p2: both action buttons, each carrying a token; positions, notes, custom message present.
    const p2 = emails.p2.html;
    const accepts = p2.match(/\/assignments\/public\/respond\?token=/g) || [];
    expect(accepts.length).toBe(2); // Accept + Decline
    expect(p2).toContain(">Accept<");
    expect(p2).toContain(">Decline<");
    expect(p2).toContain("Usher");
    expect(p2).toContain("Wear blue"); // plan notes
    expect(p2).toContain("Arrive 30 min early"); // custom message

    // Confirmed p1: no token buttons.
    expect(emails.p1.html).not.toContain("public/respond");
    expect(emails.p1.html).toContain("Guitar");
  });

  it("only builds emails for the requested personIds", async () => {
    const emails = await PlanReminderEmailHelper.build("c1", "plan1", ["p1"], undefined);
    expect(Object.keys(emails)).toEqual(["p1"]);
    expect(emails.p1.html).not.toContain("Arrive 30 min early"); // no custom message passed
  });

  it("returns an empty map when the plan is missing", async () => {
    load.mockResolvedValue(null);
    const emails = await PlanReminderEmailHelper.build("c1", "missing", ["p1"], undefined);
    expect(emails).toEqual({});
  });
});
