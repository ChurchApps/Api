import { TimezoneHelper } from "../TimezoneHelper.js";

describe("TimezoneHelper.computeFireAt", () => {
  it("computes 9am local as UTC across DST (per-occurrence offset)", () => {
    // New York: EDT (UTC-4) in summer, EST (UTC-5) in winter.
    expect(TimezoneHelper.computeFireAt("2026-07-15", "09:00:00", 0, "America/New_York").toISOString()).toBe("2026-07-15T13:00:00.000Z");
    expect(TimezoneHelper.computeFireAt("2026-01-15", "09:00:00", 0, "America/New_York").toISOString()).toBe("2026-01-15T14:00:00.000Z");
  });

  it("treats UTC tz as identity", () => {
    expect(TimezoneHelper.computeFireAt("2026-06-30", "09:00:00", 0, "UTC").toISOString()).toBe("2026-06-30T09:00:00.000Z");
  });

  it("'1 day before at 9am' lands at true 9am-local the prior day", () => {
    // 1440 min before the 2026-07-15 occurrence => 9am EDT on 2026-07-14 => 13:00 UTC.
    expect(TimezoneHelper.computeFireAt("2026-07-15", "09:00:00", 1440, "America/New_York").toISOString()).toBe("2026-07-14T13:00:00.000Z");
  });

  it("handles Central time", () => {
    // Chicago CDT (UTC-5) in summer: 9am => 14:00 UTC.
    expect(TimezoneHelper.computeFireAt("2026-07-15", "09:00:00", 0, "America/Chicago").toISOString()).toBe("2026-07-15T14:00:00.000Z");
  });

  it("60-minute offset subtracts an hour", () => {
    expect(TimezoneHelper.computeFireAt("2026-06-30", "09:00:00", 60, "UTC").toISOString()).toBe("2026-06-30T08:00:00.000Z");
  });
});
