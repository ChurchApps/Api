import "reflect-metadata";

jest.mock("../DoingBaseController", () => ({ DoingBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("../../../../shared/helpers/index", () => ({ PlanAuth: { canEditPlanType: jest.fn(async () => true) } }));
jest.mock("../../../../shared/events/InternalEventBus", () => ({ InternalEventBus: { publish: jest.fn() } }));

import { PlanTypeController } from "../PlanTypeController.js";
import { PlanAuth } from "../../../../shared/helpers/index";
import { InternalEventBus } from "../../../../shared/events/InternalEventBus";

function makeController(repos: any) {
  const controller = new PlanTypeController();
  (controller as any).repos = repos;
  (controller as any).actionWrapper = (_req: any, _res: any, action: any) => action({ churchId: "c1", personId: "p1" });
  return controller;
}

// Issue #1324: deleting a plan type left its plans visible under volunteer opportunities.
describe("PlanTypeController.delete", () => {
  let repos: any;

  beforeEach(() => {
    jest.clearAllMocks();
    repos = {
      plan: { loadByPlanTypeId: jest.fn(async () => [{ id: "plan1" }, { id: "plan2" }]), delete: jest.fn() },
      planItemTime: { deleteByPlanId: jest.fn() },
      time: { deleteByPlanId: jest.fn() },
      assignment: { deleteByPlanId: jest.fn() },
      position: { deleteByPlanId: jest.fn() },
      planItem: { deleteByPlanId: jest.fn() },
      planType: { delete: jest.fn() }
    };
  });

  it("deletes each plan of the type, with its children, before the type itself", async () => {
    await makeController(repos).delete("pt1", {} as any, {} as any);
    expect(repos.plan.loadByPlanTypeId).toHaveBeenCalledWith("c1", "pt1");
    for (const planId of ["plan1", "plan2"]) {
      expect(repos.planItemTime.deleteByPlanId).toHaveBeenCalledWith("c1", planId);
      expect(repos.time.deleteByPlanId).toHaveBeenCalledWith("c1", planId);
      expect(repos.assignment.deleteByPlanId).toHaveBeenCalledWith("c1", planId);
      expect(repos.position.deleteByPlanId).toHaveBeenCalledWith("c1", planId);
      expect(repos.planItem.deleteByPlanId).toHaveBeenCalledWith("c1", planId);
      expect(repos.plan.delete).toHaveBeenCalledWith("c1", planId);
      expect(InternalEventBus.publish).toHaveBeenCalledWith("c1", "plan.destroyed", { id: planId });
    }
    expect(repos.planType.delete).toHaveBeenCalledWith("c1", "pt1");
    expect(repos.plan.delete.mock.invocationCallOrder[1]).toBeLessThan(repos.planType.delete.mock.invocationCallOrder[0]);
  });

  it("deletes nothing when the caller cannot edit the plan type", async () => {
    (PlanAuth.canEditPlanType as jest.Mock).mockResolvedValueOnce(false);
    const result: any = await makeController(repos).delete("pt1", {} as any, {} as any);
    expect(result.status).toBe(401);
    expect(repos.plan.delete).not.toHaveBeenCalled();
    expect(repos.planType.delete).not.toHaveBeenCalled();
  });
});
