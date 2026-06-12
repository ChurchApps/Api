import { HolidayHelper } from "../HolidayHelper.js";

describe("HolidayHelper.getHolidays", () => {
  it("filters to the window and spans year boundaries", () => {
    const result = HolidayHelper.getHolidays(new Date(2026, 11, 20), new Date(2027, 0, 2));
    const names = result.map((h) => h.name);
    expect(names).toEqual(["Christmas Eve", "Christmas Day", "New Year's Eve", "New Year's Day"]);
    expect(result[3].date).toBe("2027-01-01");
  });

  it("returns nothing for a holiday-free window", () => {
    expect(HolidayHelper.getHolidays(new Date(2026, 7, 1), new Date(2026, 7, 31))).toEqual([]);
  });
});
