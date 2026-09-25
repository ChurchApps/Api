import "reflect-metadata";
jest.mock("../DoingBaseController", () => ({ DoingBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("../../../../shared/helpers/index", () => ({ Permissions: { plans: { edit: "plansEdit" } } }));
jest.mock("@churchapps/content-providers", () => ({ getProvider: jest.fn(), getProviderConfig: jest.fn(), TokenHelper: class {} }));

import { ContentProviderAuthController } from "../ContentProviderAuthController.js";

describe("ContentProviderAuthController responses", () => {
  it("never return refresh tokens", async () => {
    const row = { id: "a1", accessToken: "at", refreshToken: "rt" };
    const repos: any = { contentProviderAuth: { loadByMinistry: jest.fn(async () => [row]), loadByMinistryAndProvider: jest.fn(async () => row) } };
    const controller = new ContentProviderAuthController();
    (controller as any).repos = repos;
    (controller as any).actionWrapper = (_req: any, _res: any, action: any) => action({ churchId: "c1", checkAccess: () => true });
    const list = await controller.getByMinistry("m1", {} as any, {} as any);
    const one = await controller.getByMinistryAndProvider("m1", "p1", {} as any, {} as any);
    expect(list[0].refreshToken).toBeUndefined();
    expect(list[0].accessToken).toBe("at");
    expect(one.refreshToken).toBeUndefined();
  });
});
