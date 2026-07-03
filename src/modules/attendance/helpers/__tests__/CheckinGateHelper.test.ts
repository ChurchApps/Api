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
