import "reflect-metadata";
jest.mock("../DoingBaseController", () => ({ DoingBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("../../../../shared/helpers/index", () => ({ Permissions: { plans: { edit: "plansEdit" } } }));
const mockGetProvider = jest.fn();
jest.mock("@churchapps/content-providers", () => ({ getProvider: (id: string) => mockGetProvider(id) }));
const mockGetAuth = jest.fn(async () => ({ access_token: "x", refresh_token: "{}" }));
jest.mock("../../helpers/ProviderAuthHelper.js", () => ({ ProviderAuthHelper: { getAuth: () => mockGetAuth() } }));

import { ProviderProxyController } from "../ProviderProxyController.js";

// LAN providers (FreeShow) are reached by the TV on the church network; the cloud proxy must not
// make requests to whatever address is stored in their auth.
const lanProvider = () => ({ requiresAuth: true, authTypes: ["network_discovery"], browse: jest.fn(async () => []), getPlaylist: jest.fn(async () => []), getPresentations: jest.fn(async () => null), getInstructions: jest.fn(async () => null), getExpandedInstructions: jest.fn(async () => null) });
const cloudProvider = () => ({ requiresAuth: false, authTypes: ["none"], browse: jest.fn(async () => [{ id: "f1" }]) });

function makeController() {
  const controller = new ProviderProxyController();
  (controller as any).repos = {};
  (controller as any).actionWrapper = (_req: any, _res: any, action: any) => action({ churchId: "c1", checkAccess: () => true });
  return controller;
}

describe("ProviderProxyController with a LAN provider", () => {
  const routes = ["browse", "getPresentations", "getPlaylist", "getInstructions", "getExpandedInstructions"] as const;

  it.each(routes)("%s refuses it without calling the provider", async (route) => {
    const provider = lanProvider();
    mockGetProvider.mockReturnValue(provider);
    await expect((makeController() as any)[route]({ body: { providerId: "freeshow", path: "/x" } }, {})).rejects.toMatchObject({ status: 400 });
    expect(provider[route]).not.toHaveBeenCalled();
  });

  it("still proxies a cloud provider", async () => {
    const provider = cloudProvider();
    mockGetProvider.mockReturnValue(provider);
    expect(await (makeController() as any).browse({ body: { providerId: "lessonschurch", path: "/" } }, {})).toEqual([{ id: "f1" }]);
  });
});
