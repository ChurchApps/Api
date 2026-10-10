import { CheckinGateHelper, type GateGroup, type GateCount, type GateIncoming } from "../CheckinGateHelper.js";

const group = (over: Partial<GateGroup>): GateGroup => ({ id: "g1", name: "Nursery", checkinClosed: false, ...over });
const cur = (over: Partial<GateCount> = {}): GateCount => ({ total: 0, volunteers: 0, guests: 0, ...over });
const inc = (over: Partial<GateIncoming> = {}): GateIncoming => ({ total: 0, volunteers: 0, guests: 0, nonVolunteers: 0, ...over });

describe("CheckinGateHelper capacity", () => {
  it("rejects a closed room", () => {
    const r = CheckinGateHelper.evaluate({
      groups: { g1: group({ checkinClosed: true }) },
      current: {},
      incoming: { g1: inc({ total: 1, nonVolunteers: 1 }) },
      ratioEnforcement: "warn"
    });
    expect(r.hard).toEqual([{ groupId: "g1", groupName: "Nursery", reason: "capacity" }]);
  });

  it("allows exactly at capacity and rejects one over (capacity=10, 9 present, +2)", () => {
    const ok = CheckinGateHelper.evaluate({ groups: { g1: group({ capacity: 10 }) }, current: { g1: cur({ total: 8 }) }, incoming: { g1: inc({ total: 2, nonVolunteers: 2 }) }, ratioEnforcement: "warn" });
    expect(ok.hard).toHaveLength(0);
    const over = CheckinGateHelper.evaluate({ groups: { g1: group({ capacity: 10 }) }, current: { g1: cur({ total: 9 }) }, incoming: { g1: inc({ total: 2, nonVolunteers: 2 }) }, ratioEnforcement: "warn" });
    expect(over.hard).toHaveLength(1);
    expect(over.hard[0].reason).toBe("capacity");
  });

  it("enforces guestCapacity only against guests", () => {
    const r = CheckinGateHelper.evaluate({ groups: { g1: group({ capacity: 100, guestCapacity: 1 }) }, current: { g1: cur({ total: 1, guests: 1 }) }, incoming: { g1: inc({ total: 1, guests: 1, nonVolunteers: 1 }) }, ratioEnforcement: "warn" });
    expect(r.hard[0].reason).toBe("capacity");
  });

  it("no config => no gate", () => {
    const r = CheckinGateHelper.evaluate({ groups: {}, current: {}, incoming: { g1: inc({ total: 5, nonVolunteers: 5 }) }, ratioEnforcement: "block" });
    expect(r.hard).toHaveLength(0);
    expect(r.warnings).toHaveLength(0);
  });
});

describe("CheckinGateHelper ratio", () => {
  const ratioGroup = group({ volunteerRatio: 5, minVolunteers: 1 });

  it("0 volunteers + no ratio + no minVolunteers => no gate", () => {
    const r = CheckinGateHelper.evaluate({ groups: { g1: group({}) }, current: {}, incoming: { g1: inc({ total: 3, nonVolunteers: 3 }) }, ratioEnforcement: "block" });
    expect(r.hard).toHaveLength(0);
  });

  it("blocks when minVolunteers unmet", () => {
    const r = CheckinGateHelper.evaluate({ groups: { g1: ratioGroup }, current: {}, incoming: { g1: inc({ total: 1, nonVolunteers: 1 }) }, ratioEnforcement: "block" });
    expect(r.hard).toEqual([{ groupId: "g1", groupName: "Nursery", reason: "ratio" }]);
  });

  it("at 1:5 with 1 volunteer, allows 5 children and blocks the 6th", () => {
    // 1 volunteer present, 5 children present, 1 more child incoming => 6 > 1*5 => violation
    const r = CheckinGateHelper.evaluate({ groups: { g1: ratioGroup }, current: { g1: cur({ total: 6, volunteers: 1 }) }, incoming: { g1: inc({ total: 1, nonVolunteers: 1 }) }, ratioEnforcement: "block" });
    expect(r.hard).toHaveLength(1);
    // 1 volunteer, 4 children present, +1 child => 5 children == 1*5 => OK
    const ok = CheckinGateHelper.evaluate({ groups: { g1: ratioGroup }, current: { g1: cur({ total: 5, volunteers: 1 }) }, incoming: { g1: inc({ total: 1, nonVolunteers: 1 }) }, ratioEnforcement: "block" });
    expect(ok.hard).toHaveLength(0);
  });

  it("an incoming volunteer raises the ceiling", () => {
    // minVolunteers met by incoming volunteer; 5 children under 2 volunteers is within 1:5
    const r = CheckinGateHelper.evaluate({ groups: { g1: ratioGroup }, current: { g1: cur({ total: 5, volunteers: 0 }) }, incoming: { g1: inc({ total: 1, volunteers: 1 }) }, ratioEnforcement: "block" });
    expect(r.hard).toHaveLength(0);
    expect(r.warnings).toHaveLength(0);
  });

  it("warn mode surfaces a warning instead of a hard block", () => {
    const r = CheckinGateHelper.evaluate({ groups: { g1: ratioGroup }, current: {}, incoming: { g1: inc({ total: 1, nonVolunteers: 1 }) }, ratioEnforcement: "warn" });
    expect(r.hard).toHaveLength(0);
    expect(r.warnings).toEqual([{ groupId: "g1", groupName: "Nursery", reason: "ratio" }]);
  });

  it("does not ratio-gate a volunteer-only check-in", () => {
    const r = CheckinGateHelper.evaluate({ groups: { g1: ratioGroup }, current: {}, incoming: { g1: inc({ total: 1, volunteers: 1 }) }, ratioEnforcement: "block" });
    expect(r.hard).toHaveLength(0);
  });
});

