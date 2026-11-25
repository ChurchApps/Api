import "reflect-metadata";

jest.mock("../DoingBaseController", () => ({ DoingBaseController: class { json(obj: unknown, status: number) { return { obj, status }; } } }));
jest.mock("../../../../shared/helpers/index", () => ({
  PlanAuth: { canEditPlan: jest.fn(async () => true) },
  Permissions: { plans: { edit: { contentType: "Plans", action: "Edit" } }, content: { edit: { contentType: "Content", action: "Edit" } } }
}));
jest.mock("../../helpers/PlanHelper", () => ({ PlanHelper: {} }));
jest.mock("@churchapps/apihelper", () => ({}));

import express from "express";
import type { AuthenticatedUser } from "@churchapps/apihelper";
import { PlanItemController } from "../PlanItemController.js";
import { Repos } from "../../repositories/index.js";

const res = {} as express.Response;
const req = (query: Record<string, string>) => ({ query }) as unknown as express.Request<{}, {}, null>;

function makeController(access: string[], rows: unknown[] = []) {
  const controller = new PlanItemController();
  const loadSongsByDateRange = jest.fn(async () => rows);
  controller.repos = Object.assign({} as Repos, { planItem: { loadSongsByDateRange } });
  const au = { churchId: "c1", personId: "p1", checkAccess: (p: { contentType: string }) => access.includes(p.contentType) } as unknown as AuthenticatedUser;
  controller.actionWrapper = async (_req, _res, action) => action(au);
  return { controller, loadSongsByDateRange };
}

describe("PlanItemController.getSongsByDateRange", () => {
  it("returns the church's song items in the range for a plans editor", async () => {
    const rows = [{ id: "pi1", planId: "pl1", relatedId: "ak1", serviceDate: new Date("2026-11-01") }];
    const { controller, loadSongsByDateRange } = makeController(["Plans"], rows);
    const result = await controller.getSongsByDateRange(req({ startDate: "2026-10-01", endDate: "2026-11-30" }), res);
    expect(result).toBe(rows);
    expect(loadSongsByDateRange).toHaveBeenCalledWith("c1", "2026-10-01", "2026-11-30");
  });

  it("allows a song library editor", async () => {
    const { controller, loadSongsByDateRange } = makeController(["Content"]);
    await controller.getSongsByDateRange(req({ startDate: "2026-10-01", endDate: "2026-11-30" }), res);
    expect(loadSongsByDateRange).toHaveBeenCalled();
  });

  it("refuses a user with neither permission", async () => {
    const { controller, loadSongsByDateRange } = makeController([]);
    const result = await controller.getSongsByDateRange(req({ startDate: "2026-10-01", endDate: "2026-11-30" }), res);
    expect(result).toEqual({ obj: {}, status: 401 });
    expect(loadSongsByDateRange).not.toHaveBeenCalled();
  });

  it("rejects missing or malformed dates", async () => {
    const { controller, loadSongsByDateRange } = makeController(["Plans"]);
    expect(await controller.getSongsByDateRange(req({ startDate: "2026-10-01" }), res)).toMatchObject({ status: 400 });
    expect(await controller.getSongsByDateRange(req({ startDate: "2026-10-01'; --", endDate: "2026-11-30" }), res)).toMatchObject({ status: 400 });
    expect(loadSongsByDateRange).not.toHaveBeenCalled();
  });
});
