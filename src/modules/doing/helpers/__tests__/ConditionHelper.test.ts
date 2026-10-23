jest.mock("../../../../shared/modules/index.js", () => ({ getMembershipModuleGateway: () => ({}) }));

import { ConditionHelper } from "../ConditionHelper.js";

const today = { iso: "2026-09-23", dayOfMonth: 23, dayOfWeek: 4, month: 9 };
const cond = (operator: string, value: string, datePart?: string) => ({ field: "today", operator, value, fieldData: datePart ? JSON.stringify({ datePart }) : undefined }) as any;

describe("ConditionHelper today conditions", () => {
  it("matches a date equal to the church's today", () => {
    expect(ConditionHelper.evalSimpleCondition(cond("=", "2026-09-23"), today)).toBe(true);
    expect(ConditionHelper.evalSimpleCondition(cond("=", "2026-09-24"), today)).toBe(false);
    expect(ConditionHelper.evalSimpleCondition(cond("<", "2026-09-24"), today)).toBe(true);
  });

  it("uses the church-local day parts", () => {
    expect(ConditionHelper.evalSimpleCondition(cond("=", "23", "dayOfMonth"), today)).toBe(true);
    expect(ConditionHelper.evalSimpleCondition(cond("=", "4", "dayOfWeek"), today)).toBe(true);
    expect(ConditionHelper.evalSimpleCondition(cond("=", "9", "month"), today)).toBe(true);
  });
});

describe("ConditionHelper relative date values", () => {
  const oct = { iso: "2026-10-22", dayOfMonth: 22, dayOfWeek: 5, month: 10 };
  const jan = { iso: "2026-01-05", dayOfMonth: 5, dayOfWeek: 2, month: 1 };
  const dec = { iso: "2026-12-31", dayOfMonth: 31, dayOfWeek: 5, month: 12 };

  it("resolves today's day and month from the church's date", () => {
    expect(ConditionHelper.resolveRelativeValue("{currentDay}", oct)).toBe("22");
    expect(ConditionHelper.resolveRelativeValue("{currentMonth}", oct)).toBe("10");
  });

  it("treats {previousMonth} the same as {prevMonth} and wraps the year", () => {
    expect(ConditionHelper.resolveRelativeValue("{previousMonth}", jan)).toBe("12");
    expect(ConditionHelper.resolveRelativeValue("{prevMonth}", jan)).toBe("12");
    expect(ConditionHelper.resolveRelativeValue("{previousMonth}", oct)).toBe("9");
    expect(ConditionHelper.resolveRelativeValue("{nextMonth}", dec)).toBe("1");
  });

  it("leaves plain values alone", () => {
    expect(ConditionHelper.resolveRelativeValue("15", oct)).toBe("15");
    expect(ConditionHelper.resolveRelativeValue(undefined, oct)).toBeUndefined();
  });
});