describe("CheckinGateHelper.isServiceTimeOpen", () => {
  // Sunday 9:00 AM service, check-in opens 30 min before and closes 15 min after the 10:15 end.
  const sunday9 = { dayOfWeek: 0, startTime: "09:00", endTime: "10:15", checkinOpenMinutes: 30, checkinCloseMinutes: 15 };
  const tz = "America/Chicago";
  // 2026-10-11 is a Sunday; America/Chicago is UTC-5 in October.
  const at = (local: string) => new Date(local + "-05:00");

  it("is always open when the service time has no schedule", () => {
    expect(CheckinGateHelper.isServiceTimeOpen({}, at("2026-10-14T03:00:00"), tz)).toBe(true);
    expect(CheckinGateHelper.isServiceTimeOpen({ dayOfWeek: 0, startTime: null }, at("2026-10-14T03:00:00"), tz)).toBe(true);
  });

  it("is closed before the open offset and open from it", () => {
    expect(CheckinGateHelper.isServiceTimeOpen(sunday9, at("2026-10-11T08:29:00"), tz)).toBe(false);
    expect(CheckinGateHelper.isServiceTimeOpen(sunday9, at("2026-10-11T08:30:00"), tz)).toBe(true);
  });

  it("stays open until the close offset after the end time", () => {
    expect(CheckinGateHelper.isServiceTimeOpen(sunday9, at("2026-10-11T10:30:00"), tz)).toBe(true);
    expect(CheckinGateHelper.isServiceTimeOpen(sunday9, at("2026-10-11T10:31:00"), tz)).toBe(false);
  });

  it("is closed on other days of the week", () => {
    expect(CheckinGateHelper.isServiceTimeOpen(sunday9, at("2026-10-12T09:00:00"), tz)).toBe(false);
  });

  it("evaluates the window in the church's time zone", () => {
    // 09:00 in Chicago is 10:00 in New York, so the same instant is outside a New York church's window.
    expect(CheckinGateHelper.isServiceTimeOpen(sunday9, at("2026-10-11T10:20:00"), "America/New_York")).toBe(false);
    expect(CheckinGateHelper.isServiceTimeOpen(sunday9, at("2026-10-11T07:45:00"), "America/New_York")).toBe(true);
  });

  it("uses the start time as the end when no end time is set", () => {
    const st = { dayOfWeek: 0, startTime: "09:00", checkinOpenMinutes: 30, checkinCloseMinutes: 15 };
    expect(CheckinGateHelper.isServiceTimeOpen(st, at("2026-10-11T09:15:00"), tz)).toBe(true);
    expect(CheckinGateHelper.isServiceTimeOpen(st, at("2026-10-11T09:16:00"), tz)).toBe(false);
  });

  it("handles a window that crosses midnight and the end of the week", () => {
    // Saturday 11:00 PM service ending 12:30 AM Sunday.
    const late = { dayOfWeek: 6, startTime: "23:00", endTime: "00:30", checkinOpenMinutes: 0, checkinCloseMinutes: 0 };
    expect(CheckinGateHelper.isServiceTimeOpen(late, at("2026-10-10T22:59:00"), tz)).toBe(false);
    expect(CheckinGateHelper.isServiceTimeOpen(late, at("2026-10-10T23:30:00"), tz)).toBe(true);
    expect(CheckinGateHelper.isServiceTimeOpen(late, at("2026-10-11T00:15:00"), tz)).toBe(true);
    expect(CheckinGateHelper.isServiceTimeOpen(late, at("2026-10-11T00:31:00"), tz)).toBe(false);
    // Sunday 12:10 AM service opening 30 minutes earlier, on Saturday night.
    const early = { dayOfWeek: 0, startTime: "00:10", endTime: "01:00", checkinOpenMinutes: 30 };
    expect(CheckinGateHelper.isServiceTimeOpen(early, at("2026-10-10T23:45:00"), tz)).toBe(true);
  });
});
