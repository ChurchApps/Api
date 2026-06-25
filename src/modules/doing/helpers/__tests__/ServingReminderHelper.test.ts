const loadUpcomingForReminders = jest.fn();
const loadForReminder = jest.fn();
const markReminderSent = jest.fn();
jest.mock("../../../../shared/infrastructure/RepoManager.js", () => ({ RepoManager: { getRepos: jest.fn(async () => ({ plan: { loadUpcomingForReminders, markReminderSent }, assignment: { loadForReminder } })) } }));

const createNotifications = jest.fn(async () => []);
const loadChurch = jest.fn(async () => ({ subDomain: "demo", name: "Demo Church" }));
const loadPeople = jest.fn(async () => [{ id: "p1", displayName: "Pat Smith" }, { id: "p2", displayName: "Sam Lee" }]);
const loadPerson = jest.fn(async (_c: string, id: string) => ({ id, email: `${id}@example.com` }));
jest.mock("../../../../shared/modules/index.js", () => ({
  getMembershipModuleGateway: () => ({ loadChurch, loadPeople, loadPerson }),
  getMessagingModuleGateway: () => ({ createNotifications })
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
  beforeEach(() => jest.clearAllMocks());

  it("reminds confirmed and unconfirmed at a configured offset, with accept/decline only for the unconfirmed", async () => {
    loadUpcomingForReminders.mockResolvedValue([{ id: "plan1", churchId: "c1", name: "Sunday AM", serviceDate: "2026-07-01", notes: "Wear blue", reminderOffsets: "2", reminderMessage: "Arrive 30 min early", remindersSent: null, daysOut: 2 }]);
    loadForReminder.mockResolvedValue([
      { id: "a1", personId: "p1", status: "Accepted", positionName: "Guitar", categoryName: "Worship" },
      { id: "a2", personId: "p2", status: "Unconfirmed", positionName: "Usher", categoryName: "Hospitality" }
    ]);

    const res = await ServingReminderHelper.sendReminders();

    expect(res).toEqual({ notifications: 2, emails: 2 });
    expect(createNotifications).toHaveBeenCalledTimes(1);
    expect(createNotifications.mock.calls[0][0]).toHaveLength(2);
    expect(markReminderSent).toHaveBeenCalledWith("c1", "plan1", "2");

    const p2Email = sendTemplatedEmail.mock.calls.find((c: any[]) => c[1] === "p2@example.com");
    const p1Email = sendTemplatedEmail.mock.calls.find((c: any[]) => c[1] === "p1@example.com");
    expect(p2Email[5]).toContain("/assignments/public/respond?token="); // unconfirmed → action buttons
    expect(p1Email[5]).not.toContain("public/respond"); // confirmed → no buttons
    expect(p2Email[5]).toContain("Arrive 30 min early"); // custom message included
  });

  it("is idempotent: skips an offset already recorded in remindersSent", async () => {
    loadUpcomingForReminders.mockResolvedValue([{ id: "plan1", churchId: "c1", name: "x", serviceDate: "2026-07-01", reminderOffsets: "2", remindersSent: "2", daysOut: 2 }]);
    const res = await ServingReminderHelper.sendReminders();
    expect(res.notifications).toBe(0);
    expect(loadForReminder).not.toHaveBeenCalled();
    expect(markReminderSent).not.toHaveBeenCalled();
  });

  it("does not fire on a non-configured day or when reminders are disabled", async () => {
    loadUpcomingForReminders.mockResolvedValue([
      { id: "planA", churchId: "c1", name: "x", serviceDate: "2026-07-04", reminderOffsets: "2", remindersSent: null, daysOut: 5 },
      { id: "planB", churchId: "c1", name: "y", serviceDate: "2026-07-01", reminderOffsets: "", remindersSent: null, daysOut: 2 }
    ]);
    const res = await ServingReminderHelper.sendReminders();
    expect(res.notifications).toBe(0);
    expect(loadForReminder).not.toHaveBeenCalled();
  });

  it("fires a day-of reminder when offsets include 0", async () => {
    loadUpcomingForReminders.mockResolvedValue([{ id: "plan1", churchId: "c1", name: "Sunday AM", serviceDate: "2026-06-30", reminderOffsets: "0", remindersSent: null, daysOut: 0 }]);
    loadForReminder.mockResolvedValue([{ id: "a1", personId: "p1", status: "Accepted", positionName: "Guitar" }]);
    const res = await ServingReminderHelper.sendReminders();
    expect(res.notifications).toBe(1);
    expect(markReminderSent).toHaveBeenCalledWith("c1", "plan1", "0");
  });
});
