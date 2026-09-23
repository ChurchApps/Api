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
