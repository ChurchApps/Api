import "reflect-metadata";

// Scheduled push (ChurchAppsSupport#1411): the everyone audience needs content.edit, a group needs groupMembers.edit.
jest.mock("../../../../shared/infrastructure/index", () => ({ BaseController: class { constructor(_module?: string) {} } }));
jest.mock("../../repositories/index", () => ({ Repos: class {} }));
jest.mock("../../../../shared/helpers/Permissions", () => ({ Permissions: { content: { edit: "contentEdit" }, groupMembers: { edit: "groupMembersEdit" } } }));
const sendNowMock = jest.fn(async () => ({ recipientCount: 1, successCount: 1 }));
jest.mock("../../helpers/ScheduledNotificationHelper.js", () => ({ ScheduledNotificationHelper: { sendNow: sendNowMock } }));

import { ScheduledNotificationController } from "../ScheduledNotificationController.js";

const principal = (access: string[]) => ({ id: "u1", churchId: "c1", personId: "p1", checkAccess: (perm: any) => access.includes(perm) });

function makeController(access: string[], existing: any = null) {
  const scheduledNotification = {
    save: jest.fn(async (r: any) => ({ ...r, id: r.id || "S1" })),
    load: jest.fn(async () => existing),
    loadForChurch: jest.fn(async () => []),
    cancel: jest.fn(async () => !!existing && existing.status === "pending"),
    delete: jest.fn(async () => !!existing && ["sent", "failed", "cancelled"].includes(existing.status)),
    deleteFinished: jest.fn(async () => 2)
  };
  const controller = new ScheduledNotificationController();
  (controller as any).repos = { scheduledNotification };
  (controller as any).actionWrapper = (_req: any, _res: any, action: any) => action(principal(access));
  (controller as any).json = (obj: any, status: number) => ({ obj, status });
  return { controller, scheduledNotification };
}

const future = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();
const body = (over: any = {}) => ({ audience: "church", title: "Main session", message: "Starts in 15 minutes", sendAt: future(), ...over });

beforeEach(() => sendNowMock.mockClear());

describe("ScheduledNotificationController.save", () => {
  it("refuses the everyone audience without content.edit", async () => {
    const { controller, scheduledNotification } = makeController(["groupMembersEdit"]);
    expect((await controller.save({ body: body() } as any, {} as any) as any).status).toBe(401);
    expect(scheduledNotification.save).not.toHaveBeenCalled();
  });

  it("refuses a group audience without groupMembers.edit", async () => {
    const { controller, scheduledNotification } = makeController(["contentEdit"]);
    expect((await controller.save({ body: body({ audience: "group", groupId: "g1" }) } as any, {} as any) as any).status).toBe(401);
    expect(scheduledNotification.save).not.toHaveBeenCalled();
  });

  it("requires a group for the group audience and enforces the dialog's length limits", async () => {
    const { controller } = makeController(["contentEdit", "groupMembersEdit"]);
    expect((await controller.save({ body: body({ audience: "group" }) } as any, {} as any) as any).status).toBe(400);
    expect((await controller.save({ body: body({ title: "x".repeat(81) }) } as any, {} as any) as any).status).toBe(400);
    expect((await controller.save({ body: body({ link: "javascript:alert(1)" }) } as any, {} as any) as any).status).toBe(400);
  });

  it("saves a future send as pending for the caller's church", async () => {
    const { controller, scheduledNotification } = makeController(["contentEdit"]);
    await controller.save({ body: body({ churchId: "other" }) } as any, {} as any);
    expect(scheduledNotification.save).toHaveBeenCalledWith(expect.objectContaining({ churchId: "c1", status: "pending", audience: "church", createdByPersonId: "p1" }));
    expect(sendNowMock).not.toHaveBeenCalled();
  });

  it("sends right away when the send time has already passed", async () => {
    const { controller, scheduledNotification } = makeController(["contentEdit"]);
    const result: any = await controller.save({ body: body({ sendAt: new Date(Date.now() - 60000).toISOString() }) } as any, {} as any);
    expect(sendNowMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: "S1", churchId: "c1" }));
    expect(scheduledNotification.save).toHaveBeenCalledTimes(1);
    expect(result).toEqual(expect.objectContaining({ status: "sent", recipientCount: 1 }));
  });

  it("refuses to edit a notification that already went out", async () => {
    const { controller, scheduledNotification } = makeController(["contentEdit"], { id: "S1", churchId: "c1", audience: "church", status: "sent" });
    expect((await controller.save({ body: body({ id: "S1" }) } as any, {} as any) as any).status).toBe(409);
    expect(scheduledNotification.save).not.toHaveBeenCalled();
  });
});

