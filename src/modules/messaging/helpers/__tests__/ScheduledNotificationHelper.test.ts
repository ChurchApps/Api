// Scheduled push notifications (ChurchAppsSupport#1411): the one-minute timer claims due rows,
// resolves the audience at send time, and hands off to the normal notification pipeline.
const createNotificationsMock = jest.fn() as jest.MockedFunction<any>;
jest.mock("../NotificationHelper.js", () => ({ NotificationHelper: { createNotifications: createNotificationsMock } }));
jest.mock("web-push", () => ({ setVapidDetails: jest.fn(), sendNotification: jest.fn() }));
jest.mock("../../../../shared/helpers/Environment.js", () => ({ Environment: {} }));
jest.mock("../../../../shared/infrastructure/RepoManager.js", () => ({ RepoManager: { getRepos: jest.fn(async () => ({ groupMember: { loadForGroup: jest.fn(async () => [{ personId: "P1" }, { personId: "P2" }, { personId: "SENDER" }]) } })) } }));

import { ScheduledNotificationHelper } from "../ScheduledNotificationHelper.js";
import { PushAudienceHelper } from "../PushAudienceHelper.js";

const webPush = (personId: string) => ({ personId, fcmToken: "webpush:" + JSON.stringify({ endpoint: "https://push.example/" + personId, keys: { p256dh: "a", auth: "b" } }) });

function makeRepos(rows: any[], opts: { claim?: boolean; devices?: any[]; prefs?: any[] } = {}) {
  return {
    scheduledNotification: {
      loadDue: jest.fn(async () => rows),
      claim: jest.fn(async () => opts.claim ?? true),
      markSent: jest.fn(async () => undefined),
      markRetry: jest.fn(async () => undefined),
      markFailed: jest.fn(async () => undefined)
    },
    device: { loadByChurchId: jest.fn(async () => opts.devices ?? [webPush("P1"), webPush("P2"), webPush("SENDER"), { personId: "P3", fcmToken: "ExponentPushToken[x]" }]) },
    notificationPreference: { loadByPersonIds: jest.fn(async () => opts.prefs ?? []) }
  } as any;
}

const now = new Date("2026-11-12T15:00:00Z");
const row = (over: any = {}) => ({ id: "S1", churchId: "C1", audience: "church", title: "Main session", message: "Starts in 15 minutes", sendAt: new Date("2026-11-12T14:59:00Z"), attemptCount: 0, createdByPersonId: "SENDER", ...over });

beforeEach(() => createNotificationsMock.mockReset().mockImplementation(async (ids: string[]) => ids.map((personId) => ({ personId, deliveryMethod: "push" }))));

describe("ScheduledNotificationHelper.dispatchDue", () => {
  it("claims a due row, sends it to everyone with the app and marks it sent", async () => {
    const repos = makeRepos([row()]);
    await ScheduledNotificationHelper.dispatchDue(repos, now);
    expect(repos.scheduledNotification.claim).toHaveBeenCalledWith("S1");
    expect(createNotificationsMock).toHaveBeenCalledWith(["P1", "P2"], "C1", "churchPushNotification", "S1", "Starts in 15 minutes", "/mobile/notifications", "SENDER", expect.objectContaining({ deliveryStartLevel: 1, deliveryTitle: "Main session", navData: expect.objectContaining({ link: "/mobile/notifications" }) }));
    expect(repos.scheduledNotification.markSent).toHaveBeenCalledWith("S1", 2, 2);
  });

  it("sends a group row to the group's members with the group link", async () => {
    const repos = makeRepos([row({ audience: "group", groupId: "G1" })]);
    await ScheduledNotificationHelper.dispatchDue(repos, now);
    expect(createNotificationsMock).toHaveBeenCalledWith(["P1", "P2"], "C1", "groupPushNotification", "S1", "Starts in 15 minutes", "/mobile/groups/G1", "SENDER", expect.objectContaining({ navData: expect.objectContaining({ innerType: "group", innerId: "G1" }) }));
  });

  it("skips a row another worker already claimed", async () => {
    const repos = makeRepos([row()], { claim: false });
    await ScheduledNotificationHelper.dispatchDue(repos, now);
    expect(createNotificationsMock).not.toHaveBeenCalled();
  });

  it("fails rather than sends a row first claimed more than 30 minutes late", async () => {
    const repos = makeRepos([row({ sendAt: new Date("2026-11-12T14:29:00Z") })]);
    await ScheduledNotificationHelper.dispatchDue(repos, now);
    expect(createNotificationsMock).not.toHaveBeenCalled();
    expect(repos.scheduledNotification.markFailed).toHaveBeenCalledWith("S1", "missed send window");
  });

  it("retries a failed send, then gives up after three attempts", async () => {
    createNotificationsMock.mockRejectedValue(new Error("boom"));
    const repos = makeRepos([row()]);
    await ScheduledNotificationHelper.dispatchDue(repos, now);
    expect(repos.scheduledNotification.markRetry).toHaveBeenCalledWith("S1", "boom");

    const repos2 = makeRepos([row({ attemptCount: 2 })]);
    await ScheduledNotificationHelper.dispatchDue(repos2, now);
    expect(repos2.scheduledNotification.markFailed).toHaveBeenCalledWith("S1", "boom");
  });
});

describe("PushAudienceHelper.getChurchPushPreview", () => {
  it("counts people with a web-push device, minus the sender and anyone who turned push off", async () => {
    const repos = makeRepos([], { prefs: [{ churchId: "C1", personId: "P2", allowPush: false }] });
    const preview = await PushAudienceHelper.getChurchPushPreview(repos, "C1", "SENDER");
    expect(preview.eligiblePersonIds).toEqual(["P1"]);
    expect(preview.totalMembers).toBe(3);
    expect(preview.pushDisabledCount).toBe(1);
    expect(preview.excludedSenderCount).toBe(1);
  });
});
