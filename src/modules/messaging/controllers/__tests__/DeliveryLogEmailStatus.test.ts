import "reflect-metadata";
jest.mock("../MessagingBaseController", () => ({ MessagingBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("../../../../shared/helpers/Permissions", () => ({ Permissions: { people: { view: "peopleView", edit: "peopleEdit" }, messaging: { admin: "messagingAdmin" } } }));

import { DeliveryLogController } from "../DeliveryLogController.js";

const attemptTime = new Date("2026-11-20T10:00:00Z");

function makeController(granted: string[], latest: any) {
  const controller = new DeliveryLogController();
  const loadLatestEmailEvent = jest.fn(async () => latest);
  (controller as any).repos = { deliveryLog: { loadLatestEmailEvent } };
  (controller as any).actionWrapper = (_req: any, _res: any, action: any) => action({ churchId: "c1", personId: "viewer", checkAccess: (p: string) => granted.includes(p) });
  return { controller, loadLatestEmailEvent };
}

const bounce = { deliveryMethod: "sesBounce", deliveryAddress: "a@x.com", attemptTime, errorMessage: "General", contentType: "email" };

describe("DeliveryLogController.loadEmailStatus", () => {
  it("reports a bounce to a People viewer with only the address and date", async () => {
    const { controller, loadLatestEmailEvent } = makeController(["peopleView"], bounce);
    const result = await (controller as any).loadEmailStatus("p1", {}, {});
    expect(loadLatestEmailEvent).toHaveBeenCalledWith("c1", "p1");
    expect(result).toEqual({ bounced: true, address: "a@x.com", date: attemptTime });
  });

  it("answers a People editor", async () => {
    const { controller } = makeController(["peopleEdit"], bounce);
    expect((await (controller as any).loadEmailStatus("p1", {}, {})).bounced).toBe(true);
  });

  it("is not bounced when a send came after the bounce", async () => {
    const { controller } = makeController(["peopleView"], { deliveryMethod: "email", deliveryAddress: "a@x.com", attemptTime, success: true });
    expect(await (controller as any).loadEmailStatus("p1", {}, {})).toEqual({ bounced: false });
  });

  it("is not bounced when nothing was sent", async () => {
    const { controller } = makeController(["peopleView"], null);
    expect(await (controller as any).loadEmailStatus("p1", {}, {})).toEqual({ bounced: false });
  });

  it("lets a person check their own address", async () => {
    const { controller } = makeController([], bounce);
    expect((await (controller as any).loadEmailStatus("viewer", {}, {})).bounced).toBe(true);
  });

  it("refuses someone without People access", async () => {
    const { controller, loadLatestEmailEvent } = makeController([], bounce);
    expect(await (controller as any).loadEmailStatus("p1", {}, {})).toEqual({ obj: {}, status: 401 });
    expect(loadLatestEmailEvent).not.toHaveBeenCalled();
  });
});
