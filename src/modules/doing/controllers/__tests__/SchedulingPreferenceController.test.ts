import "reflect-metadata";
jest.mock("../DoingBaseController", () => ({ DoingBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("../../../../shared/helpers/index", () => ({ Permissions: { plans: { edit: "plansEdit" } } }));

import { SchedulingPreferenceController } from "../SchedulingPreferenceController.js";

describe("SchedulingPreferenceController.save", () => {
  it("ignores a client-supplied id from a member so they can't take over another row", async () => {
    const repos: any = { schedulingPreference: { save: jest.fn(async (p: any) => p) } };
    const controller = new SchedulingPreferenceController();
    (controller as any).repos = repos;
    (controller as any).actionWrapper = (_req: any, _res: any, action: any) => action({ churchId: "c1", personId: "p1", checkAccess: () => false });
    await controller.save({ body: [{ id: "victimRow", maxPerMonth: 1 }] } as any, {} as any);
    expect(repos.schedulingPreference.save).toHaveBeenCalledWith(expect.objectContaining({ personId: "p1" }));
    expect(repos.schedulingPreference.save.mock.calls[0][0].id).toBeUndefined();
  });
});