describe("ScheduledNotificationController.cancel", () => {
  // ChurchAppsSupport#1456: a finished notification is removed from the Recent list instead of refused.
  it("removes a notification that already went out", async () => {
    const { controller, scheduledNotification } = makeController(["contentEdit"], { id: "S1", churchId: "c1", audience: "church", status: "sent" });
    const result: any = await controller.cancel("S1", {} as any, {} as any);
    expect(scheduledNotification.delete).toHaveBeenCalledWith("c1", "S1");
    expect(scheduledNotification.cancel).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({ id: "S1", deleted: true }));
  });

  it("leaves a notification alone while it is being sent", async () => {
    const { controller, scheduledNotification } = makeController(["contentEdit"], { id: "S1", churchId: "c1", audience: "church", status: "processing" });
    expect((await controller.cancel("S1", {} as any, {} as any) as any).status).toBe(409);
    expect(scheduledNotification.delete).not.toHaveBeenCalled();
    expect(scheduledNotification.cancel).not.toHaveBeenCalled();
  });

  it("refuses a group admin removing a sent everyone notification", async () => {
    const { controller, scheduledNotification } = makeController(["groupMembersEdit"], { id: "S1", churchId: "c1", audience: "church", status: "sent" });
    expect((await controller.cancel("S1", {} as any, {} as any) as any).status).toBe(401);
    expect(scheduledNotification.delete).not.toHaveBeenCalled();
  });

  it("cancels a pending send", async () => {
    const { controller, scheduledNotification } = makeController(["contentEdit"], { id: "S1", churchId: "c1", audience: "church", status: "pending" });
    await controller.cancel("S1", {} as any, {} as any);
    expect(scheduledNotification.cancel).toHaveBeenCalledWith("c1", "S1");
  });

  it("refuses a group admin cancelling an everyone send", async () => {
    const { controller, scheduledNotification } = makeController(["groupMembersEdit"], { id: "S1", churchId: "c1", audience: "church", status: "pending" });
    expect((await controller.cancel("S1", {} as any, {} as any) as any).status).toBe(401);
    expect(scheduledNotification.cancel).not.toHaveBeenCalled();
  });
});

describe("ScheduledNotificationController.clearRecent", () => {
  it("clears only the audiences the caller can send to", async () => {
    const { controller, scheduledNotification } = makeController(["groupMembersEdit"]);
    expect(await controller.clearRecent({} as any, {} as any)).toEqual({ deleted: 2 });
    expect(scheduledNotification.deleteFinished).toHaveBeenCalledWith("c1", ["group"]);
  });

  it("clears both audiences for a caller with both permissions", async () => {
    const { controller, scheduledNotification } = makeController(["contentEdit", "groupMembersEdit"]);
    await controller.clearRecent({} as any, {} as any);
    expect(scheduledNotification.deleteFinished).toHaveBeenCalledWith("c1", ["church", "group"]);
  });

  it("refuses a caller with neither permission", async () => {
    const { controller, scheduledNotification } = makeController([]);
    expect((await controller.clearRecent({} as any, {} as any) as any).status).toBe(401);
    expect(scheduledNotification.deleteFinished).not.toHaveBeenCalled();
  });
});
