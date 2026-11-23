import "reflect-metadata";
jest.mock("../MessagingBaseController", () => ({ MessagingBaseController: class { json(obj: unknown, status: number) { return { obj, status }; } } }));
jest.mock("../../../../shared/helpers/Permissions", () => ({ Permissions: { people: { view: "peopleView", edit: "peopleEdit" }, messaging: { admin: "messagingAdmin" } } }));

import express from "express";
import { AuthenticatedUser, IPermission } from "@churchapps/apihelper";
import { DeliveryLogController } from "../DeliveryLogController.js";
import { Repos } from "../../repositories/index.js";
import { DeliveryLog } from "../../models/index.js";

type EmailStatus = { bounced: boolean; address?: string; date?: Date };
const req = {} as express.Request<{}, {}, null>;
const res = {} as express.Response;

const attemptTime = new Date("2026-11-20T10:00:00Z");

// Permissions are mocked as plain strings, so granted holds those strings.
function makeController(granted: unknown[], latest: Partial<DeliveryLog> | null) {
  const controller = new DeliveryLogController();
  const loadLatestEmailEvent = jest.fn(async () => latest);
  controller.repos = Object.assign({} as Repos, { deliveryLog: { loadLatestEmailEvent } });
  controller.actionWrapper = async (_req, _res, action) => action({ churchId: "c1", personId: "viewer", checkAccess: (p: IPermission) => granted.includes(p) } as AuthenticatedUser);
  return { controller, loadLatestEmailEvent };
}

const bounce = { deliveryMethod: "sesBounce", deliveryAddress: "a@x.com", attemptTime, errorMessage: "General", contentType: "email" };

describe("DeliveryLogController.loadEmailStatus", () => {
  it("reports a bounce to a People viewer with only the address and date", async () => {
    const { controller, loadLatestEmailEvent } = makeController(["peopleView"], bounce);
    const result = await controller.loadEmailStatus("p1", req, res);
    expect(loadLatestEmailEvent).toHaveBeenCalledWith("c1", "p1");
    expect(result).toEqual({ bounced: true, address: "a@x.com", date: attemptTime });
  });

  it("answers a People editor", async () => {
    const { controller } = makeController(["peopleEdit"], bounce);
    expect(((await controller.loadEmailStatus("p1", req, res)) as EmailStatus).bounced).toBe(true);
  });

  it("is not bounced when a send came after the bounce", async () => {
    const { controller } = makeController(["peopleView"], { deliveryMethod: "email", deliveryAddress: "a@x.com", attemptTime, success: true });
    expect(await controller.loadEmailStatus("p1", req, res)).toEqual({ bounced: false });
  });

  it("is not bounced when nothing was sent", async () => {
    const { controller } = makeController(["peopleView"], null);
    expect(await controller.loadEmailStatus("p1", req, res)).toEqual({ bounced: false });
  });

  it("lets a person check their own address", async () => {
    const { controller } = makeController([], bounce);
    expect(((await controller.loadEmailStatus("viewer", req, res)) as EmailStatus).bounced).toBe(true);
  });

  it("refuses someone without People access", async () => {
    const { controller, loadLatestEmailEvent } = makeController([], bounce);
    expect(await controller.loadEmailStatus("p1", req, res)).toEqual({ obj: {}, status: 401 });
    expect(loadLatestEmailEvent).not.toHaveBeenCalled();
  });
});
