import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import { getMembershipModuleGateway } from "../../../shared/modules/index.js";

dayjs.extend(utc);
dayjs.extend(timezone);

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const STALE_HOURS = 6;

export interface RecurringStream {
  id?: string;
  churchId: string;
  serviceTime: Date;
  timezoneOffset: number;
  recurring: boolean;
}

interface RecurringStreamRepo {
  loadAllRecurring(before?: Date): Promise<RecurringStream[]>;
  updateServiceTime(id: string, churchId: string, serviceTime: Date): Promise<void>;
}

// A recurring live stream is stored as the next instant it starts plus the browser's UTC offset
// from when it was saved. Rolling it forward by seven days of UTC keeps the instant's clock time in
// UTC, so each daylight-saving change moved the stream an hour in church time. This rolls it forward
// at the same wall-clock time in the church's zone instead.
export class RecurringStreamHelper {
  // Services older than this are rolled forward (or dropped when not recurring).
  static staleCutoff(now = new Date()): Date {
    return new Date(now.getTime() - STALE_HOURS * 60 * 60 * 1000);
  }

  // Minutes west of UTC for an instant in a zone, the Date.getTimezoneOffset convention.
  static offsetWest(zone: string, at: Date): number {
    return -dayjs(at).tz(zone).utcOffset();
  }

  // The zone to keep the stream's wall-clock time in: the first candidate that actually uses the
  // stored browser offset at some point in the service's year. Most churches had America/New_York
  // backfilled as their zone, so a zone that never produces the saved offset is not trusted.
  static pickZone(candidates: (string | null | undefined)[], storedOffset: number, at: Date): string | undefined {
    const year = at.getUTCFullYear();
    const samples = [new Date(Date.UTC(year, 0, 1)), new Date(Date.UTC(year, 6, 1))];
    for (const zone of candidates) {
      if (!zone) continue;
      try {
        if (samples.some((d) => this.offsetWest(zone, d) === storedOffset)) return zone;
      } catch {
        // not an IANA zone name; skip it
      }
    }
    return undefined;
  }

  // One week later at the same wall-clock time in the zone; plain seven days when no zone is known.
  static addWeek(at: Date, zone?: string): Date {
    const next = new Date(at.getTime() + WEEK_MS);
    if (!zone) return next;
    const drift = this.offsetWest(zone, next) - this.offsetWest(zone, at);
    return new Date(next.getTime() + drift * 60 * 1000);
  }

  // Rolls a recurring stream forward week by week until it is past the cutoff. False when it was not stale.
  static advance(service: RecurringStream, cutoff: Date, zone?: string): boolean {
    if (!(service.serviceTime < cutoff)) return false;
    let next = service.serviceTime;
    while (next < cutoff) next = this.addWeek(next, zone);
    service.serviceTime = next;
    return true;
  }

  // The church's own zone first, then every campus zone.
  static async zoneCandidates(churchId: string): Promise<string[]> {
    const gateway = getMembershipModuleGateway();
    const [church, campusZones] = await Promise.all([gateway.loadChurch(churchId), gateway.loadCampusTimeZones(churchId)]);
    return [church?.timeZone, ...Object.values(campusZones)].filter((z): z is string => !!z);
  }

  // Midnight job: roll every stale recurring stream forward. Returns how many were moved.
  static async advanceStale(repo: RecurringStreamRepo, now = new Date()): Promise<number> {
    const cutoff = this.staleCutoff(now);
    const stale = await repo.loadAllRecurring(cutoff);
    const zonesByChurch: Record<string, string[]> = {};
    let moved = 0;
    for (const s of stale) {
      if (!s.id || !(s.serviceTime < cutoff)) continue;
      zonesByChurch[s.churchId] ??= await this.zoneCandidates(s.churchId);
      if (this.advance(s, cutoff, this.pickZone(zonesByChurch[s.churchId], s.timezoneOffset, s.serviceTime))) {
        await repo.updateServiceTime(s.id, s.churchId, s.serviceTime);
        moved++;
      }
    }
    return moved;
  }
}
