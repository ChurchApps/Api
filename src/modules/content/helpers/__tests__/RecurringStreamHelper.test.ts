/** Recurring live streams keep their church wall-clock time across a daylight-saving change (ChurchAppsSupport#1416 follow-up). */
const gateway = {
  loadChurch: jest.fn(async (): Promise<{ id: string; timeZone?: string | null }> => ({ id: "CHU1", timeZone: "America/Chicago" })),
  loadCampusTimeZones: jest.fn(async (): Promise<Record<string, string>> => ({}))
};
jest.mock("../../../../shared/modules/index", () => ({ getMembershipModuleGateway: () => gateway }));

import { RecurringStreamHelper } from "../RecurringStreamHelper.js";

// 9:00 AM Sunday in Chicago: 14:00Z during daylight time, 15:00Z during standard time.
const CDT_9AM_OCT_25 = new Date("2026-10-25T14:00:00Z");
const CST_9AM_NOV_1 = new Date("2026-11-01T15:00:00Z");
const CST_9AM_MAR_1 = new Date("2026-03-01T15:00:00Z");
const CDT_9AM_MAR_8 = new Date("2026-03-08T14:00:00Z");

describe("RecurringStreamHelper.addWeek", () => {
  it("keeps 9:00 AM Chicago when clocks fall back", () => {
    expect(RecurringStreamHelper.addWeek(CDT_9AM_OCT_25, "America/Chicago")).toEqual(CST_9AM_NOV_1);
  });

  it("keeps 9:00 AM Chicago when clocks spring forward", () => {
    expect(RecurringStreamHelper.addWeek(CST_9AM_MAR_1, "America/Chicago")).toEqual(CDT_9AM_MAR_8);
  });

  it("adds exactly seven days inside one DST period", () => {
    expect(RecurringStreamHelper.addWeek(new Date("2026-10-11T14:00:00Z"), "America/Chicago")).toEqual(new Date("2026-10-18T14:00:00Z"));
  });

  it("adds seven days of UTC when no zone is known", () => {
    expect(RecurringStreamHelper.addWeek(CDT_9AM_OCT_25)).toEqual(new Date("2026-11-01T14:00:00Z"));
  });
});

describe("RecurringStreamHelper.pickZone", () => {
  it("takes the church zone when the saved browser offset belongs to it", () => {
    expect(RecurringStreamHelper.pickZone(["America/Chicago"], 300, CDT_9AM_OCT_25)).toBe("America/Chicago");
    expect(RecurringStreamHelper.pickZone(["America/Chicago"], 360, CDT_9AM_OCT_25)).toBe("America/Chicago");
  });

  it("accepts the backfilled New York zone for a Central church, since both shift on the same days", () => {
    expect(RecurringStreamHelper.pickZone(["America/New_York"], 300, CDT_9AM_OCT_25)).toBe("America/New_York");
  });

  it("rejects the backfilled New York zone for a church whose offset it never produces", () => {
    expect(RecurringStreamHelper.pickZone(["America/New_York"], -60, CDT_9AM_OCT_25)).toBeUndefined(); // Lagos
    expect(RecurringStreamHelper.pickZone(["America/New_York"], 420, CDT_9AM_OCT_25)).toBeUndefined(); // Phoenix
  });

  it("falls through to a campus zone and skips blanks and bad names", () => {
    expect(RecurringStreamHelper.pickZone([null, "", "Not/AZone", "America/New_York", "Africa/Lagos"], -60, CDT_9AM_OCT_25)).toBe("Africa/Lagos");
  });
});

describe("RecurringStreamHelper.advance", () => {
  it("rolls a stream three weeks forward across the fall-back and lands on 9:00 AM CST", () => {
    const service = { churchId: "CHU1", serviceTime: new Date(CDT_9AM_OCT_25), timezoneOffset: 300, recurring: true };
    const cutoff = RecurringStreamHelper.staleCutoff(new Date("2026-11-10T12:00:00Z"));
    expect(RecurringStreamHelper.advance(service, cutoff, "America/Chicago")).toBe(true);
    expect(service.serviceTime).toEqual(new Date("2026-11-15T15:00:00Z"));
  });

  it("leaves a stream alone until six hours after it started", () => {
    const service = { churchId: "CHU1", serviceTime: new Date(CST_9AM_NOV_1), timezoneOffset: 360, recurring: true };
    expect(RecurringStreamHelper.advance(service, RecurringStreamHelper.staleCutoff(new Date("2026-11-01T20:00:00Z")), "America/Chicago")).toBe(false);
    expect(service.serviceTime).toEqual(CST_9AM_NOV_1);
    expect(RecurringStreamHelper.advance(service, RecurringStreamHelper.staleCutoff(new Date("2026-11-01T21:30:00Z")), "America/Chicago")).toBe(true);
    expect(service.serviceTime).toEqual(new Date("2026-11-08T15:00:00Z"));
  });
});

describe("RecurringStreamHelper.advanceStale", () => {
  beforeEach(() => jest.clearAllMocks());

  it("moves each church's stale recurring streams in that church's zone and saves only the time", async () => {
    gateway.loadChurch.mockImplementation(async (id) => ({ id, timeZone: id === "CHU1" ? "America/Chicago" : "America/New_York" }));
    const rows = [
      { id: "S1", churchId: "CHU1", serviceTime: new Date(CDT_9AM_OCT_25), timezoneOffset: 300, recurring: true },
      { id: "S2", churchId: "CHU2", serviceTime: new Date("2026-10-25T04:00:00Z"), timezoneOffset: -60, recurring: true } // Lagos church, New York backfilled
    ];
    const repo = { loadAllRecurring: jest.fn(async () => rows), updateServiceTime: jest.fn(async () => undefined) };
    expect(await RecurringStreamHelper.advanceStale(repo, new Date("2026-11-02T00:05:00Z"))).toBe(2);
    expect(repo.loadAllRecurring).toHaveBeenCalledWith(new Date("2026-11-01T18:05:00Z"));
    expect(repo.updateServiceTime).toHaveBeenCalledWith("S1", "CHU1", new Date("2026-11-08T15:00:00Z")); // 9:00 AM CST
    expect(repo.updateServiceTime).toHaveBeenCalledWith("S2", "CHU2", new Date("2026-11-08T04:00:00Z"));
    expect(gateway.loadChurch).toHaveBeenCalledTimes(2);
  });
});
