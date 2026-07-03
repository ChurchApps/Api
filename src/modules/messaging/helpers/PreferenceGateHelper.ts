import { NotificationPreference, NotificationPreferenceOverride, NotificationEntityMute } from "../models/index.js";
import { NotificationCategoryHelper } from "./NotificationCategoryHelper.js";
import { TimezoneHelper } from "./TimezoneHelper.js";

export type GateDecision = "allow" | "suppress" | "defer";

export interface GateResult {
  decision: GateDecision;
  allow: boolean;
  reason?: string;
  deferUntil?: Date;
}

export interface GateContext {
  pref?: NotificationPreference | null; // preloaded on the hot path; null/absent = defaults
  overrides?: NotificationPreferenceOverride[]; // preloaded; absent = no overrides
  now?: Date;
  timeZone?: string; // explicit tz; else pref.timeZone, else churchTimeZone
  churchTimeZone?: string; // fallback when the member has no tz set
  entityMutes?: NotificationEntityMute[]; // Phase 2 per-entity mute
  entityType?: string;
  entityId?: string;
  isDirectMention?: boolean;
}

const ALLOW: GateResult = { decision: "allow", allow: true };
const suppress = (reason: string): GateResult => ({ decision: "suppress", allow: false, reason });

// Send-time precedence gate (architecture §4.4): single chokepoint where first-layer decision wins. Pure: state passed via ctx (no DB calls on hot path). Phase-0: Layer 0 (bounce/suspend) and Layer 6/7 (entity mute/dedup) documented no-ops; dedup enforced by NotificationHelper.loadExistingUnread.
export class PreferenceGateHelper {
  static evaluate(_churchId: string, _personId: string, category: string, channel: string, ctx: GateContext = {}): GateResult {
    const pref = ctx.pref;
    const now = ctx.now ?? new Date();

    if (NotificationCategoryHelper.isLocked(category)) return ALLOW;

    if (pref?.masterMute) return suppress("master_mute");
    if (channel === "push" && pref && !pref.allowPush) return suppress("channel_off");
    if (channel === "sms" && !pref?.allowSms) return suppress("channel_off");
    if (channel === "email" && pref?.emailFrequency === "never") return suppress("channel_off");

    if ((channel === "push" || channel === "sms") && pref?.quietHoursStart && pref?.quietHoursEnd) {
      const tz = ctx.timeZone ?? pref.timeZone ?? ctx.churchTimeZone;
      if (tz && this.nowInQuietHours(now, tz, pref.quietHoursStart, pref.quietHoursEnd)) {
        if (NotificationCategoryHelper.isTransactional(category)) return ALLOW;
        // Reminder dispatcher reschedules to deferUntil; direct-push path treats DEFER as suppress (§4.4.1).
        return { decision: "defer", allow: false, reason: "quiet_hours", deferUntil: this.quietHoursEndInstant(now, tz, pref.quietHoursEnd) };
      }
    }

    if (!NotificationCategoryHelper.effectiveOptIn(category, channel, ctx.overrides)) return suppress("category_opt_out");

    if (ctx.entityMutes && ctx.entityType && ctx.entityId) {
      const mute = ctx.entityMutes.find((m) => m.entityType === ctx.entityType && m.entityId === ctx.entityId);
      if (mute && (mute.level === "muted" || (mute.level === "mentions" && !ctx.isDirectMention))) return suppress("entity_muted");
    }

    return ALLOW;
  }

  private static localMinutes(now: Date, tz: string): number {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now);
    const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24; // some platforms emit "24" at midnight
    const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
    return h * 60 + m;
  }

  private static toMinutes(time: string): number {
    const [h, m] = time.split(":").map((n) => Number(n));
    return (h || 0) * 60 + (m || 0);
  }

  static nowInQuietHours(now: Date, tz: string, start: string, end: string): boolean {
    const cur = this.localMinutes(now, tz);
    const s = this.toMinutes(start);
    const e = this.toMinutes(end);
    if (s === e) return false;
    return s < e ? cur >= s && cur < e : cur >= s || cur < e; // wrap past midnight
  }

  // Wall-clock end time in tz (on-or-after now), resolved to UTC via wallClockToUtc so DST transitions land correctly.
  private static quietHoursEndInstant(now: Date, tz: string, end: string): Date {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
    const map: Record<string, string> = {};
    for (const p of parts) map[p.type] = p.value;
    const y = Number(map.year);
    const mo = Number(map.month);
    const d = Number(map.day);
    const e = this.toMinutes(end);
    const eh = Math.floor(e / 60);
    const em = e % 60;
    let candidate = TimezoneHelper.wallClockToUtc(y, mo, d, eh, em, tz);
    if (candidate.getTime() <= now.getTime()) {
      const next = new Date(Date.UTC(y, mo - 1, d + 1));
      candidate = TimezoneHelper.wallClockToUtc(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), eh, em, tz);
    }
    return candidate;
  }
}
