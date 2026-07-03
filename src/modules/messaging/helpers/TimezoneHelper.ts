// Timezone math without a dependency — native Intl.DateTimeFormat only
// (architecture §2.4/§5.4 calls for Temporal; for Phase-0/1 needs Intl suffices
// and dodges the supply-chain cooldown). "day before at 9am" never lands in a DST
// gap, so the simple two-pass offset resolution below is correct for reminders.
export class TimezoneHelper {
  private static offsetMs(tz: string, instantMs: number): number {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
    const map: Record<string, string> = {};
    for (const p of dtf.formatToParts(new Date(instantMs))) map[p.type] = p.value;
    const hour = Number(map.hour) % 24; // some platforms emit "24" at midnight
    const localAsUtc = Date.UTC(Number(map.year), Number(map.month) - 1, Number(map.day), hour, Number(map.minute), Number(map.second));
    return localAsUtc - instantMs;
  }

  static wallClockToUtc(y: number, mo: number, d: number, h: number, mi: number, tz: string): Date {
    const asIfUtc = Date.UTC(y, mo - 1, d, h, mi, 0);
    const off1 = this.offsetMs(tz, asIfUtc);
    let utc = asIfUtc - off1;
    const off2 = this.offsetMs(tz, utc); // refine once across a DST boundary
    if (off2 !== off1) utc = asIfUtc - off2;
    return new Date(utc);
  }

  static computeFireAt(occLocalDate: string, sendLocalTime: string, offsetMin: number, tz: string): Date {
    const [y, mo, d] = occLocalDate.split("-").map(Number);
    const [sh, sm] = sendLocalTime.split(":").map(Number);
    // Subtract the offset as a civil-space duration so "1 day before 9am" stays 9am local.
    const civil = new Date(Date.UTC(y, mo - 1, d, sh || 0, sm || 0, 0) - offsetMin * 60000);
    return this.wallClockToUtc(civil.getUTCFullYear(), civil.getUTCMonth() + 1, civil.getUTCDate(), civil.getUTCHours(), civil.getUTCMinutes(), tz);
  }
}
