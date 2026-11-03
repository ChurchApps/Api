import "reflect-metadata";

jest.mock("../DoingBaseController", () => ({ DoingBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("../../../../shared/helpers/index", () => ({ PlanAuth: { canEditPlanType: jest.fn(async () => true) } }));
const applyMock = jest.fn(async (_r: any, _c: string, plan: any) => ({ planId: plan.id, warning: null }));
jest.mock("../../helpers/LessonTrimHelper.js", () => ({
  LessonTrimHelper: {
    loadInstructions: jest.fn(async () => null),
    capture: jest.fn((rows: any[], plan: any) => ({ providerId: plan.providerId, savedFromPlanId: plan.id, keep: rows.map((r) => ({ section: r.label, sectionIndex: r.providerContentPath })) })),
    apply: (...args: any[]) => (applyMock as any)(...args)
  }
}));

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

describe("PlanTypeController.saveLessonTrim", () => {
  const future = new Date(Date.now() + 7 * 86400000);
  const past = new Date(Date.now() - 7 * 86400000);
  const plans: any[] = [
    { id: "P1", planTypeId: "pt1", providerId: "gocurriculum", providerPlanId: "/el/a", serviceDate: future },
    { id: "P2", planTypeId: "pt1", providerId: "gocurriculum", providerPlanId: "/el/b", serviceDate: future },
    { id: "P3", planTypeId: "pt1", providerId: "gocurriculum", providerPlanId: "/el/c", serviceDate: past },
    { id: "P4", planTypeId: "pt1", serviceDate: future }
  ];
  let repos: any;
  beforeEach(() => {
    jest.clearAllMocks();
    repos = {
      plan: { load: jest.fn(async (_c: string, id: string) => plans.find((p) => p.id === id)), loadByPlanTypeId: jest.fn(async () => plans) },
      planItem: { loadForPlan: jest.fn(async () => [{ label: "Opening", providerId: "gocurriculum", providerContentPath: "0", itemType: "providerSection" }]) },
      planType: { updateLessonTrim: jest.fn() }
    };
  });
  const call = (body: any) => makeController(repos).saveLessonTrim("pt1", { body } as any, {} as any);

  it("previews the kept parts and the upcoming lessons without saving", async () => {
    const result: any = await call({ fromPlanId: "P1", preview: true });
    expect(result.keep).toEqual([{ section: "Opening", sectionIndex: "0" }]);
    expect(result.upcoming.map((p: any) => p.planId)).toEqual(["P2"]);
    expect(repos.planType.updateLessonTrim).not.toHaveBeenCalled();
  });

  it("saves the trim on the plan type and re-trims upcoming lessons when asked", async () => {
    const result: any = await call({ fromPlanId: "P1", applyUpcoming: true });
    expect(repos.planType.updateLessonTrim).toHaveBeenCalledWith("c1", "pt1", expect.stringContaining("\"section\":\"Opening\""));
    expect(applyMock).toHaveBeenCalledTimes(1);
    expect(applyMock.mock.calls[0][2].id).toBe("P2");
    expect(applyMock.mock.calls[0][3]).toEqual({ force: true });
    expect(result.applied).toEqual([{ planId: "P2", warning: null }]);
  });

  it("rejects a plan that is not a lesson in this plan type", async () => {
    const result: any = await call({ fromPlanId: "P4" });
    expect(result.status).toBe(400);
    expect(repos.planType.updateLessonTrim).not.toHaveBeenCalled();
  });
});
