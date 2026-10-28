import crypto from "crypto";
import { ScheduleEntry } from "../models/index.js";
import { RecurrenceHelper } from "./RecurrenceHelper.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ScheduledOccurrence {
  entry: ScheduleEntry;
  start: Date;
  end: Date;
}

export interface TimelineSegment {
  id: string;
  entry: ScheduleEntry;
  start: Date;
  end: Date;
}

// Entry start/end are church wall-clock times. RecurrenceHelper works on server-local Date fields, so the
// window is mapped into that frame ("wall clock") and each occurrence is mapped back to a real instant.
export class ScreenScheduleHelper {
  static readonly WINDOW_DAYS = 7;

  // "Play once, then hold the last slide" is retired. A saved holdLast row plays as teacher paced.
  static playbackEndBehavior(endBehavior?: string | null): "loop" | "fallback" | "teacherPaced" {
    if (endBehavior === "holdLast" || endBehavior === "teacherPaced") return "teacherPaced";
    if (endBehavior === "fallback") return "fallback";
    return "loop";
  }

  static validTimeZone(timeZone?: string): string {
    if (!timeZone) return "America/New_York";
    try {
      new Intl.DateTimeFormat("en-US", { timeZone });
      return timeZone;
    } catch {
      return "America/New_York";
    }
  }

  private static zoneFields(instant: number, timeZone: string) {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(instant));
    const get = (type: string) => parseInt(parts.find((p) => p.type === type)?.value || "0", 10);
    return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute"), second: get("second") };
  }

  private static zoneOffsetMs(instant: number, timeZone: string): number {
    const f = this.zoneFields(instant, timeZone);
    return Date.UTC(f.year, f.month - 1, f.day, f.hour, f.minute, f.second) - Math.floor(instant / 1000) * 1000;
  }

  static toWallClock(instant: Date, timeZone: string): Date {
    const f = this.zoneFields(instant.getTime(), timeZone);
    return new Date(f.year, f.month - 1, f.day, f.hour, f.minute, f.second);
  }

  static fromWallClock(wall: Date, timeZone: string): Date {
    const wallUtc = Date.UTC(wall.getFullYear(), wall.getMonth(), wall.getDate(), wall.getHours(), wall.getMinutes(), wall.getSeconds());
    const offset = this.zoneOffsetMs(wallUtc, timeZone);
    return new Date(wallUtc - this.zoneOffsetMs(wallUtc - offset, timeZone));
  }

  static expand(entries: ScheduleEntry[], now: Date, timeZone: string, days = ScreenScheduleHelper.WINDOW_DAYS): ScheduledOccurrence[] {
    const wallStart = this.toWallClock(now, timeZone);
    const wallEnd = this.toWallClock(new Date(now.getTime() + days * DAY_MS), timeZone);
    const result: ScheduledOccurrence[] = [];
    for (const entry of entries) {
      if (entry.enabled === false || !entry.start || !entry.end) continue;
      const duration = Math.max(new Date(entry.end).getTime() - new Date(entry.start).getTime(), 0);
      const occurrences = RecurrenceHelper.getOccurrences({ start: entry.start, end: entry.end, recurrenceRule: entry.recurrenceRule, exceptionDates: entry.exceptionDates }, new Date(wallStart.getTime() - duration), wallEnd);
      for (const o of occurrences) {
        const start = this.fromWallClock(o.start, timeZone);
        const end = this.fromWallClock(o.end, timeZone);
        if (end > now) result.push({ entry, start, end });
      }
    }
    return result;
  }

  // Overlaps resolve to one timeline: whichever active occurrence started latest wins; when it ends, the earlier one resumes.
  static buildTimeline(occurrences: ScheduledOccurrence[]): TimelineSegment[] {
    const bounds = Array.from(new Set(occurrences.flatMap((o) => [o.start.getTime(), o.end.getTime()]))).sort((a, b) => a - b);
    const segments: TimelineSegment[] = [];
    let lastWinner: ScheduledOccurrence = null;
    for (let i = 0; i < bounds.length - 1; i++) {
      const from = bounds[i];
      const to = bounds[i + 1];
      let winner: ScheduledOccurrence = null;
      for (const o of occurrences) {
        if (o.start.getTime() <= from && o.end.getTime() >= to && (!winner || o.start.getTime() >= winner.start.getTime())) winner = o;
      }
      if (winner && winner === lastWinner) segments[segments.length - 1].end = new Date(to);
      else if (winner) segments.push({ id: `${winner.entry.id}-${from}`, entry: winner.entry, start: new Date(from), end: new Date(to) });
      lastWinner = winner;
    }
    return segments;
  }

  static segmentAt(segments: TimelineSegment[], at: Date): TimelineSegment | null {
    return segments.find((s) => s.start <= at && s.end > at) || null;
  }

  static cacheKey(providerId: string | undefined, fileId: string | undefined, url: string | undefined): string {
    return crypto.createHash("sha1").update(`${providerId || ""}${fileId || ""}${(url || "").split("?")[0]}`).digest("hex");
  }

  static resolveType(providerId?: string): "url" | "lan" {
    return providerId === "freeshow" ? "lan" : "url";
  }

  static mediaTypeFromUrl(url: string): "video" | "image" | "audio" {
    // Extensionless video links: lessons.church external videos and Mux streams (same rule as FreePlay's manual player).
    if (/\/externalVideos\//i.test(url || "") || /^https?:\/\/stream\.mux\.com\//i.test(url || "")) return "video";
    const ext = (url || "").split("?")[0].split(".").pop()?.toLowerCase() || "";
    if (["mp4", "m4v", "mov", "webm", "mkv", "m3u8"].includes(ext)) return "video";
    if (["mp3", "m4a", "wav", "aac", "ogg"].includes(ext)) return "audio";
    return "image";
  }
}
