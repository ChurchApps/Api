import "reflect-metadata";
jest.mock("../MessagingBaseController", () => ({ MessagingBaseController: class { json(obj: unknown, status: number) { return { obj, status }; } } }));
jest.mock("../../../../shared/helpers/Permissions", () => ({ Permissions: { people: { view: "peopleView", edit: "peopleEdit" }, messaging: { admin: "messagingAdmin" } } }));

import express from "express";
import { AuthenticatedUser, IPermission } from "@churchapps/apihelper";
import { DeliveryLogController } from "../DeliveryLogController.js";
import { Repos } from "../../repositories/index.js";

const req = {} as express.Request<{}, {}, null>;
const res = {} as express.Response;
const attemptTime = new Date("2026-11-20T10:00:00Z");

// The repo may hand back more columns than asked for; the endpoint must still drop them.
const row = { id: "d1", churchId: "c1", personId: "p1", contentType: "email", contentId: "msg1", deliveryMethod: "sesBounce", success: false, errorMessage: "General", deliveryAddress: "a@x.com", attemptTime, body: "<p>secret</p>" };

function makeController(granted: unknown[], rows: Record<string, unknown>[] = [row]) {
  const controller = new DeliveryLogController();
  const loadFailuresByPerson = jest.fn(async () => rows);
  controller.repos = Object.assign({} as Repos, { deliveryLog: { loadFailuresByPerson } });
  controller.actionWrapper = async (_req, _res, action) => action({ churchId: "c1", personId: "p1", checkAccess: (p: IPermission) => granted.includes(p) } as AuthenticatedUser);
  return { controller, loadFailuresByPerson };
}

describe("DeliveryLogController.loadFailuresByPerson", () => {
  it("returns the church's recent failures for the person, limited to 25", async () => {
    const { controller, loadFailuresByPerson } = makeController(["peopleEdit"]);
    const result = await controller.loadFailuresByPerson("p2", req, res);
    expect(loadFailuresByPerson).toHaveBeenCalledWith("c1", "p2", 25);
    expect(result).toEqual([{ attemptTime, deliveryMethod: "sesBounce", deliveryAddress: "a@x.com", errorMessage: "General" }]);
  });

  it("returns only date, channel, address and error", async () => {
    const { controller } = makeController(["peopleEdit"]);
    const [first] = (await controller.loadFailuresByPerson("p2", req, res)) as Record<string, unknown>[];
    expect(Object.keys(first).sort()).toEqual(["attemptTime", "deliveryAddress", "deliveryMethod", "errorMessage"]);
  });

  it.each([[["peopleView"]], [["messagingAdmin"]], [[]]])("refuses a caller without People edit (%j)", async (granted) => {
    const { controller, loadFailuresByPerson } = makeController(granted);
    expect(await controller.loadFailuresByPerson("p2", req, res)).toEqual({ obj: [], status: 401 });
    expect(loadFailuresByPerson).not.toHaveBeenCalled();
  });

  it("refuses a person looking at their own record without People edit", async () => {
    const { controller, loadFailuresByPerson } = makeController([]);
    expect(await controller.loadFailuresByPerson("p1", req, res)).toEqual({ obj: [], status: 401 });
    expect(loadFailuresByPerson).not.toHaveBeenCalled();
  });
});
