import { LapsedGiverMatch } from "../LapsedGiverMatch.js";

// Anchor 2026-10-26: lapse starts 2026-10-05 (3 weeks back); the 12 regular weeks run 2026-07-13 to 2026-10-04.
const anchor = "2026-10-26";
const rule = { regularWeeks: 12, minWeeks: 3, lapsedWeeks: 3 };

describe("LapsedGiverMatch", () => {
  it("windows are whole weeks counted back from the church's today", () => {
    expect(LapsedGiverMatch.windows(anchor, rule)).toEqual({ regularStart: "2026-07-13", lapseStart: "2026-10-05" });
  });

  it("matches someone who gave in enough weeks and then stopped", () => {
    const rows = [
      { personId: "REG", donationDate: "2026-07-19" },
      { personId: "REG", donationDate: new Date(2026, 7, 16, 10, 15) },
      { personId: "REG", donationDate: "2026-09-20 10:00:00" },
      { personId: "REG", donationDate: "2026-10-04" }
    ];
    expect(LapsedGiverMatch.match(rows, anchor, rule)).toEqual(["REG"]);
  });

  it("skips one-off givers, people still giving, and gifts on the same week counted once", () => {
    const rows = [
      { personId: "ONCE", donationDate: "2026-08-02" },
      { personId: "SAMEWEEK", donationDate: "2026-09-14" },
      { personId: "SAMEWEEK", donationDate: "2026-09-15" },
      { personId: "SAMEWEEK", donationDate: "2026-09-16" },
      { personId: "RECENT", donationDate: "2026-07-20" },
      { personId: "RECENT", donationDate: "2026-08-20" },
      { personId: "RECENT", donationDate: "2026-09-20" },
      { personId: "RECENT", donationDate: "2026-10-05" },
      { personId: null, donationDate: "2026-07-20" }
    ];
    expect(LapsedGiverMatch.match(rows as any, anchor, rule)).toEqual([]);
  });

  it("a failed or pending charge in the lapse window is not a recent gift", () => {
    const rows = [
      { personId: "FAILED", donationDate: "2026-07-20" },
      { personId: "FAILED", donationDate: "2026-08-20" },
      { personId: "FAILED", donationDate: "2026-09-20" },
      { personId: "FAILED", donationDate: "2026-10-05", status: "failed" },
      { personId: "PENDING", donationDate: "2026-07-20" },
      { personId: "PENDING", donationDate: "2026-08-20" },
      { personId: "PENDING", donationDate: "2026-09-20" },
      { personId: "PENDING", donationDate: "2026-10-10", status: "pending" }
    ];
    expect(LapsedGiverMatch.match(rows, anchor, rule)).toEqual(["FAILED", "PENDING"]);
  });

  it("a refunded gift does not count toward the regular weeks; complete and missing status do", () => {
    const rows = [
      { personId: "REFUNDED", donationDate: "2026-07-20" },
      { personId: "REFUNDED", donationDate: "2026-08-20" },
      { personId: "REFUNDED", donationDate: "2026-09-20", status: "refunded" },
      { personId: "COMPLETE", donationDate: "2026-07-20", status: "complete" },
      { personId: "COMPLETE", donationDate: "2026-08-20" },
      { personId: "COMPLETE", donationDate: "2026-09-20", status: null }
    ];
    expect(LapsedGiverMatch.match(rows, anchor, rule)).toEqual(["COMPLETE"]);
  });

  it("ignores gifts older than the regular window", () => {
    const rows = [
      { personId: "OLD", donationDate: "2026-07-12" },
      { personId: "OLD", donationDate: "2026-07-13" },
      { personId: "OLD", donationDate: "2026-08-01" }
    ];
    expect(LapsedGiverMatch.match(rows, anchor, rule)).toEqual([]);
    expect(LapsedGiverMatch.match(rows, anchor, { ...rule, minWeeks: 2 })).toEqual(["OLD"]);
  });

  it("clamps out-of-range settings and fills defaults", () => {
    expect(LapsedGiverMatch.parseRule(undefined)).toEqual({ regularWeeks: 12, minWeeks: 3, lapsedWeeks: 3 });
    expect(LapsedGiverMatch.parseRule("not json")).toEqual({ regularWeeks: 12, minWeeks: 3, lapsedWeeks: 3 });
    expect(LapsedGiverMatch.parseRule({ regularWeeks: 8, minWeeks: undefined, lapsedWeeks: 2 })).toEqual({ regularWeeks: 8, minWeeks: 3, lapsedWeeks: 2 });
    expect(LapsedGiverMatch.parseRule(JSON.stringify({ regularWeeks: 500, minWeeks: 900, lapsedWeeks: 0 }))).toEqual({ regularWeeks: 104, minWeeks: 104, lapsedWeeks: 1 });
    expect(LapsedGiverMatch.parseRule(JSON.stringify({ regularWeeks: 4, minWeeks: 6, lapsedWeeks: 60 }))).toEqual({ regularWeeks: 4, minWeeks: 4, lapsedWeeks: 52 });
  });
});
