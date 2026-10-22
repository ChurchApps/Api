import "reflect-metadata";

jest.mock("../DoingBaseController", () => ({ DoingBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("../../../../shared/helpers/index", () => ({ PlanAuth: { canEditPlanType: jest.fn(async () => true) } }));

import { PlanTypeController } from "../PlanTypeController.js";
import { PlanAuth } from "../../../../shared/helpers/index";

function makeController(repos: any) {
  const controller = new PlanTypeController();
  (controller as any).repos = repos;
  (controller as any).actionWrapper = (_req: any, _res: any, action: any) => action({ churchId: "c1", personId: "p1" });
  return controller;
}

describe("PlanTypeController.delete", () => {
  let repos: any;

  beforeEach(() => {
    jest.clearAllMocks();
    repos = { planType: { delete: jest.fn() } };
  });

  it("deletes the plan type", async () => {
    await makeController(repos).delete("pt1", {} as any, {} as any);
    expect(repos.planType.delete).toHaveBeenCalledWith("c1", "pt1");
  });

  it("deletes nothing when the caller cannot edit the plan type", async () => {
    (PlanAuth.canEditPlanType as jest.Mock).mockResolvedValueOnce(false);
    const result: any = await makeController(repos).delete("pt1", {} as any, {} as any);
    expect(result.status).toBe(401);
    expect(repos.planType.delete).not.toHaveBeenCalled();
  });
});
