import { NotificationCategoryHelper } from "../NotificationCategoryHelper.js";

describe("NotificationCategoryHelper.categoryFor", () => {
  it("maps known content types", () => {
    expect(NotificationCategoryHelper.categoryFor("privateMessage")).toBe("direct_messages");
    expect(NotificationCategoryHelper.categoryFor("assignment")).toBe("serving_schedule");
    expect(NotificationCategoryHelper.categoryFor("task")).toBe("tasks");
    expect(NotificationCategoryHelper.categoryFor("groupPushNotification")).toBe("announcements");
    expect(NotificationCategoryHelper.categoryFor("groupJoinRequest")).toBe("group_activity");
    expect(NotificationCategoryHelper.categoryFor("event")).toBe("event_reminders");
  });

  it("maps generic notifications via innerType", () => {
    expect(NotificationCategoryHelper.categoryFor("notification", "group")).toBe("group_messages");
    expect(NotificationCategoryHelper.categoryFor("notification", "event")).toBe("event_reminders");
  });

  it("falls back to group_messages for unmapped / bare types (never a locked one)", () => {
    expect(NotificationCategoryHelper.categoryFor("notification")).toBe("group_messages");
    expect(NotificationCategoryHelper.categoryFor("notification", "somethingNew")).toBe("group_messages");
    expect(NotificationCategoryHelper.categoryFor("totallyUnknown")).toBe("group_messages");
    expect(NotificationCategoryHelper.categoryFor(undefined)).toBe("group_messages");
    expect(NotificationCategoryHelper.isLocked(NotificationCategoryHelper.categoryFor("totallyUnknown"))).toBe(false);
  });
});

describe("NotificationCategoryHelper tiers / transactional", () => {
  it("no category is currently locked (tier 0)", () => {
    NotificationCategoryHelper.all().forEach((c) => expect(NotificationCategoryHelper.isLocked(c.categoryKey)).toBe(false));
  });

  it("classifies transactional categories (quiet-hours / cap bypass)", () => {
    ["event_reminders", "serving_schedule", "tasks", "direct_messages"].forEach((c) =>
      expect(NotificationCategoryHelper.isTransactional(c)).toBe(true));
    ["announcements", "group_messages", "group_activity"].forEach((c) =>
      expect(NotificationCategoryHelper.isTransactional(c)).toBe(false));
  });

  it("reminders are never locked", () => {
    ["event_reminders", "serving_schedule", "tasks"].forEach((c) => expect(NotificationCategoryHelper.isLocked(c)).toBe(false));
  });
});

describe("NotificationCategoryHelper.effectiveOptIn (absence-means-default)", () => {
  it("tier-1 defaults to its default channel set when no override exists", () => {
    expect(NotificationCategoryHelper.effectiveOptIn("event_reminders", "push", [])).toBe(true);
    expect(NotificationCategoryHelper.effectiveOptIn("event_reminders", "email", [])).toBe(true);
    // in_app is in default channels; sms is not
    expect(NotificationCategoryHelper.effectiveOptIn("event_reminders", "in_app", [])).toBe(true);
    expect(NotificationCategoryHelper.effectiveOptIn("event_reminders", "sms", [])).toBe(false);
  });

  it("an override wins over the default", () => {
    expect(NotificationCategoryHelper.effectiveOptIn("event_reminders", "push", [{ categoryKey: "event_reminders", channel: "push", optedIn: false }])).toBe(false);
    expect(NotificationCategoryHelper.effectiveOptIn("group_activity", "push", [{ categoryKey: "group_activity", channel: "push", optedIn: true }])).toBe(true);
  });
});
