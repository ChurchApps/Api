const loadChurch = jest.fn().mockResolvedValue({ id: "CHU1", timeZone: "America/Los_Angeles" });
const loadLapsedRegularGiverIds = jest.fn().mockResolvedValue(["PER1"]);
jest.mock("../../../../shared/modules/index.js", () => ({
  getMembershipModuleGateway: () => ({ loadChurch }),
  getGivingModuleGateway: () => ({ loadLapsedRegularGiverIds })
}));

import { ConditionHelper } from "../ConditionHelper.js";

describe("ConditionHelper giving conditions", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-10-27T05:00:00Z"));
  });
  afterEach(() => jest.useRealTimers());

  it("asks the giving module for lapsed regular givers as of the church's today", async () => {
    const condition: any = { churchId: "CHU1", field: "giving", operator: "lapsed", fieldData: JSON.stringify({ regularWeeks: 10, minWeeks: 4, lapsedWeeks: 2 }) };
    const [result] = await ConditionHelper.getPeopleIdsMatchingConditions([condition]);
    expect(loadLapsedRegularGiverIds).toHaveBeenCalledWith("CHU1", "2026-10-26", { regularWeeks: 10, minWeeks: 4, lapsedWeeks: 2 });
    expect(result.matchingIds).toEqual(["PER1"]);
  });
});
