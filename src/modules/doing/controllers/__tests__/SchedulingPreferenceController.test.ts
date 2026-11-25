import "reflect-metadata";
jest.mock("../DoingBaseController", () => ({ DoingBaseController: class { json(obj: unknown, status: number) { return { obj, status }; } } }));
jest.mock("../../../../shared/helpers/index", () => ({ Permissions: { plans: { edit: "plansEdit" } } }));

import express from "express";
import { AuthenticatedUser, IPermission } from "@churchapps/apihelper";
import { Repos } from "../../repositories/index.js";
import { SchedulingPreferenceController } from "../SchedulingPreferenceController.js";
import { SchedulingPreference } from "../../models/index.js";

type MockRepos = Record<string, Record<string, jest.Mock>>;
const req = (r: Partial<express.Request>) => r as express.Request;
const res = {} as express.Response;

describe("SchedulingPreferenceController.save", () => {
  it("ignores a client-supplied id from a member so they can't take over another row", async () => {
    const repos: MockRepos = { schedulingPreference: { save: jest.fn(async (p: SchedulingPreference) => p) } };
    const controller = new SchedulingPreferenceController();
    controller.repos = Object.assign({} as Repos, repos);
    controller.actionWrapper = async (_req, _res, action) => action({ churchId: "c1", personId: "p1", checkAccess: (_perm: IPermission): boolean => false } as AuthenticatedUser);
    await controller.save(req({ body: [{ id: "victimRow", maxPerMonth: 1 }] }), res);
    expect(repos.schedulingPreference.save).toHaveBeenCalledWith(expect.objectContaining({ personId: "p1" }));
    expect(repos.schedulingPreference.save.mock.calls[0][0].id).toBeUndefined();
  });
});
