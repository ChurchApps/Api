import "reflect-metadata";

jest.mock("../DoingBaseController", () => ({ DoingBaseController: class { json(obj: unknown, status: number) { return { obj, status }; } } }));
jest.mock("../../../../shared/helpers/index", () => ({ PlanAuth: { canEditPlanType: jest.fn(async () => true) } }));
const applyMock = jest.fn(async (_r: Repos, _c: string, plan: Plan, _opts?: { force?: boolean }): Promise<LessonTrimResult> => ({ planId: plan.id, warning: null }));
jest.mock("../../helpers/LessonTrimHelper.js", () => ({
  LessonTrimHelper: {
    loadInstructions: jest.fn(async () => null),
    capture: jest.fn((rows: PlanItem[], plan: Plan) => ({ providerId: plan.providerId, savedFromPlanId: plan.id, keep: rows.map((r) => ({ section: r.label, sectionIndex: r.providerContentPath })) })),
    apply: (...args: [Repos, string, Plan, { force?: boolean }?]) => applyMock(...args)
  }
}));

import { PlanTypeController } from "../PlanTypeController.js";
import { PlanAuth } from "../../../../shared/helpers/index";
import express from "express";
import { AuthenticatedUser } from "@churchapps/apihelper";
import { Repos } from "../../repositories/index.js";
import { Plan, PlanItem } from "../../models/index.js";
import type { LessonTrimKeep, LessonTrimResult } from "../../helpers/LessonTrimHelper.js";

type MockRepos = Record<string, Record<string, jest.Mock>>;
type JsonOut = { obj: unknown; status: number };
type TrimResponse = { keep: LessonTrimKeep[]; upcoming?: { planId: string }[]; applied?: LessonTrimResult[] };
const req = (r: Partial<express.Request>) => r as express.Request;
const res = {} as express.Response;

function makeController(repos: MockRepos) {
  const controller = new PlanTypeController();
  controller.repos = Object.assign({} as Repos, repos);
  controller.actionWrapper = async (_req, _res, action) => action({ churchId: "c1", personId: "p1" } as AuthenticatedUser);
  return controller;
}

describe("PlanTypeController.delete", () => {
  let repos: MockRepos;

  beforeEach(() => {
    jest.clearAllMocks();
    repos = { planType: { delete: jest.fn() } };
  });

  it("deletes the plan type", async () => {
    await makeController(repos).delete("pt1", req({}), res);
    expect(repos.planType.delete).toHaveBeenCalledWith("c1", "pt1");
  });

  it("deletes nothing when the caller cannot edit the plan type", async () => {
    (PlanAuth.canEditPlanType as jest.Mock).mockResolvedValueOnce(false);
    const result = (await makeController(repos).delete("pt1", req({}), res)) as JsonOut;
    expect(result.status).toBe(401);
    expect(repos.planType.delete).not.toHaveBeenCalled();
  });
});

describe("PlanTypeController.saveLessonTrim", () => {
  const future = new Date(Date.now() + 7 * 86400000);
  const past = new Date(Date.now() - 7 * 86400000);
  const plans: Plan[] = [
    { id: "P1", planTypeId: "pt1", providerId: "gocurriculum", providerPlanId: "/el/a", serviceDate: future },
    { id: "P2", planTypeId: "pt1", providerId: "gocurriculum", providerPlanId: "/el/b", serviceDate: future },
    { id: "P3", planTypeId: "pt1", providerId: "gocurriculum", providerPlanId: "/el/c", serviceDate: past },
    { id: "P4", planTypeId: "pt1", serviceDate: future }
  ];
  let repos: MockRepos;
  beforeEach(() => {
    jest.clearAllMocks();
    repos = {
      plan: { load: jest.fn(async (_c: string, id: string) => plans.find((p) => p.id === id)), loadByPlanTypeId: jest.fn(async () => plans) },
      planItem: { loadForPlan: jest.fn(async () => [{ label: "Opening", providerId: "gocurriculum", providerContentPath: "0", itemType: "providerSection" }]) },
      planType: { updateLessonTrim: jest.fn() }
    };
  });
  const call = (body: { fromPlanId?: string; applyUpcoming?: boolean; preview?: boolean }) => makeController(repos).saveLessonTrim("pt1", req({ body }), res);

  it("previews the kept parts and the upcoming lessons without saving", async () => {
    const result = (await call({ fromPlanId: "P1", preview: true })) as TrimResponse;
    expect(result.keep).toEqual([{ section: "Opening", sectionIndex: "0" }]);
    expect(result.upcoming.map((p) => p.planId)).toEqual(["P2"]);
    expect(repos.planType.updateLessonTrim).not.toHaveBeenCalled();
  });

  it("saves the trim on the plan type and re-trims upcoming lessons when asked", async () => {
    const result = (await call({ fromPlanId: "P1", applyUpcoming: true })) as TrimResponse;
    expect(repos.planType.updateLessonTrim).toHaveBeenCalledWith("c1", "pt1", expect.stringContaining("\"section\":\"Opening\""));
    expect(applyMock).toHaveBeenCalledTimes(1);
    expect(applyMock.mock.calls[0][2].id).toBe("P2");
    expect(applyMock.mock.calls[0][3]).toEqual({ force: true });
    expect(result.applied).toEqual([{ planId: "P2", warning: null }]);
  });

  it("rejects a plan that is not a lesson in this plan type", async () => {
    const result = (await call({ fromPlanId: "P4" })) as JsonOut;
    expect(result.status).toBe(400);
    expect(repos.planType.updateLessonTrim).not.toHaveBeenCalled();
  });
});
