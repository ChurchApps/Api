import * as rrulePkg from "rrule";

// rrule ships CJS: under Node ESM only the default export is visible, while
// Jest's CJS transform exposes the named exports. Resolve both shapes.
const RRule = ((rrulePkg as any).RRule ?? (rrulePkg as any).default?.RRule) as typeof rrulePkg.RRule;

export interface OccurrenceSource {
  start: Date | string;
  end: Date | string;
  recurrenceRule?: string;
}

export interface Occurrence {
  start: Date;
  end: Date;
}

// Server-side twin of apphelper's EventHelper.getRange. rrule iterates in UTC,
// so local wall-clock components are mapped into fake-UTC dates for iteration
// and back out afterwards — BYDAY etc. then track the event's local day no
// matter what timezone the server runs in. Occurrence times are forced to the
// event's local time-of-day so they hold steady across DST.
export class RecurrenceHelper {
  public static readonly MAX_OCCURRENCES = 200;

  public static getOccurrences(event: OccurrenceSource, windowStart: Date, windowEnd: Date, max: number = RecurrenceHelper.MAX_OCCURRENCES): Occurrence[] {
    const start = new Date(event.start);
    const end = new Date(event.end);
    const duration = Math.max(end.getTime() - start.getTime(), 0);

    if (!event.recurrenceRule) {
      return start < windowEnd && end > windowStart ? [{ start, end }] : [];
    }

    let rule: rrulePkg.RRule;
    try {
      rule = new RRule({ ...RRule.parseString(event.recurrenceRule), dtstart: this.toFakeUtc(start) });
    } catch {
      return start < windowEnd && end > windowStart ? [{ start, end }] : [];
    }

    const dates = rule.between(this.toFakeUtc(windowStart), this.toFakeUtc(windowEnd), true).slice(0, max);
    return dates.map((d) => {
      const local = this.fromFakeUtc(d);
      local.setHours(start.getHours(), start.getMinutes(), start.getSeconds(), 0);
      return { start: local, end: new Date(local.getTime() + duration) };
    });
  }

  private static toFakeUtc(d: Date): Date {
    return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()));
  }

  private static fromFakeUtc(d: Date): Date {
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds());
  }

  public static overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
    return aStart < bEnd && bStart < aEnd;
  }
}
