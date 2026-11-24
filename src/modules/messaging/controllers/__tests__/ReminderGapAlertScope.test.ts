import "reflect-metadata";

// A plan type keeps its volunteer reminder and its leader gap alert as two separate definitions.
jest.mock("../../../../shared/infrastructure/index", () => ({ BaseController: class { constructor(_module?: string) {} } }));
jest.mock("../../repositories/index", () => ({ Repos: class {} }));
jest.mock("../../../../shared/infrastructure/RepoManager.js", () => ({ RepoManager: { getRepos: jest.fn() } }));
jest.mock("../../../../shared/modules/MembershipModuleGateway.js", () => ({ getMembershipModuleGateway: jest.fn() }));
jest.mock("../../../../shared/helpers/Permissions", () => ({ Permissions: { content: { edit: "contentEdit" }, texting: { send: "textingSend" } } }));
jest.mock("../../helpers/ReminderEngine.js", () => ({ ReminderEngine: { reExpandForScope: jest.fn(async (): Promise<void> => undefined) } }));
jest.mock("../../helpers/ReminderAdapter.js", () => ({ ReminderAdapterRegistry: { get: () => ({ category: "serving_schedule" }), has: () => true } }));
jest.mock("../../helpers/ReminderBootstrap.js", () => ({ ensureRemindersReady: jest.fn() }));
jest.mock("../../helpers/TimezoneHelper.js", () => ({ TimezoneHelper: {} }));

import express from "express";
import { ReminderController } from "../ReminderController.js";
import { ReminderDefinition } from "../../models/index.js";

type SaveReq = Parameters<ReminderController["saveForScope"]>[2];

function makeController(existing: ReminderDefinition[]) {
  const reminderDefinition = {
    loadForScope: jest.fn(async () => existing),
    save: jest.fn(async (d: ReminderDefinition) => ({ ...d, id: d.id || "new" }))
  };
  const controller = new ReminderController();
  Object.assign(controller, {
    repos: { reminderDefinition },
    actionWrapper: (_req: express.Request, _res: express.Response, action: (a: unknown) => unknown) =>
      action({ churchId: "c1", personId: "p1", checkAccess: (perm: string) => perm === "contentEdit" }),
    json: (obj: unknown, status: number) => ({ obj, status })
  });
  return { controller, reminderDefinition };
}

const save = (c: ReminderController, recipientMode: string) =>
  c.saveForScope("plan", "pt1", { body: { offsets: [4320], channels: ["push", "email"], recipientMode } } as SaveReq, {} as express.Response);

describe("ReminderController scope save: volunteer reminder vs leader gap alert", () => {
  const volunteer: ReminderDefinition = { id: "vol", recipientMode: "assignments", channels: "push,email" };
  const gap: ReminderDefinition = { id: "gap", recipientMode: "leaderGaps", channels: "push,email" };

  it("turning on the gap alert creates its own definition instead of overwriting the volunteer reminder", async () => {
    const { controller, reminderDefinition } = makeController([volunteer]);
    await save(controller, "leaderGaps");
    expect(reminderDefinition.save).toHaveBeenCalledWith(expect.objectContaining({ id: undefined, recipientMode: "leaderGaps", scopeId: "pt1" }));
  });

  it("saving the volunteer reminder updates it and leaves the gap alert alone", async () => {
    const { controller, reminderDefinition } = makeController([gap, volunteer]);
    await save(controller, "assignments");
    expect(reminderDefinition.save).toHaveBeenCalledWith(expect.objectContaining({ id: "vol", recipientMode: "assignments" }));
  });

  it("saving the gap alert again updates the same definition", async () => {
    const { controller, reminderDefinition } = makeController([volunteer, gap]);
    await save(controller, "leaderGaps");
    expect(reminderDefinition.save).toHaveBeenCalledWith(expect.objectContaining({ id: "gap" }));
  });
});
