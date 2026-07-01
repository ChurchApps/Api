import { PreferenceGateHelper } from "../PreferenceGateHelper.js";

const CHURCH = "CHU00000001";
const PERSON = "PER00000001";

// 23:30 and 12:00 UTC; with timeZone "UTC" the member-local clock equals these.
const NIGHT = new Date("2026-06-30T23:30:00Z");
const NOON = new Date("2026-06-30T12:00:00Z");
const QUIET = { quietHoursStart: "22:00:00", quietHoursEnd: "07:00:00", timeZone: "UTC" };

describe("PreferenceGateHelper.evaluate", () => {
  it("Layer 2: master mute suppresses non-locked", () => {
    const r = PreferenceGateHelper.evaluate(CHURCH, PERSON, "event_reminders", "push", { pref: { masterMute: true, allowPush: true } });
    expect(r.allow).toBe(false);
    expect(r.reason).toBe("master_mute");
  });

  it("Layer 2: allowPush off suppresses the push channel (truthy + numeric 0)", () => {
    expect(PreferenceGateHelper.evaluate(CHURCH, PERSON, "event_reminders", "push", { pref: { allowPush: false } }).reason).toBe("channel_off");
    expect(PreferenceGateHelper.evaluate(CHURCH, PERSON, "event_reminders", "push", { pref: { allowPush: 0 as any } }).reason).toBe("channel_off");
  });

  it("Layer 2: emailFrequency=never suppresses the email channel", () => {
    const r = PreferenceGateHelper.evaluate(CHURCH, PERSON, "group_messages", "email", { pref: { emailFrequency: "never" } });
    expect(r.reason).toBe("channel_off");
  });

  it("Layer 2: sms requires allowSms (default off)", () => {
    expect(PreferenceGateHelper.evaluate(CHURCH, PERSON, "announcements", "sms", { pref: {} }).reason).toBe("channel_off");
  });

  it("Layer 3: transactional reminders bypass quiet hours", () => {
    const r = PreferenceGateHelper.evaluate(CHURCH, PERSON, "event_reminders", "push", { pref: { allowPush: true, ...QUIET }, now: NIGHT });
    expect(r.allow).toBe(true);
  });

  it("Layer 3: non-transactional pushes defer during quiet hours", () => {
    const r = PreferenceGateHelper.evaluate(CHURCH, PERSON, "announcements", "push", { pref: { allowPush: true, ...QUIET }, now: NIGHT });
    expect(r.decision).toBe("defer");
    expect(r.allow).toBe(false);
    expect(r.reason).toBe("quiet_hours");
    expect(r.deferUntil).toBeInstanceOf(Date);
  });

  it("Layer 3: outside quiet hours the push goes through", () => {
    const r = PreferenceGateHelper.evaluate(CHURCH, PERSON, "announcements", "push", { pref: { allowPush: true, ...QUIET }, now: NOON });
    expect(r.allow).toBe(true);
  });

  it("Layer 3: email is never quiet-gated", () => {
    const r = PreferenceGateHelper.evaluate(CHURCH, PERSON, "announcements", "email", { pref: { ...QUIET }, now: NIGHT });
    expect(r.allow).toBe(true);
  });

  it("Layer 4: frequency cap suppresses non-transactional when over cap", () => {
    const base = { pref: { allowPush: true, maxPushPerDay: 5 } };
    expect(PreferenceGateHelper.evaluate(CHURCH, PERSON, "announcements", "push", { ...base, sentInWindow: 5 }).reason).toBe("frequency_cap");
    expect(PreferenceGateHelper.evaluate(CHURCH, PERSON, "announcements", "push", { ...base, sentInWindow: 4 }).allow).toBe(true);
  });

  it("Layer 4: transactional categories ignore the frequency cap", () => {
    const r = PreferenceGateHelper.evaluate(CHURCH, PERSON, "event_reminders", "push", { pref: { allowPush: true, maxPushPerDay: 5 }, sentInWindow: 99 });
    expect(r.allow).toBe(true);
  });

  it("Layer 5: an opt-out override suppresses", () => {
    const r = PreferenceGateHelper.evaluate(CHURCH, PERSON, "event_reminders", "push", {
      pref: { allowPush: true },
      overrides: [{ categoryKey: "event_reminders", channel: "push", optedIn: false }]
    });
    expect(r.reason).toBe("category_opt_out");
  });

  it("default-on tier-1 with no overrides is allowed", () => {
    expect(PreferenceGateHelper.evaluate(CHURCH, PERSON, "event_reminders", "push", { pref: { allowPush: true } }).allow).toBe(true);
  });

  it("a missing preference row behaves as defaults (allowed)", () => {
    expect(PreferenceGateHelper.evaluate(CHURCH, PERSON, "event_reminders", "push", { pref: null }).allow).toBe(true);
  });

  it("Layer 6: a fully muted entity suppresses", () => {
    const r = PreferenceGateHelper.evaluate(CHURCH, PERSON, "event_reminders", "push", {
      pref: { allowPush: true },
      entityType: "event",
      entityId: "E1",
      entityMutes: [{ entityType: "event", entityId: "E1", level: "muted" }]
    });
    expect(r.reason).toBe("entity_muted");
  });

  it("Layer 6: 'mentions' level suppresses non-mentions but allows direct mentions", () => {
    const muteCtx = (isDirectMention: boolean) => ({
      pref: { allowPush: true },
      entityType: "group",
      entityId: "G1",
      isDirectMention,
      entityMutes: [{ entityType: "group", entityId: "G1", level: "mentions" }]
    });
    expect(PreferenceGateHelper.evaluate(CHURCH, PERSON, "group_messages", "push", muteCtx(false)).reason).toBe("entity_muted");
    expect(PreferenceGateHelper.evaluate(CHURCH, PERSON, "group_messages", "push", muteCtx(true)).allow).toBe(true);
  });

  it("Layer 6: a mute on a different entity does not suppress", () => {
    const r = PreferenceGateHelper.evaluate(CHURCH, PERSON, "event_reminders", "push", {
      pref: { allowPush: true },
      entityType: "event",
      entityId: "E1",
      entityMutes: [{ entityType: "event", entityId: "OTHER", level: "muted" }]
    });
    expect(r.allow).toBe(true);
  });
});
