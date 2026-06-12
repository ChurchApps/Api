import { IcsHelper } from "../IcsHelper.js";

const wrap = (vevents: string) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Test//EN\r\n${vevents}END:VCALENDAR\r\n`;

describe("IcsHelper.parseEvents", () => {
  it("parses a basic timed event", () => {
    const ics = wrap("BEGIN:VEVENT\r\nDTSTART:20260710T180000\r\nDTEND:20260710T200000\r\nSUMMARY:Youth Night\r\nDESCRIPTION:Pizza and games\r\nEND:VEVENT\r\n");
    const result = IcsHelper.parseEvents(ics);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Youth Night");
    expect(result[0].description).toBe("Pizza and games");
    expect(result[0].start).toEqual(new Date(2026, 6, 10, 18, 0, 0));
    expect(result[0].end).toEqual(new Date(2026, 6, 10, 20, 0, 0));
    expect(result[0].allDay).toBeFalsy();
  });

  it("parses UTC timestamps", () => {
    const ics = wrap("BEGIN:VEVENT\r\nDTSTART:20260710T180000Z\r\nDTEND:20260710T200000Z\r\nSUMMARY:UTC Event\r\nEND:VEVENT\r\n");
    const result = IcsHelper.parseEvents(ics);
    expect(result[0].start.getTime()).toBe(Date.UTC(2026, 6, 10, 18, 0, 0));
  });

  it("parses all-day events and defaults the end to the next day", () => {
    const ics = wrap("BEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20260704\r\nSUMMARY:Independence Day\r\nEND:VEVENT\r\n");
    const result = IcsHelper.parseEvents(ics);
    expect(result[0].allDay).toBe(true);
    expect(result[0].start).toEqual(new Date(2026, 6, 4));
    expect(result[0].end).toEqual(new Date(2026, 6, 5));
  });

  it("passes the RRULE through verbatim", () => {
    const ics = wrap("BEGIN:VEVENT\r\nDTSTART:20260710T180000\r\nDTEND:20260710T190000\r\nRRULE:FREQ=WEEKLY;BYDAY=FR;COUNT=10\r\nSUMMARY:Weekly\r\nEND:VEVENT\r\n");
    expect(IcsHelper.parseEvents(ics)[0].recurrenceRule).toBe("FREQ=WEEKLY;BYDAY=FR;COUNT=10");
  });

  it("parses multiple events and skips ones without DTSTART", () => {
    const ics = wrap(
      "BEGIN:VEVENT\r\nDTSTART:20260710T180000\r\nSUMMARY:One\r\nEND:VEVENT\r\n" +
        "BEGIN:VEVENT\r\nSUMMARY:No start\r\nEND:VEVENT\r\n" +
        "BEGIN:VEVENT\r\nDTSTART:20260711T180000\r\nSUMMARY:Two\r\nEND:VEVENT\r\n"
    );
    const result = IcsHelper.parseEvents(ics);
    expect(result.map((e) => e.title)).toEqual(["One", "Two"]);
  });

  it("unfolds continuation lines and unescapes text", () => {
    const ics = wrap("BEGIN:VEVENT\r\nDTSTART:20260710T180000\r\nSUMMARY:Long titl\r\n e here\r\nDESCRIPTION:Line one\\nLine two\\, with comma\r\nEND:VEVENT\r\n");
    const result = IcsHelper.parseEvents(ics);
    expect(result[0].title).toBe("Long title here");
    expect(result[0].description).toBe("Line one\nLine two, with comma");
  });

  it("uses DURATION when DTEND is missing", () => {
    const ics = wrap("BEGIN:VEVENT\r\nDTSTART:20260710T180000\r\nDURATION:PT1H30M\r\nSUMMARY:Duration Event\r\nEND:VEVENT\r\n");
    const result = IcsHelper.parseEvents(ics);
    expect(result[0].end.getTime() - result[0].start.getTime()).toBe(90 * 60 * 1000);
  });

  it("defaults a timed event without DTEND or DURATION to one hour", () => {
    const ics = wrap("BEGIN:VEVENT\r\nDTSTART:20260710T180000\r\nSUMMARY:No End\r\nEND:VEVENT\r\n");
    const result = IcsHelper.parseEvents(ics);
    expect(result[0].end.getTime() - result[0].start.getTime()).toBe(60 * 60 * 1000);
  });

  it("returns an empty array for non-ics text", () => {
    expect(IcsHelper.parseEvents("hello world")).toHaveLength(0);
  });
});
