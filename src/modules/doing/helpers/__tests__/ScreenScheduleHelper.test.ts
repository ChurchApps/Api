/** Tests FreePlay screen schedule expansion (church wall clock → instants) and the overlap rule. */

import { ScheduleEntry } from "../../models/index.js";
import { ScreenScheduleHelper } from "../ScreenScheduleHelper.js";

const TZ = "America/Chicago";

const dailyLoop: ScheduleEntry = { id: "A", screenGroupId: "G", targetType: "playlist", targetId: "P1", start: "2026-10-01T08:00:00", end: "2026-10-01T12:00:00", recurrenceRule: "FREQ=DAILY", endBehavior: "loop", enabled: true };
const announcement: ScheduleEntry = { id: "B", screenGroupId: "G", targetType: "playlist", targetId: "P2", start: "2026-10-19T10:00:00", end: "2026-10-19T11:00:00", endBehavior: "fallback", enabled: true };
const disabled: ScheduleEntry = { id: "C", screenGroupId: "G", targetType: "playlist", targetId: "P3", start: "2026-10-19T09:00:00", end: "2026-10-19T20:00:00", enabled: false };

describe("ScreenScheduleHelper.playbackEndBehavior", () => {
  it("sends teacher paced for a schedule saved as hold last", () => {
    expect(ScreenScheduleHelper.playbackEndBehavior("holdLast")).toBe("teacherPaced");
    expect(ScreenScheduleHelper.playbackEndBehavior("teacherPaced")).toBe("teacherPaced");
    expect(ScreenScheduleHelper.playbackEndBehavior("loop")).toBe("loop");
    expect(ScreenScheduleHelper.playbackEndBehavior("fallback")).toBe("fallback");
    expect(ScreenScheduleHelper.playbackEndBehavior(undefined)).toBe("loop");
    expect(ScreenScheduleHelper.playbackEndBehavior("")).toBe("loop");
  });
});

describe("ScreenScheduleHelper.expand", () => {
  const now = new Date("2026-10-19T14:00:00Z");

  it("expands in the church time zone, keeps the in-progress occurrence and skips disabled entries", () => {
    const occ = ScreenScheduleHelper.expand([dailyLoop, announcement, disabled], now, TZ);
    expect(occ.some((o) => o.entry.id === "C")).toBe(false);
    const loop = occ.filter((o) => o.entry.id === "A");
    expect(loop[0].start.toISOString()).toBe("2026-10-19T13:00:00.000Z");
    expect(loop[0].end.toISOString()).toBe("2026-10-19T17:00:00.000Z");
    expect(loop.every((o) => o.start < new Date(now.getTime() + 7 * 24 * 3600 * 1000))).toBe(true);
    expect(occ.filter((o) => o.entry.id === "B").map((o) => o.start.toISOString())).toEqual(["2026-10-19T15:00:00.000Z"]);
  });

  it("holds the wall-clock time across a DST change", () => {
    const occ = ScreenScheduleHelper.expand([dailyLoop], new Date("2026-10-29T12:00:00Z"), TZ);
    const starts = occ.map((o) => o.start.toISOString());
    expect(starts).toContain("2026-10-31T13:00:00.000Z");
    expect(starts).toContain("2026-11-02T14:00:00.000Z");
  });
});

describe("ScreenScheduleHelper.buildTimeline", () => {
  const now = new Date("2026-10-19T14:00:00Z");
  const occ = ScreenScheduleHelper.expand([dailyLoop, announcement], now, TZ).filter((o) => o.start < new Date("2026-10-20T00:00:00Z"));
  const timeline = ScreenScheduleHelper.buildTimeline(occ);

  it("lets the latest start win and resumes the earlier entry afterwards", () => {
    expect(timeline.map((s) => [s.entry.id, s.start.toISOString(), s.end.toISOString()])).toEqual([
      ["A", "2026-10-19T13:00:00.000Z", "2026-10-19T15:00:00.000Z"],
      ["B", "2026-10-19T15:00:00.000Z", "2026-10-19T16:00:00.000Z"],
      ["A", "2026-10-19T16:00:00.000Z", "2026-10-19T17:00:00.000Z"]
    ]);
    expect(new Set(timeline.map((s) => s.id)).size).toBe(timeline.length);
  });

  it("plays scheduled entries over the fallback and leaves gaps to the fallback", () => {
    expect(ScreenScheduleHelper.segmentAt(timeline, new Date("2026-10-19T15:30:00Z"))?.entry.id).toBe("B");
    expect(ScreenScheduleHelper.segmentAt(timeline, new Date("2026-10-19T14:30:00Z"))?.entry.id).toBe("A");
    expect(ScreenScheduleHelper.segmentAt(timeline, new Date("2026-10-19T18:00:00Z"))).toBeNull();
  });
});

describe("ScreenScheduleHelper item helpers", () => {
  it("keys the cache on provider, file and url without the query string", () => {
    expect(ScreenScheduleHelper.cacheKey("dropbox", "f1", "https://x/a.mp4?sig=1")).toBe(ScreenScheduleHelper.cacheKey("dropbox", "f1", "https://x/a.mp4?sig=2"));
    expect(ScreenScheduleHelper.cacheKey("dropbox", "f1", "https://x/a.mp4")).not.toBe(ScreenScheduleHelper.cacheKey("dropbox", "f2", "https://x/a.mp4"));
  });

  it("maps providers to resolve modes", () => {
    expect(ScreenScheduleHelper.resolveType("freeshow")).toBe("lan");
    expect(ScreenScheduleHelper.resolveType("googledrive")).toBe("url");
    expect(ScreenScheduleHelper.resolveType("onedrive")).toBe("url");
    expect(ScreenScheduleHelper.resolveType("lessonschurch")).toBe("url");
  });
});

describe("ScreenScheduleHelper teacher paced entries", () => {
  it("carries the teacher paced end behaviour onto its occurrences", () => {
    const lesson: ScheduleEntry = { id: "L", screenGroupId: "G", targetType: "planType", targetId: "PL1", start: "2026-10-19T09:00:00", end: "2026-10-19T10:00:00", endBehavior: "teacherPaced", enabled: true };
    const timeline = ScreenScheduleHelper.buildTimeline(ScreenScheduleHelper.expand([lesson], new Date("2026-10-19T13:30:00Z"), TZ));
    expect(timeline.map((s) => [s.entry.endBehavior, s.start.toISOString(), s.end.toISOString()])).toEqual([["teacherPaced", "2026-10-19T14:00:00.000Z", "2026-10-19T15:00:00.000Z"]]);
  });
});
