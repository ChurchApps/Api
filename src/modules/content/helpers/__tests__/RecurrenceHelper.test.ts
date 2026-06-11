import { RecurrenceHelper } from "../RecurrenceHelper.js";

const d = (iso: string) => new Date(iso);

describe("RecurrenceHelper.getOccurrences", () => {
  it("returns the single occurrence for a non-recurring event inside the window", () => {
    const result = RecurrenceHelper.getOccurrences(
      { start: d("2026-07-01T10:00:00"), end: d("2026-07-01T11:00:00") },
      d("2026-06-01T00:00:00"),
      d("2026-08-01T00:00:00")
    );
    expect(result).toHaveLength(1);
    expect(result[0].start).toEqual(d("2026-07-01T10:00:00"));
    expect(result[0].end).toEqual(d("2026-07-01T11:00:00"));
  });

  it("returns nothing for a non-recurring event outside the window", () => {
    const result = RecurrenceHelper.getOccurrences(
      { start: d("2026-05-01T10:00:00"), end: d("2026-05-01T11:00:00") },
      d("2026-06-01T00:00:00"),
      d("2026-08-01T00:00:00")
    );
    expect(result).toHaveLength(0);
  });

  it("expands a weekly rule and preserves the event's time-of-day and duration", () => {
    const result = RecurrenceHelper.getOccurrences(
      { start: d("2026-07-01T18:30:00"), end: d("2026-07-01T20:00:00"), recurrenceRule: "FREQ=WEEKLY;BYDAY=WE" },
      d("2026-07-01T00:00:00"),
      d("2026-07-31T23:59:59")
    );
    expect(result).toHaveLength(5);
    for (const occ of result) {
      expect(occ.start.getDay()).toBe(3);
      expect(occ.start.getHours()).toBe(18);
      expect(occ.start.getMinutes()).toBe(30);
      expect(occ.end.getTime() - occ.start.getTime()).toBe(90 * 60 * 1000);
    }
  });

  it("honors COUNT in the rule", () => {
    const result = RecurrenceHelper.getOccurrences(
      { start: d("2026-07-01T09:00:00"), end: d("2026-07-01T10:00:00"), recurrenceRule: "FREQ=DAILY;COUNT=3" },
      d("2026-06-01T00:00:00"),
      d("2026-12-31T00:00:00")
    );
    expect(result).toHaveLength(3);
  });

  it("caps the number of expanded occurrences", () => {
    const result = RecurrenceHelper.getOccurrences(
      { start: d("2026-01-01T09:00:00"), end: d("2026-01-01T10:00:00"), recurrenceRule: "FREQ=DAILY" },
      d("2026-01-01T00:00:00"),
      d("2030-01-01T00:00:00"),
      10
    );
    expect(result).toHaveLength(10);
  });

  it("falls back to a single occurrence on an unparseable rule", () => {
    const result = RecurrenceHelper.getOccurrences(
      { start: d("2026-07-01T10:00:00"), end: d("2026-07-01T11:00:00"), recurrenceRule: "NOT A RULE" },
      d("2026-06-01T00:00:00"),
      d("2026-08-01T00:00:00")
    );
    expect(result).toHaveLength(1);
  });
});

describe("RecurrenceHelper.overlaps", () => {
  it("detects overlapping and non-overlapping intervals (end exclusive)", () => {
    expect(RecurrenceHelper.overlaps(d("2026-07-01T10:00:00"), d("2026-07-01T11:00:00"), d("2026-07-01T10:30:00"), d("2026-07-01T11:30:00"))).toBe(true);
    expect(RecurrenceHelper.overlaps(d("2026-07-01T10:00:00"), d("2026-07-01T11:00:00"), d("2026-07-01T11:00:00"), d("2026-07-01T12:00:00"))).toBe(false);
    expect(RecurrenceHelper.overlaps(d("2026-07-01T10:00:00"), d("2026-07-01T11:00:00"), d("2026-07-02T10:00:00"), d("2026-07-02T11:00:00"))).toBe(false);
  });
});
