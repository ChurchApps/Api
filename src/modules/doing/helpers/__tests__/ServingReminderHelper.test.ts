const loadUpcomingForReminders = jest.fn();
const loadForReminder = jest.fn();
jest.mock("../../../../shared/infrastructure/RepoManager.js", () => ({ RepoManager: { getRepos: jest.fn(async () => ({ plan: { loadUpcomingForReminders }, assignment: { loadForReminder } })) } }));

const createNotifications = jest.fn(async () => []);
const loadSentReminderKeys = jest.fn(async () => [] as string[]);
const logReminderSends = jest.fn(async () => undefined);
const loadChurch = jest.fn(async () => ({ subDomain: "demo", name: "Demo Church" }));
const loadPeople = jest.fn(async () => [{ id: "p1", displayName: "Pat Smith" }, { id: "p2", displayName: "Sam Lee" }]);
const loadPerson = jest.fn(async (_c: string, id: string) => ({ id, email: `${id}@example.com` }));
jest.mock("../../../../shared/modules/index.js", () => ({
  getMembershipModuleGateway: () => ({ loadChurch, loadPeople, loadPerson }),
  getMessagingModuleGateway: () => ({ createNotifications, loadSentReminderKeys, logReminderSends })
}));

const sendTemplatedEmail = jest.fn(async () => undefined);
jest.mock("@churchapps/apihelper", () => ({ EmailHelper: { sendTemplatedEmail } }));

jest.mock("../../../../shared/helpers/Environment.js", () => ({ Environment: { supportEmail: "support@test", doingApi: "https://api.test/doing", jwtSecret: "test-secret" } }));

import { ServingReminderHelper } from "../ServingReminderHelper.js";

describe("ServingReminderHelper.parseOffsets", () => {
  it("defaults to 2 days when unconfigured, empties when blank, clamps and dedupes", () => {
    expect(ServingReminderHelper.parseOffsets(undefined)).toEqual([2]);
    expect(ServingReminderHelper.parseOffsets(null)).toEqual([2]);
    expect(ServingReminderHelper.parseOffsets("")).toEqual([]);
    expect(ServingReminderHelper.parseOffsets("7,1,0")).toEqual([7, 1, 0]);
    expect(ServingReminderHelper.parseOffsets("9, -1, 2, 2")).toEqual([2]); // 9>max and -1<0 dropped, dup collapsed
  });
});

describe("ServingReminderHelper.sendReminders", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    loadSentReminderKeys.mockResolvedValue([]);
  });

  it("reminds confirmed and unconfirmed at a configured offset, with accept/decline only for the unconfirmed", async () => {
    loadUpcomingForReminders.mockResolvedValue([{ id: "plan1", churchId: "c1", name: "Sunday AM", serviceDate: "2026-07-01", notes: "Wear blue", reminderOffsets: "2", reminderMessage: "Arrive 30 min early", daysOut: 2 }]);
    loadForReminder.mockResolvedValue([
      { id: "a1", personId: "p1", status: "Accepted", positionName: "Guitar", categoryName: "Worship" },
      { id: "a2", personId: "p2", status: "Unconfirmed", positionName: "Usher", categoryName: "Hospitality" }
    ]);

    const res = await ServingReminderHelper.sendReminders();

    expect(res).toEqual({ notifications: 2, emails: 2 });
    expect(createNotifications).toHaveBeenCalledTimes(1);
    expect(createNotifications.mock.calls[0][0]).toHaveLength(2);
    // Ledger: one 'sent' row per person for this plan, tagged as a cross-source plan reminder.
    expect(logReminderSends).toHaveBeenCalledTimes(1);
    const rows = logReminderSends.mock.calls[0][0] as any[];
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.personId).sort()).toEqual(["p1", "p2"]);
    rows.forEach((r) => { expect(r).toMatchObject({ entityType: "plan", entityId: "plan1", category: "serving_schedule" }); expect(r.idempotencyKey).toHaveLength(64); });

    const p2Email = sendTemplatedEmail.mock.calls.find((c: any[]) => c[1] === "p2@example.com");
    const p1Email = sendTemplatedEmail.mock.calls.find((c: any[]) => c[1] === "p1@example.com");
    expect(p2Email[5]).toContain("/assignments/public/respond?token="); // unconfirmed → action buttons
    expect(p1Email[5]).not.toContain("public/respond"); // confirmed → no buttons
    expect(p2Email[5]).toContain("Arrive 30 min early"); // custom message included
  });

  it("is idempotent: skips people already recorded in the shared ledger", async () => {
    loadUpcomingForReminders.mockResolvedValue([{ id: "plan1", churchId: "c1", name: "x", serviceDate: "2026-07-01", reminderOffsets: "2", daysOut: 2 }]);
    loadForReminder.mockResolvedValue([
      { id: "a1", personId: "p1", status: "Accepted", positionName: "Guitar" },
      { id: "a2", personId: "p2", status: "Unconfirmed", positionName: "Usher" }
    ]);
    loadSentReminderKeys.mockImplementation(async (keys: string[]) => keys); // every candidate already sent

    const res = await ServingReminderHelper.sendReminders();
    expect(res.notifications).toBe(0);
    expect(createNotifications).not.toHaveBeenCalled();
    expect(logReminderSends).not.toHaveBeenCalled();
  });

  it("only reminds the people not yet in the ledger (partial send)", async () => {
    loadUpcomingForReminders.mockResolvedValue([{ id: "plan1", churchId: "c1", name: "x", serviceDate: "2026-07-01", reminderOffsets: "2", daysOut: 2 }]);
    loadForReminder.mockResolvedValue([
      { id: "a1", personId: "p1", status: "Accepted", positionName: "Guitar" },
      { id: "a2", personId: "p2", status: "Accepted", positionName: "Usher" }
    ]);
    // p1 already sent (return only the first candidate key); p2 still fresh.
    loadSentReminderKeys.mockImplementation(async (keys: string[]) => keys.slice(0, 1));

    const res = await ServingReminderHelper.sendReminders();
    expect(res.notifications).toBe(1);
    expect(logReminderSends.mock.calls[0][0]).toHaveLength(1);
  });

  it("does not fire on a non-configured day or when reminders are disabled", async () => {
    loadUpcomingForReminders.mockResolvedValue([
      { id: "planA", churchId: "c1", name: "x", serviceDate: "2026-07-04", reminderOffsets: "2", daysOut: 5 },
      { id: "planB", churchId: "c1", name: "y", serviceDate: "2026-07-01", reminderOffsets: "", daysOut: 2 }
    ]);
    const res = await ServingReminderHelper.sendReminders();
    expect(res.notifications).toBe(0);
    expect(loadForReminder).not.toHaveBeenCalled();
  });

  it("fires a day-of reminder when offsets include 0", async () => {
    loadUpcomingForReminders.mockResolvedValue([{ id: "plan1", churchId: "c1", name: "Sunday AM", serviceDate: "2026-06-30", reminderOffsets: "0", daysOut: 0 }]);
    loadForReminder.mockResolvedValue([{ id: "a1", personId: "p1", status: "Accepted", positionName: "Guitar" }]);
    const res = await ServingReminderHelper.sendReminders();
    expect(res.notifications).toBe(1);
    expect(logReminderSends.mock.calls[0][0][0]).toMatchObject({ entityId: "plan1", personId: "p1" });
  });
});
