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
    expect(NotificationCategoryHelper.categoryFor("notification", "prayer")).toBe("prayer_requests");
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
  it("classifies locked (tier 0) categories", () => {
    expect(NotificationCategoryHelper.isLocked("account_security")).toBe(true);
    expect(NotificationCategoryHelper.isLocked("giving_receipts")).toBe(true);
    expect(NotificationCategoryHelper.isLocked("checkin_safety")).toBe(true);
    expect(NotificationCategoryHelper.isLocked("event_reminders")).toBe(false);
  });

  it("classifies transactional categories (quiet-hours / cap bypass)", () => {
    ["event_reminders", "serving_schedule", "tasks", "direct_messages", "checkin_safety"].forEach((c) =>
      expect(NotificationCategoryHelper.isTransactional(c)).toBe(true));
    ["announcements", "group_messages", "prayer_requests", "giving_campaigns", "ministry_promotions"].forEach((c) =>
      expect(NotificationCategoryHelper.isTransactional(c)).toBe(false));
  });

  it("reminders are never locked", () => {
    ["event_reminders", "serving_schedule", "tasks"].forEach((c) => expect(NotificationCategoryHelper.isLocked(c)).toBe(false));
  });
});

describe("NotificationCategoryHelper.effectiveOptIn (absence-means-default)", () => {
  it("locked categories are always on regardless of overrides", () => {
    const overrides = [{ categoryKey: "account_security", channel: "push", optedIn: false }];
    expect(NotificationCategoryHelper.effectiveOptIn("account_security", "push", overrides)).toBe(true);
  });

  it("tier-1 defaults to its default channel set when no override exists", () => {
    expect(NotificationCategoryHelper.effectiveOptIn("event_reminders", "push", [])).toBe(true);
    expect(NotificationCategoryHelper.effectiveOptIn("event_reminders", "email", [])).toBe(true);
    // in_app is in default channels; sms is not
    expect(NotificationCategoryHelper.effectiveOptIn("event_reminders", "in_app", [])).toBe(true);
    expect(NotificationCategoryHelper.effectiveOptIn("event_reminders", "sms", [])).toBe(false);
  });

  it("tier-2 is off by default (opt-in)", () => {
    expect(NotificationCategoryHelper.effectiveOptIn("giving_campaigns", "push", [])).toBe(false);
    expect(NotificationCategoryHelper.effectiveOptIn("giving_campaigns", "email", [])).toBe(true); // email is its default
  });

  it("an override wins over the default", () => {
    expect(NotificationCategoryHelper.effectiveOptIn("event_reminders", "push", [{ categoryKey: "event_reminders", channel: "push", optedIn: false }])).toBe(false);
    expect(NotificationCategoryHelper.effectiveOptIn("giving_campaigns", "push", [{ categoryKey: "giving_campaigns", channel: "push", optedIn: true }])).toBe(true);
  });
});
