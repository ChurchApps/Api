// "Lapsed regular giver" workflow rule: a gift in at least minWeeks of the regularWeeks weeks before
// the lapse window, then nothing in the last lapsedWeeks weeks. Reads dates and person ids only — never amounts.
export interface LapsedGiverRule { regularWeeks: number; minWeeks: number; lapsedWeeks: number }
export interface DonationDateRow { personId: string | null; donationDate: string | Date }

const DAY_MS = 24 * 60 * 60 * 1000;

export class LapsedGiverMatch {
  public static readonly defaults: LapsedGiverRule = { regularWeeks: 12, minWeeks: 3, lapsedWeeks: 3 };

  // Accepts the condition's fieldData JSON or an already-parsed object; out-of-range values are clamped.
  public static parseRule(input?: string | Partial<LapsedGiverRule>): LapsedGiverRule {
    let data: any = input || {};
    if (typeof input === "string") {
      try { data = JSON.parse(input); } catch { data = {}; }
    }
    const num = (v: any, fallback: number, min: number, max: number) => {
      const n = parseInt(v, 10);
      return Math.min(max, Math.max(min, isNaN(n) ? fallback : n));
    };
    const regularWeeks = num(data.regularWeeks, this.defaults.regularWeeks, 1, 104);
    const minWeeks = num(data.minWeeks, this.defaults.minWeeks, 1, regularWeeks);
    const lapsedWeeks = num(data.lapsedWeeks, this.defaults.lapsedWeeks, 1, 52);
    return { regularWeeks, minWeeks, lapsedWeeks };
  }

  // anchor is the church-local YYYY-MM-DD for today.
  public static windows(anchor: string, rule: LapsedGiverRule) {
    const lapseStart = this.addDays(anchor, -rule.lapsedWeeks * 7);
    const regularStart = this.addDays(lapseStart, -rule.regularWeeks * 7);
    return { regularStart, lapseStart };
  }

  public static match(rows: DonationDateRow[], anchor: string, rule: LapsedGiverRule): string[] {
    const { regularStart, lapseStart } = this.windows(anchor, rule);
    const startMs = this.toMs(regularStart);
    const weeksByPerson = new Map<string, Set<number>>();
    const recent = new Set<string>();
    rows.forEach((r) => {
      if (!r.personId || !r.donationDate) return;
      const day = this.toIsoDate(r.donationDate);
      if (day >= lapseStart) recent.add(r.personId);
      else if (day >= regularStart) {
        if (!weeksByPerson.has(r.personId)) weeksByPerson.set(r.personId, new Set());
        weeksByPerson.get(r.personId)!.add(Math.floor((this.toMs(day) - startMs) / (7 * DAY_MS)));
      }
    });
    const result: string[] = [];
    weeksByPerson.forEach((weeks, personId) => {
      if (!recent.has(personId) && weeks.size >= rule.minWeeks) result.push(personId);
    });
    return result.sort();
  }

  // donationDate comes back as a Date (local parts are the stored ones) or a MySQL string.
  private static toIsoDate(value: string | Date): string {
    if (value instanceof Date) {
      const pad = (n: number) => n.toString().padStart(2, "0");
      return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
    }
    return value.toString().substring(0, 10);
  }

  private static toMs(iso: string) {
    return Date.parse(iso + "T00:00:00Z");
  }

  private static addDays(iso: string, days: number) {
    return new Date(this.toMs(iso) + days * DAY_MS).toISOString().substring(0, 10);
  }
}
