import { CalendarBlockout, Resource, Room } from "../models/index.js";
import { Occurrence, RecurrenceHelper } from "./RecurrenceHelper.js";

export interface ProposedBooking {
  eventId?: string;
  start: Date | string;
  end: Date | string;
  recurrenceRule?: string;
  // Per-occurrence padding applied before/after each event occurrence (recurrence-aware).
  setupMinutes?: number;
  teardownMinutes?: number;
  // Absolute startTime/endTime overrides setup/teardown offsets.
  startTime?: Date | string;
  endTime?: Date | string;
  roomIds: string[];
  resources: { resourceId: string; quantity: number }[];
}

interface WindowSource {
  start?: Date | string;
  end?: Date | string;
  recurrenceRule?: string;
  eventStart?: Date | string;
  eventEnd?: Date | string;
  eventRecurrenceRule?: string;
  setupMinutes?: number;
  teardownMinutes?: number;
  startTime?: Date | string;
  endTime?: Date | string;
}

interface BookingWithEvent {
  id?: string;
  eventId?: string;
  roomId?: string;
  resourceId?: string;
  quantity?: number;
  setupMinutes?: number;
  teardownMinutes?: number;
  startTime?: Date | string;
  endTime?: Date | string;
  eventTitle?: string;
  eventStart?: Date | string;
  eventEnd?: Date | string;
  eventRecurrenceRule?: string;
}

export interface ConflictContext {
  windowStart: Date;
  windowEnd: Date;
  roomBookings: BookingWithEvent[];
  resourceBookings: BookingWithEvent[];
  rooms: Room[];
  resources: Resource[];
  blockouts: CalendarBlockout[];
  timeZone?: string;
}

export interface Conflict {
  type: "room" | "resource" | "blockout";
  roomId?: string;
  resourceId?: string;
  blockoutId?: string;
  conflictingEventId?: string;
  conflictingEventTitle?: string;
  date: Date;
  message: string;
}

export class ConflictHelper {
  public static findConflicts(proposed: ProposedBooking, ctx: ConflictContext): Conflict[] {
    const occurrences = this.windowsFor(proposed, ctx);
    if (occurrences.length === 0) return [];
    const result: Conflict[] = [];
    result.push(...this.findRoomConflicts(proposed, occurrences, ctx));
    result.push(...this.findResourceConflicts(proposed, occurrences, ctx));
    result.push(...this.findBlockoutConflicts(proposed, occurrences, ctx));
    return result;
  }

  private static formatDate(d: Date, ctx: ConflictContext): string {
    return d.toLocaleString("en-US", { timeZone: ctx.timeZone || "America/New_York" });
  }

  private static findRoomConflicts(proposed: ProposedBooking, occurrences: Occurrence[], ctx: ConflictContext): Conflict[] {
    const result: Conflict[] = [];
    for (const roomId of proposed.roomIds || []) {
      const roomName = ctx.rooms.find((r) => r.id === roomId)?.name || "Room";
      const seenEvents = new Set<string>();
      for (const booking of ctx.roomBookings) {
        if (booking.roomId !== roomId) continue;
        if (proposed.eventId && booking.eventId === proposed.eventId) continue;
        if (seenEvents.has(booking.eventId)) continue;
        const overlap = this.firstOverlap(booking, occurrences, ctx);

        if (overlap) {
          seenEvents.add(booking.eventId);
          result.push({
            type: "room",
            roomId,
            conflictingEventId: booking.eventId,
            conflictingEventTitle: booking.eventTitle,
            date: overlap.start,
            message: `${roomName} is already booked by "${booking.eventTitle}" from ${this.formatDate(overlap.start, ctx)} to ${this.formatDate(overlap.end, ctx)}`
          });
        }
      }
    }
    return result;
  }

