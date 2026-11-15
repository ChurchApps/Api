import { RecurrenceHelper } from "../RecurrenceHelper.js";

const d = (iso: string) => new Date(iso);
const event = (recurrenceRule: string) => ({ start: d("2026-07-01T10:00:00"), end: d("2026-07-01T10:30:00"), recurrenceRule });

// Calendars and screen schedules only offer daily, weekly, monthly and yearly repeats. A stored sub-daily rule
// would make every calendar or screen manifest read walk minutes or seconds, so it counts as the single event.
describe("content RecurrenceHelper sub-daily rules", () => {
  const Helper = RecurrenceHelper;
  it.each(["FREQ=HOURLY", "FREQ=MINUTELY", "FREQ=SECONDLY", "FREQ=minutely;INTERVAL=1"])("treats %s as the single event", (rule) => {
    const result = Helper.getOccurrences(event(rule), d("2026-06-01T00:00:00"), d("2026-08-01T00:00:00"));
    expect(result).toEqual([{ start: d("2026-07-01T10:00:00"), end: d("2026-07-01T10:30:00") }]);
  });

  it("still expands a daily rule up to the cap", () => {
    const result = Helper.getOccurrences(event("FREQ=DAILY"), d("2026-06-01T00:00:00"), d("2027-08-01T00:00:00"), 50);
    expect(result).toHaveLength(50);
    expect(result[1].start).toEqual(d("2026-07-02T10:00:00"));
  });
});
