import "reflect-metadata";
jest.mock("../DoingBaseController", () => ({ DoingBaseController: class { json(obj: unknown, status: number) { return { obj, status }; } } }));
jest.mock("../../../../shared/helpers/index", () => ({ Permissions: { plans: { edit: "plansEdit" } } }));
jest.mock("@churchapps/content-providers", () => ({ getProvider: jest.fn(), getProviderConfig: jest.fn(), TokenHelper: class {} }));

import express from "express";
import { AuthenticatedUser, IPermission } from "@churchapps/apihelper";
import { Repos } from "../../repositories/index.js";
import { ContentProviderAuthController } from "../ContentProviderAuthController.js";
import { ContentProviderAuth } from "../../models/index.js";

type MockRepos = Record<string, Record<string, jest.Mock>>;
const req = (r: Partial<express.Request>) => r as express.Request;
const res = {} as express.Response;

describe("ContentProviderAuthController responses", () => {
  it("never return refresh tokens", async () => {
    const row = { id: "a1", accessToken: "at", refreshToken: "rt" };
    const repos: MockRepos = { contentProviderAuth: { loadByMinistry: jest.fn(async () => [row]), loadByMinistryAndProvider: jest.fn(async () => row) } };
    const controller = new ContentProviderAuthController();
    controller.repos = Object.assign({} as Repos, repos);
    controller.actionWrapper = async (_req, _res, action) => action({ churchId: "c1", checkAccess: (_perm: IPermission): boolean => true } as AuthenticatedUser);
    const list = (await controller.getByMinistry("m1", req({}), res)) as ContentProviderAuth[];
    const one = (await controller.getByMinistryAndProvider("m1", "p1", req({}), res)) as ContentProviderAuth;
    expect(list[0].refreshToken).toBeUndefined();
    expect(list[0].accessToken).toBe("at");
    expect(one.refreshToken).toBeUndefined();
  });
});
