import "reflect-metadata";
import type express from "express";
jest.mock("../AttendanceBaseController", () => ({ AttendanceBaseController: class { json(obj: unknown, status: number) { return { obj, status }; } } }));
jest.mock("../../../../shared/helpers/index", () => ({ Permissions: { attendance: { checkin: "checkin", edit: "attEdit", view: "attView" } } }));
const sendBulkText = jest.fn(async () => ({ ok: true, sent: 1 }));
const loadSetting = jest.fn(async (_churchId: string, _keyName: string): Promise<string | null> => null);
jest.mock("../../../../shared/modules/index", () => ({
  getMembershipModuleGateway: () => ({
    loadHouseholdAdults: jest.fn(async () => [{ personId: "a1", mobilePhone: "555", smsOptedOut: false }]),
    loadSetting: (churchId: string, keyName: string) => loadSetting(churchId, keyName)
  }),
  getMessagingModuleGateway: () => ({ sendBulkText })
}));
const consume = jest.fn(async (_churchId: string) => true);
jest.mock("../../helpers/BroadcastRateLimiter", () => ({ BroadcastRateLimiter: { consume: (churchId: string) => consume(churchId) } }));

import { CheckinController } from "../CheckinController.js";

type TestAu = { churchId: string; checkAccess: (perm: string) => boolean };
type BroadcastResult = { sent?: number; status?: number };
const asReq = (r: Partial<express.Request>) => r as express.Request;
const res = {} as express.Response;

function makeController(perm = "checkin") {
  return Object.assign(new CheckinController(), {
    repos: { visit: { loadActiveByServiceToday: jest.fn(async () => [{ personId: "k1" }]) } },
    actionWrapper: (_req: unknown, _res: unknown, action: (au: TestAu) => Promise<unknown>) => action({ churchId: "c1", checkAccess: (p: string) => p === perm }),
    json: (obj: unknown, status: number) => ({ obj, status })
  });
}

describe("CheckinController.broadcast", () => {
  beforeEach(() => { sendBulkText.mockClear(); consume.mockClear(); });

  it("sends for a kiosk token within limits", async () => {
    const result = (await makeController().broadcast(asReq({ body: { serviceId: "s1", message: "Pickup now" } }), res)) as BroadcastResult;
    expect(result.sent).toBe(1);
    expect(consume).toHaveBeenCalledWith("c1");
  });

  it("rejects over-long messages and throttled churches", async () => {
    const long = (await makeController().broadcast(asReq({ body: { serviceId: "s1", message: "x".repeat(481) } }), res)) as BroadcastResult;
    expect(long.status).toBe(400);
    consume.mockResolvedValueOnce(false);
    const limited = (await makeController().broadcast(asReq({ body: { serviceId: "s1", message: "hi" } }), res)) as BroadcastResult;
    expect(limited.status).toBe(429);
    expect(sendBulkText).not.toHaveBeenCalled();
  });
});

describe("CheckinController.getSettings", () => {
  beforeEach(() => loadSetting.mockReset());

  it("returns the church's check-in announcement with the grade promotion date", async () => {
    loadSetting.mockImplementation(async (_c, key) => (key === "checkinAnnouncement" ? "Kids wing closes at 10:15" : "2026-08-01"));
    const result = await makeController().getSettings(asReq({}), res);
    expect(result).toEqual({ gradePromotionDate: "2026-08-01", checkinAnnouncement: "Kids wing closes at 10:15" });
    expect(loadSetting).toHaveBeenCalledWith("c1", "checkinAnnouncement");
  });

  it("returns a blank announcement when none is set", async () => {
    loadSetting.mockResolvedValue(null);
    const result = await makeController().getSettings(asReq({}), res);
    expect(result).toEqual({ gradePromotionDate: null, checkinAnnouncement: "" });
  });

  it("refuses tokens without check-in or attendance view access", async () => {
    const result = (await makeController("none").getSettings(asReq({}), res)) as { status?: number };
    expect(result.status).toBe(401);
    expect(loadSetting).not.toHaveBeenCalled();
  });
});