  private static findResourceConflicts(proposed: ProposedBooking, occurrences: Occurrence[], ctx: ConflictContext): Conflict[] {
    const result: Conflict[] = [];
    for (const req of proposed.resources || []) {
      const resource = ctx.resources.find((r) => r.id === req.resourceId);
      const total = resource?.quantity ?? 1;
      const requested = req.quantity || 1;
      for (const occ of occurrences) {
        let booked = 0;
        for (const booking of ctx.resourceBookings) {
          if (booking.resourceId !== req.resourceId) continue;
          if (proposed.eventId && booking.eventId === proposed.eventId) continue;
          const otherOccurrences = this.windowsFor(booking, ctx);
          if (otherOccurrences.some((o) => RecurrenceHelper.overlaps(occ.start, occ.end, o.start, o.end))) booked += booking.quantity || 1;
        }
        if (requested + booked > total) {
          result.push({
            type: "resource",
            resourceId: req.resourceId,
            date: occ.start,
            message: `Only ${Math.max(total - booked, 0)} of ${total} "${resource?.name || "resource"}" available from ${this.formatDate(occ.start, ctx)} to ${this.formatDate(occ.end, ctx)} (${requested} requested)`
          });
          break;
        }
      }
    }
    return result;
  }

  private static findBlockoutConflicts(proposed: ProposedBooking, occurrences: Occurrence[], ctx: ConflictContext): Conflict[] {
    const result: Conflict[] = [];
    const resourceIds = (proposed.resources || []).map((r) => r.resourceId);
    for (const blockout of ctx.blockouts) {
      const churchWide = !blockout.roomId && !blockout.resourceId;
      const applies = churchWide || (blockout.roomId && (proposed.roomIds || []).includes(blockout.roomId)) || (blockout.resourceId && resourceIds.includes(blockout.resourceId));
      if (!applies) continue;
      const blockStart = new Date(blockout.startTime);
      const blockEnd = new Date(blockout.endTime);
      const hit = occurrences.find((o) => RecurrenceHelper.overlaps(o.start, o.end, blockStart, blockEnd));
      if (hit) {
        const target = blockout.roomId ? ctx.rooms.find((r) => r.id === blockout.roomId)?.name : blockout.resourceId ? ctx.resources.find((r) => r.id === blockout.resourceId)?.name : "All rooms and resources";
        result.push({
          type: "blockout",
          roomId: blockout.roomId,
          resourceId: blockout.resourceId,
          blockoutId: blockout.id,
          date: hit.start,
          message: `${target || "Facility"} blocked out${blockout.reason ? " (" + blockout.reason + ")" : ""} from ${this.formatDate(blockStart, ctx)} to ${this.formatDate(blockEnd, ctx)}`
        });
      }
    }
    return result;
  }

  private static firstOverlap(booking: BookingWithEvent, occurrences: Occurrence[], ctx: ConflictContext): Occurrence | null {
    const otherOccurrences = this.windowsFor(booking, ctx);
    for (const occ of occurrences) {
      for (const other of otherOccurrences) {
        if (RecurrenceHelper.overlaps(occ.start, occ.end, other.start, other.end)) return other;
      }
    }
    return null;
  }

  // Time windows: absolute startTime/endTime override setup/teardown padding (recurrence-aware).
  private static windowsFor(src: WindowSource, ctx: ConflictContext): Occurrence[] {
    if (src.startTime && src.endTime) return [{ start: new Date(src.startTime), end: new Date(src.endTime) }];
    const occurrences = RecurrenceHelper.getOccurrences(
      { start: src.start ?? src.eventStart, end: src.end ?? src.eventEnd, recurrenceRule: src.recurrenceRule ?? src.eventRecurrenceRule },
      ctx.windowStart,
      ctx.windowEnd
    );
    const setupMs = (src.setupMinutes || 0) * 60000;
    const teardownMs = (src.teardownMinutes || 0) * 60000;
    if (!setupMs && !teardownMs) return occurrences;
    return occurrences.map((o) => ({ start: new Date(o.start.getTime() - setupMs), end: new Date(o.end.getTime() + teardownMs) }));
  }
}
