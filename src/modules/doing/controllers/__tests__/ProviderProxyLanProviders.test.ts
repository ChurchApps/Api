import "reflect-metadata";
jest.mock("../DoingBaseController", () => ({ DoingBaseController: class { json(obj: unknown, status: number) { return { obj, status }; } } }));
jest.mock("../../../../shared/helpers/index", () => ({ Permissions: { plans: { edit: "plansEdit" } } }));
const mockGetProvider = jest.fn();
jest.mock("@churchapps/content-providers", () => ({ getProvider: (id: string) => mockGetProvider(id) }));
const mockGetAuth = jest.fn(async () => ({ access_token: "x", refresh_token: "{}" }));
jest.mock("../../helpers/ProviderAuthHelper.js", () => ({ ProviderAuthHelper: { getAuth: () => mockGetAuth() } }));

import express from "express";
import { AuthenticatedUser, IPermission } from "@churchapps/apihelper";
import { Repos } from "../../repositories/index.js";
import { ProviderProxyController } from "../ProviderProxyController.js";

const req = (r: Partial<express.Request>) => r as express.Request;
const res = {} as express.Response;

// LAN providers (FreeShow) are reached by the TV on the church network; the cloud proxy must not
// make requests to whatever address is stored in their auth.
const lanProvider = () => ({ requiresAuth: true, authTypes: ["network_discovery"], browse: jest.fn(async () => []), getPlaylist: jest.fn(async () => []), getPresentations: jest.fn(async () => null), getInstructions: jest.fn(async () => null), getExpandedInstructions: jest.fn(async () => null) });
const cloudProvider = () => ({ requiresAuth: false, authTypes: ["none"], browse: jest.fn(async () => [{ id: "f1" }]) });

function makeController() {
  const controller = new ProviderProxyController();
  controller.repos = {} as Repos;
  controller.actionWrapper = async (_req, _res, action) => action({ churchId: "c1", checkAccess: (_perm: IPermission): boolean => true } as AuthenticatedUser);
  return controller;
}

describe("ProviderProxyController with a LAN provider", () => {
  const routes = ["browse", "getPresentations", "getPlaylist", "getInstructions", "getExpandedInstructions"] as const;

  it.each(routes)("%s refuses it without calling the provider", async (route) => {
    const provider = lanProvider();
    mockGetProvider.mockReturnValue(provider);
    await expect(makeController()[route](req({ body: { providerId: "freeshow", path: "/x" } }), res)).rejects.toMatchObject({ status: 400 });
    expect(provider[route]).not.toHaveBeenCalled();
  });

  it("still proxies a cloud provider", async () => {
    const provider = cloudProvider();
    mockGetProvider.mockReturnValue(provider);
    expect(await makeController().browse(req({ body: { providerId: "lessonschurch", path: "/" } }), res)).toEqual([{ id: "f1" }]);
  });
});
