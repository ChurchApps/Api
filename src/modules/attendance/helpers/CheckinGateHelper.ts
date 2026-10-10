import { DateHelper } from "../../../shared/helpers/DateHelper.js";

export interface GateGroup {
  id: string;
  name: string;
  capacity?: number;
  guestCapacity?: number;
  checkinClosed: boolean;
  volunteerRatio?: number;
  minVolunteers?: number;
}

export interface GateCount {
  total: number;
  volunteers: number;
  guests: number;
}

export interface GateIncoming {
  total: number;
  volunteers: number;
  guests: number;
  nonVolunteers: number;
}

interface GateViolation {
  groupId: string;
  groupName: string;
  reason: "capacity" | "ratio" | "notOpen";
}

export interface GateResult {
  hard: GateViolation[];
  warnings: GateViolation[];
}

export interface GateServiceTime {
  dayOfWeek?: number | null;
  startTime?: string | null;
  endTime?: string | null;
  checkinOpenMinutes?: number | null;
  checkinCloseMinutes?: number | null;
}

const MINUTES_PER_DAY = 24 * 60;
const MINUTES_PER_WEEK = 7 * MINUTES_PER_DAY;

export class CheckinGateHelper {
  // True when check-in is allowed for this service time right now. A service time with no
  // day/start time is never time-gated. The window runs from checkinOpenMinutes before the
  // start to checkinCloseMinutes after the end (or the start when no end is set), in church time.
  static isServiceTimeOpen(serviceTime: GateServiceTime, now: Date, timeZone?: string): boolean {
    if (!this.hasSchedule(serviceTime)) return true;
    const start = this.parseTime(serviceTime.startTime);
    const day = serviceTime.dayOfWeek;
    let end = this.parseTime(serviceTime.endTime) ?? start;
    if (end < start) end += MINUTES_PER_DAY; // ends after midnight

    const local = DateHelper.toChurchTime(now, timeZone); // "YYYY-MM-DD HH:mm:ss"
    const [y, m, d] = local.substring(0, 10).split("-").map(Number);
    const nowDay = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    const nowMinute = nowDay * MINUTES_PER_DAY + Number(local.substring(11, 13)) * 60 + Number(local.substring(14, 16));

    const windowStart = day * MINUTES_PER_DAY + start - Math.max(0, serviceTime.checkinOpenMinutes ?? 0);
    const windowEnd = day * MINUTES_PER_DAY + end + Math.max(0, serviceTime.checkinCloseMinutes ?? 0);
    // The window may spill into the previous or next week (e.g. Saturday night into Sunday).
    return [nowMinute - MINUTES_PER_WEEK, nowMinute, nowMinute + MINUTES_PER_WEEK].some((t) => t >= windowStart && t <= windowEnd);
  }

  static hasSchedule(serviceTime: GateServiceTime): boolean {
    const day = serviceTime.dayOfWeek;
    return day !== null && day !== undefined && day >= 0 && day <= 6 && this.parseTime(serviceTime.startTime) !== null;
  }

  private static parseTime(value?: string | null): number | null {
    const match = typeof value === "string" ? value.match(/^(\d{1,2}):(\d{2})/) : null;
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
  }

  static evaluate(params: {
    groups: Record<string, GateGroup>;
    current: Record<string, GateCount>;
    incoming: Record<string, GateIncoming>;
    ratioEnforcement: "block" | "warn";
  }): GateResult {
    const { groups, current, incoming, ratioEnforcement } = params;
    const hard: GateViolation[] = [];
    const warnings: GateViolation[] = [];

    for (const groupId of Object.keys(incoming)) {
      const g = groups[groupId];
      if (!g) continue; // no config for this group => no gate
      const cur = current[groupId] ?? { total: 0, volunteers: 0, guests: 0 };
      const inc = incoming[groupId];

      let capacityViolated = false;
      if (g.checkinClosed) capacityViolated = true;
      else if (g.capacity != null && cur.total + inc.total > g.capacity) capacityViolated = true;
      else if (g.guestCapacity != null && cur.guests + inc.guests > g.guestCapacity) capacityViolated = true;

      if (capacityViolated) {
        hard.push({ groupId, groupName: g.name, reason: "capacity" });
        continue; // one violation per group is enough to reject the batch
      }

      if (inc.nonVolunteers > 0) {
        const volunteers = cur.volunteers + inc.volunteers;
        const children = cur.total - cur.volunteers + inc.nonVolunteers;
        let ratioViolated = false;
        if (g.minVolunteers != null && g.minVolunteers > 0 && volunteers < g.minVolunteers) {
          ratioViolated = true;
        } else if (g.volunteerRatio != null && g.volunteerRatio > 0) {
          if (volunteers === 0) ratioViolated = true;
          else if (children > volunteers * g.volunteerRatio) ratioViolated = true;
        }
        if (ratioViolated) {
          const v: GateViolation = { groupId, groupName: g.name, reason: "ratio" };
          if (ratioEnforcement === "block") hard.push(v);
          else warnings.push(v);
        }
      }
    }

    return { hard, warnings };
  }
}
