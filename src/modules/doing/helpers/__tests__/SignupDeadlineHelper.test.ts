jest.mock("../../../../shared/modules/index", () => ({ getMembershipModuleGateway: jest.fn() }));

import { SignupDeadlineHelper } from "../SignupDeadlineHelper.js";

// Issue #1325: the deadline counts back from the first service time, not from midnight UTC.
describe("SignupDeadlineHelper.compute", () => {
  const plan = { id: "p1", serviceDate: new Date("2026-10-25"), signupDeadlineHours: 2 };

  it("counts back from the first service time", () => {
    const times = [
      { startTime: new Date("2026-10-25T17:00:00Z"), serviceTimeType: "service" },
      { startTime: new Date("2026-10-25T15:00:00Z"), serviceTimeType: "service" }
    ];
    expect(SignupDeadlineHelper.compute(plan, times as any)?.toISOString()).toBe("2026-10-25T13:00:00.000Z");
  });

  it("ignores an earlier rehearsal when the plan has a service time", () => {
    const times = [
      { startTime: new Date("2026-10-25T13:00:00Z"), serviceTimeType: "rehearsal" },
      { startTime: new Date("2026-10-25T15:00:00Z"), serviceTimeType: "service" }
    ];
    expect(SignupDeadlineHelper.compute(plan, times as any)?.toISOString()).toBe("2026-10-25T13:00:00.000Z");
  });

  it("falls back to 9:00 on the service date in the church's zone when there are no times", () => {
    expect(SignupDeadlineHelper.compute(plan, [], "America/Chicago")?.toISOString()).toBe("2026-10-25T12:00:00.000Z");
  });

  it("has no deadline when the hours are blank or zero", () => {
    expect(SignupDeadlineHelper.compute({ ...plan, signupDeadlineHours: null }, [])).toBeNull();
    expect(SignupDeadlineHelper.compute({ ...plan, signupDeadlineHours: 0 }, [])).toBeNull();
  });
});
