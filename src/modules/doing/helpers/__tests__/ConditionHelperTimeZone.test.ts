const loadIdsMatchingCondition = jest.fn().mockResolvedValue(["PER1"]);
const loadChurch = jest.fn().mockResolvedValue({ id: "CHU1", timeZone: "America/Los_Angeles" });
jest.mock("../../../../shared/modules/index.js", () => ({ getMembershipModuleGateway: () => ({ loadIdsMatchingCondition, loadChurch }) }));

import { ConditionHelper } from "../ConditionHelper.js";

describe("ConditionHelper person-date conditions use the church's today", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    // The scheduler runs at 05:00 UTC, which is still Oct 22 in Los Angeles.
    jest.setSystemTime(new Date("2026-10-23T05:00:00Z"));
  });
  afterEach(() => jest.useRealTimers());

  it("resolves Birth Date day of month = Today to the church-local day without changing the stored condition", async () => {
    const condition: any = { churchId: "CHU1", field: "birthDate", operator: "=", value: "{currentDay}", fieldData: JSON.stringify({ datePart: "dayOfMonth" }) };
    const [result] = await ConditionHelper.getPeopleIdsMatchingConditions([condition]);
    expect(loadIdsMatchingCondition).toHaveBeenCalledWith(expect.objectContaining({ field: "birthDate", value: "22" }));
    expect(result.matchingIds).toEqual(["PER1"]);
    expect(condition.value).toBe("{currentDay}");
  });
});
