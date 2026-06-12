export interface Holiday {
  date: string; // YYYY-MM-DD (local)
  name: string;
}

// ponytail: fixed US holiday set — make it per-church configurable if international demand shows up.
export class HolidayHelper {
  public static getHolidays(start: Date, end: Date): Holiday[] {
    const all: Holiday[] = [];
    for (let y = start.getFullYear(); y <= end.getFullYear(); y++) all.push(...this.forYear(y));
    const s = this.toKey(start);
    const e = this.toKey(end);
    return all.filter((h) => h.date >= s && h.date <= e);
  }

  private static forYear(y: number): Holiday[] {
    const easter = this.easter(y);
    const goodFriday = new Date(easter);
    goodFriday.setDate(easter.getDate() - 2);
    return [
      { date: this.key(y, 0, 1), name: "New Year's Day" },
      { date: this.toKey(this.nthWeekday(y, 0, 1, 3)), name: "Martin Luther King Jr. Day" },
      { date: this.toKey(this.nthWeekday(y, 1, 1, 3)), name: "Presidents' Day" },
      { date: this.toKey(goodFriday), name: "Good Friday" },
      { date: this.toKey(easter), name: "Easter Sunday" },
      { date: this.toKey(this.lastWeekday(y, 4, 1)), name: "Memorial Day" },
      { date: this.key(y, 5, 19), name: "Juneteenth" },
      { date: this.key(y, 6, 4), name: "Independence Day" },
      { date: this.toKey(this.nthWeekday(y, 8, 1, 1)), name: "Labor Day" },
      { date: this.toKey(this.nthWeekday(y, 10, 4, 4)), name: "Thanksgiving" },
      { date: this.key(y, 11, 24), name: "Christmas Eve" },
      { date: this.key(y, 11, 25), name: "Christmas Day" },
      { date: this.key(y, 11, 31), name: "New Year's Eve" }
    ];
  }

  private static nthWeekday(year: number, month: number, weekday: number, n: number): Date {
    const first = new Date(year, month, 1);
    const offset = (weekday - first.getDay() + 7) % 7;
    return new Date(year, month, 1 + offset + (n - 1) * 7);
  }

  private static lastWeekday(year: number, month: number, weekday: number): Date {
    const last = new Date(year, month + 1, 0);
    const offset = (last.getDay() - weekday + 7) % 7;
    return new Date(year, month + 1, 0 - offset);
  }

  // Anonymous Gregorian computus.
  private static easter(y: number): Date {
    const a = y % 19;
    const b = Math.floor(y / 100);
    const c = y % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(y, month - 1, day);
  }

  private static key(y: number, m: number, d: number): string {
    return this.toKey(new Date(y, m, d));
  }

  public static toKey(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
}
