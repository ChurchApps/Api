import { NotificationPreference, NotificationPreferenceOverride } from "../models/index.js";
import { NotificationCategoryHelper } from "./NotificationCategoryHelper.js";

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
  sentInWindow?: number; // frequency-cap source; wired in Phase 1/2 (architecture §11)
}

const ALLOW: GateResult = { decision: "allow", allow: true };
const suppress = (reason: string): GateResult => ({ decision: "suppress", allow: false, reason });

// Send-time precedence gate (architecture §4.4). The single chokepoint every
// notification passes through; first layer that decides wins. Pure: all state is
// passed in via ctx so it is trivially testable and adds no DB call on the hot path.
//
// Phase-0 scope: Layer 0 (bounce/suspend) and Layer 6/7 (entity mute / dedup)
// have no data source yet and are documented no-ops; dedup is still enforced by
// the existing NotificationHelper.loadExistingUnread path. priority is never a
// parameter — time-sensitivity is derived from the category.
export class PreferenceGateHelper {
  // churchId/personId are part of the contract (and future logging / frequency
  // lookups) but unused by Phase-0's pure logic — hence the underscore prefix.
  static evaluate(_churchId: string, _personId: string, category: string, channel: string, ctx: GateContext = {}): GateResult {
    const pref = ctx.pref;
    const now = ctx.now ?? new Date();

    // LAYER 1 — compliance / locked: bypass everything below.
    if (NotificationCategoryHelper.isLocked(category)) return ALLOW;

    // LAYER 2 — master mute / global channel kill (reuses the existing flags).
    if (pref?.masterMute) return suppress("master_mute");
    if (channel === "push" && pref && !pref.allowPush) return suppress("channel_off");
    if (channel === "sms" && !pref?.allowSms) return suppress("channel_off");
    if (channel === "email" && pref?.emailFrequency === "never") return suppress("channel_off");

    // LAYER 3 — quiet hours (push/sms only; email is non-intrusive).
    if ((channel === "push" || channel === "sms") && pref?.quietHoursStart && pref?.quietHoursEnd) {
      const tz = ctx.timeZone ?? pref.timeZone ?? ctx.churchTimeZone;
      if (tz && this.nowInQuietHours(now, tz, pref.quietHoursStart, pref.quietHoursEnd)) {
        if (NotificationCategoryHelper.isTransactional(category)) return ALLOW; // time-sensitive bypass
        // Non-transactional: the reminder dispatcher reschedules to deferUntil;
        // the direct-push path treats DEFER as suppress (architecture §4.4.1).
        return { decision: "defer", allow: false, reason: "quiet_hours", deferUntil: this.quietHoursEndInstant(now, tz, pref.quietHoursEnd) };
      }
    }

    // LAYER 4 — frequency cap (non-transactional only). No counting source is
    // wired in Phase 0; only enforced when a caller supplies ctx.sentInWindow.
    if (!NotificationCategoryHelper.isTransactional(category) && ctx.sentInWindow != null) {
      const cap = channel === "push" ? pref?.maxPushPerDay : undefined;
      if (cap != null && ctx.sentInWindow >= cap) return suppress("frequency_cap");
    }

    // LAYER 5 — per-category preference (absence-means-default).
    if (!NotificationCategoryHelper.effectiveOptIn(category, channel, ctx.overrides)) return suppress("category_opt_out");

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

  // ponytail: naive minute-add, DST-blind across the boundary; the only Phase-0
  // consumer (direct push) ignores deferUntil. Phase-1 reminder dispatcher recomputes.
  private static quietHoursEndInstant(now: Date, tz: string, end: string): Date {
    const cur = this.localMinutes(now, tz);
    const e = this.toMinutes(end);
    const minutesUntil = e > cur ? e - cur : 24 * 60 - cur + e;
    return new Date(now.getTime() + minutesUntil * 60000);
  }
}
