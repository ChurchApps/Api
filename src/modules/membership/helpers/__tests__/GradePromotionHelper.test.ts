import { GRADES, nextGrade } from "../GradeMapping.js";
jest.mock("../../db/index", () => ({ getDb: jest.fn() }));
jest.mock("../../../../shared/infrastructure/RepoManager", () => ({ RepoManager: { getRepos: jest.fn() } }));
import { GradePromotionHelper } from "../GradePromotionHelper.js";

describe("nextGrade", () => {
  it("advances each grade to the next one end-to-end", () => {
    const expected = [
      "K", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "Graduated"
    ];
    const advanced = GRADES.slice(0, -1).map((g) => nextGrade(g));
    expect(advanced).toEqual(expected);
  });

  it("chains PreK all the way to Graduated", () => {
    let g: string | null = "PreK";
    const path: string[] = [g];
    for (let i = 0; i < GRADES.length + 2; i++) {
      g = nextGrade(g);
      if (g === null) break;
      path.push(g);
    }
    expect(path[path.length - 1]).toBe("Graduated");
    expect(path).toEqual(GRADES);
  });

  it("leaves Graduated untouched", () => {
    expect(nextGrade("Graduated")).toBeNull();
  });

  it("leaves null/undefined/empty untouched", () => {
    expect(nextGrade(null)).toBeNull();
    expect(nextGrade(undefined)).toBeNull();
    expect(nextGrade("")).toBeNull();
  });

  it("leaves unrecognized values untouched", () => {
    expect(nextGrade("College")).toBeNull();
  });
});

describe("GradePromotionHelper.localDate", () => {
  const now = new Date("2026-08-15T03:00:00Z");

  it("uses the church's time zone for the calendar day", () => {
    expect(GradePromotionHelper.localDate(now, "America/Chicago")).toEqual({ year: "2026", todayMMDD: "08-14" });
    expect(GradePromotionHelper.localDate(now, "UTC")).toEqual({ year: "2026", todayMMDD: "08-15" });
  });

  it("falls back to UTC for a missing or invalid zone", () => {
    expect(GradePromotionHelper.localDate(now, undefined)).toEqual({ year: "2026", todayMMDD: "08-15" });
    expect(GradePromotionHelper.localDate(now, "Not/AZone")).toEqual({ year: "2026", todayMMDD: "08-15" });
  });
});
