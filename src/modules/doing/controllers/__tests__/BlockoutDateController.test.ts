import "reflect-metadata";
jest.mock("../DoingBaseController", () => ({ DoingBaseController: class { json(obj: unknown, status: number) { return { obj, status }; } } }));
jest.mock("../../../../shared/helpers/index", () => ({ Permissions: { plans: { edit: "plansEdit" } } }));

import express from "express";
import { AuthenticatedUser, IPermission } from "@churchapps/apihelper";
import { Repos } from "../../repositories/index.js";
import { BlockoutDateController } from "../BlockoutDateController.js";
import { BlockoutDate } from "../../models/index.js";

type MockRepos = Record<string, Record<string, jest.Mock>>;
const req = (r: Partial<express.Request>) => r as express.Request;
const res = {} as express.Response;

// Permissions are mocked as plain strings, so access holds those strings.
function makeController(access: unknown[], existing: Partial<BlockoutDate>) {
  const repos: MockRepos = { blockoutDate: { load: jest.fn(async () => existing), save: jest.fn(async (b: BlockoutDate) => b) } };
  const controller = new BlockoutDateController();
  controller.repos = Object.assign({} as Repos, repos);
  controller.actionWrapper = async (_req, _res, action) => action({ churchId: "c1", personId: "p1", checkAccess: (p: IPermission) => access.includes(p) } as AuthenticatedUser);
  return { controller, repos };
}

describe("BlockoutDateController.save", () => {
  it("rejects re-pointing another person's blockout to yourself", async () => {
    const { controller, repos } = makeController([], { id: "b1", personId: "victim" });
    const result = await controller.save(req({ body: [{ id: "b1", personId: "p1" }] }), res);
    expect(result).toEqual({ obj: {}, status: 401 });
    expect(repos.blockoutDate.save).not.toHaveBeenCalled();
  });

  it("lets a member edit their own blockout and staff edit anyone's", async () => {
    const own = makeController([], { id: "b1", personId: "p1" });
    await own.controller.save(req({ body: [{ id: "b1", personId: "p1" }] }), res);
    expect(own.repos.blockoutDate.save).toHaveBeenCalled();
    const staff = makeController(["plansEdit"], { id: "b1", personId: "victim" });
    await staff.controller.save(req({ body: [{ id: "b1", personId: "victim" }] }), res);
    expect(staff.repos.blockoutDate.save).toHaveBeenCalled();
  });
});
