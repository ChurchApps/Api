import "reflect-metadata";
jest.mock("../DoingBaseController", () => ({ DoingBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("../../../../shared/helpers/index", () => ({ Permissions: { plans: { edit: "plansEdit" } } }));

import { BlockoutDateController } from "../BlockoutDateController.js";

function makeController(access: string[], existing: any) {
  const repos: any = { blockoutDate: { load: jest.fn(async () => existing), save: jest.fn(async (b: any) => b) } };
  const controller = new BlockoutDateController();
  (controller as any).repos = repos;
  (controller as any).actionWrapper = (_req: any, _res: any, action: any) => action({ churchId: "c1", personId: "p1", checkAccess: (p: any) => access.includes(p) });
  return { controller, repos };
}

describe("BlockoutDateController.save", () => {
  it("rejects re-pointing another person's blockout to yourself", async () => {
    const { controller, repos } = makeController([], { id: "b1", personId: "victim" });
    const result = await (controller as any).save({ body: [{ id: "b1", personId: "p1" }] }, {});
    expect(result).toEqual({ obj: {}, status: 401 });
    expect(repos.blockoutDate.save).not.toHaveBeenCalled();
  });

  it("lets a member edit their own blockout and staff edit anyone's", async () => {
    const own = makeController([], { id: "b1", personId: "p1" });
    await (own.controller as any).save({ body: [{ id: "b1", personId: "p1" }] }, {});
    expect(own.repos.blockoutDate.save).toHaveBeenCalled();
    const staff = makeController(["plansEdit"], { id: "b1", personId: "victim" });
    await (staff.controller as any).save({ body: [{ id: "b1", personId: "victim" }] }, {});
    expect(staff.repos.blockoutDate.save).toHaveBeenCalled();
  });
});
