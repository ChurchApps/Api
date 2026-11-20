import "reflect-metadata";
import type express from "express";
jest.mock("../AttendanceBaseController", () => ({ AttendanceBaseController: class { json(obj: unknown, status: number) { return { obj, status }; } } }));
jest.mock("../../../../shared/helpers/index", () => ({ Permissions: { attendance: { checkin: "checkin", edit: "attEdit", view: "attView" } } }));
const sendBulkText = jest.fn(async () => ({ ok: true, sent: 1 }));
jest.mock("../../../../shared/modules/index", () => ({
  getMembershipModuleGateway: () => ({ loadHouseholdAdults: jest.fn(async () => [{ personId: "a1", mobilePhone: "555", optedOut: false }]) }),
  getMessagingModuleGateway: () => ({ sendBulkText })
}));
const consume = jest.fn(async (_churchId: string) => true);
jest.mock("../../helpers/BroadcastRateLimiter", () => ({ BroadcastRateLimiter: { consume: (churchId: string) => consume(churchId) } }));

import { CheckinController } from "../CheckinController.js";

type TestAu = { churchId: string; checkAccess: (perm: string) => boolean };
type BroadcastResult = { sent?: number; status?: number };
const asReq = (r: Partial<express.Request>) => r as express.Request;
const res = {} as express.Response;

function makeController() {
  return Object.assign(new CheckinController(), {
    repos: { visit: { loadActiveByServiceToday: jest.fn(async () => [{ personId: "k1" }]) } },
    actionWrapper: (_req: unknown, _res: unknown, action: (au: TestAu) => Promise<unknown>) => action({ churchId: "c1", checkAccess: (p: string) => p === "checkin" }),
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
