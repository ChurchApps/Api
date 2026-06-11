export interface ParsedIcsEvent {
  title?: string;
  description?: string;
  start?: Date;
  end?: Date;
  allDay?: boolean;
  recurrenceRule?: string;
}

// Minimal iCalendar (RFC 5545) VEVENT parser for .ics import. Handles line
// unfolding, DATE vs DATE-TIME values (UTC "Z" and floating/TZID times — the
// latter treated as server-local), DURATION fallback, RRULE passthrough and
// text unescaping. Deliberately not a full spec implementation.
export class IcsHelper {
  public static parseEvents(icsText: string): ParsedIcsEvent[] {
    const lines = this.unfoldLines(icsText);
    const result: ParsedIcsEvent[] = [];
    let current: Record<string, { params: string; value: string }> | null = null;

    for (const line of lines) {
      if (line === "BEGIN:VEVENT") {
        current = {};
        continue;
      }
      if (line === "END:VEVENT") {
        if (current) {
          const ev = this.buildEvent(current);
          if (ev.start) result.push(ev);
        }
        current = null;
        continue;
      }
      if (!current) continue;
      const colon = line.indexOf(":");
      if (colon === -1) continue;
      const nameAndParams = line.substring(0, colon);
      const semi = nameAndParams.indexOf(";");
      const name = (semi === -1 ? nameAndParams : nameAndParams.substring(0, semi)).toUpperCase();
      const params = semi === -1 ? "" : nameAndParams.substring(semi + 1).toUpperCase();
      current[name] = { params, value: line.substring(colon + 1) };
    }
    return result;
  }

  private static unfoldLines(icsText: string): string[] {
    const raw = icsText.split(/\r?\n/);
    const result: string[] = [];
    for (const line of raw) {
      if ((line.startsWith(" ") || line.startsWith("\t")) && result.length > 0) result[result.length - 1] += line.substring(1);
      else result.push(line);
    }
    return result.map((l) => l.trim()).filter((l) => l.length > 0);
  }

  private static buildEvent(props: Record<string, { params: string; value: string }>): ParsedIcsEvent {
    const ev: ParsedIcsEvent = {};
    const dtStart = props["DTSTART"];
    if (dtStart) {
      ev.allDay = dtStart.params.includes("VALUE=DATE") || /^\d{8}$/.test(dtStart.value);
      ev.start = this.parseDate(dtStart.value);
    }
    const dtEnd = props["DTEND"];
    if (dtEnd) ev.end = this.parseDate(dtEnd.value);
    else if (props["DURATION"] && ev.start) ev.end = new Date(ev.start.getTime() + this.parseDuration(props["DURATION"].value));
    else if (ev.start) ev.end = new Date(ev.start.getTime() + (ev.allDay ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000));

    if (props["SUMMARY"]) ev.title = this.unescapeText(props["SUMMARY"].value);
    if (props["DESCRIPTION"]) ev.description = this.unescapeText(props["DESCRIPTION"].value);
    if (props["RRULE"]) ev.recurrenceRule = props["RRULE"].value;
    return ev;
  }

  private static parseDate(value: string): Date | undefined {
    const dateOnly = value.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (dateOnly) return new Date(parseInt(dateOnly[1], 10), parseInt(dateOnly[2], 10) - 1, parseInt(dateOnly[3], 10));
    const dateTime = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
    if (!dateTime) return undefined;
    const parts = dateTime.slice(1, 7).map((p) => parseInt(p, 10));
    if (dateTime[7] === "Z") return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], parts[3], parts[4], parts[5]));
    return new Date(parts[0], parts[1] - 1, parts[2], parts[3], parts[4], parts[5]);
  }

  private static parseDuration(value: string): number {
    const match = value.match(/^-?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
    if (!match) return 60 * 60 * 1000;
    const num = (idx: number) => parseInt(match[idx] || "0", 10);
    return (num(1) * 7 * 24 * 3600 + num(2) * 24 * 3600 + num(3) * 3600 + num(4) * 60 + num(5)) * 1000;
  }

  private static unescapeText(value: string): string {
    return value.replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");
  }
}
