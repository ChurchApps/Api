import "reflect-metadata";
jest.mock("../AttendanceBaseController", () => ({ AttendanceBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("../../../../shared/helpers/index", () => ({ Permissions: { attendance: { checkin: "checkin", edit: "attEdit", view: "attView" } } }));
const sendBulkText = jest.fn(async () => ({ ok: true, sent: 1 }));
jest.mock("../../../../shared/modules/index", () => ({
  getMembershipModuleGateway: () => ({ loadHouseholdAdults: jest.fn(async () => [{ personId: "a1", mobilePhone: "555", optedOut: false }]) }),
  getMessagingModuleGateway: () => ({ sendBulkText })
}));
const consume = jest.fn(async () => true);
jest.mock("../../helpers/BroadcastRateLimiter", () => ({ BroadcastRateLimiter: { consume: (...a: any[]) => (consume as any)(...a) } }));

import { CheckinController } from "../CheckinController.js";

function makeController() {
  const controller = new CheckinController();
  (controller as any).repos = { visit: { loadActiveByServiceToday: jest.fn(async () => [{ personId: "k1" }]) } };
  (controller as any).actionWrapper = (_req: any, _res: any, action: any) => action({ churchId: "c1", checkAccess: (p: string) => p === "checkin" });
  (controller as any).json = (obj: any, status: number) => ({ obj, status });
  return controller;
}

describe("CheckinController.broadcast", () => {
  beforeEach(() => { sendBulkText.mockClear(); consume.mockClear(); });

  it("sends for a kiosk token within limits", async () => {
    const result: any = await makeController().broadcast({ body: { serviceId: "s1", message: "Pickup now" } } as any, {} as any);
    expect(result.sent).toBe(1);
    expect(consume).toHaveBeenCalledWith("c1");
  });

  it("rejects over-long messages and throttled churches", async () => {
    const long: any = await makeController().broadcast({ body: { serviceId: "s1", message: "x".repeat(481) } } as any, {} as any);
    expect(long.status).toBe(400);
    consume.mockResolvedValueOnce(false);
    const limited: any = await makeController().broadcast({ body: { serviceId: "s1", message: "hi" } } as any, {} as any);
    expect(limited.status).toBe(429);
    expect(sendBulkText).not.toHaveBeenCalled();
  });
});
