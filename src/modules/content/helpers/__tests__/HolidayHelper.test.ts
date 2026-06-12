import { HolidayHelper } from "../HolidayHelper.js";

const datesOf = (year: number) => {
  const map: { [name: string]: string } = {};
  HolidayHelper.forYear(year).forEach((h) => (map[h.name] = h.date));
  return map;
};

describe("HolidayHelper.forYear", () => {
  it("computes fixed and floating 2026 holidays", () => {
    const h = datesOf(2026);
    expect(h["New Year's Day"]).toBe("2026-01-01");
    expect(h["Martin Luther King Jr. Day"]).toBe("2026-01-19");
    expect(h["Presidents' Day"]).toBe("2026-02-16");
    expect(h["Good Friday"]).toBe("2026-04-03");
    expect(h["Easter Sunday"]).toBe("2026-04-05");
    expect(h["Memorial Day"]).toBe("2026-05-25");
    expect(h["Juneteenth"]).toBe("2026-06-19");
    expect(h["Independence Day"]).toBe("2026-07-04");
    expect(h["Labor Day"]).toBe("2026-09-07");
    expect(h["Thanksgiving"]).toBe("2026-11-26");
    expect(h["Christmas Day"]).toBe("2026-12-25");
  });

  it("computes Easter across years", () => {
    expect(datesOf(2025)["Easter Sunday"]).toBe("2025-04-20");
    expect(datesOf(2027)["Easter Sunday"]).toBe("2027-03-28");
  });

  it("handles a December last-Monday edge (Memorial Day 2027)", () => {
    expect(datesOf(2027)["Memorial Day"]).toBe("2027-05-31");
  });
});

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
