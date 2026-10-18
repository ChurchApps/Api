import "reflect-metadata";

// Texting volunteers and groups needs texting.send; reminder definitions must not be a way around it.
jest.mock("../../../../shared/infrastructure/index", () => ({ BaseController: class { constructor(_module?: string) {} } }));
jest.mock("../../repositories/index", () => ({ Repos: class {} }));
jest.mock("../../../../shared/infrastructure/RepoManager.js", () => ({ RepoManager: { getRepos: jest.fn() } }));
jest.mock("../../../../shared/modules/MembershipModuleGateway.js", () => ({ getMembershipModuleGateway: jest.fn() }));
jest.mock("../../../../shared/helpers/Permissions", () => ({ Permissions: { content: { edit: "contentEdit" }, texting: { send: "textingSend" } } }));
jest.mock("../../helpers/ReminderEngine.js", () => ({ ReminderEngine: { reExpandForEntity: jest.fn(async () => undefined), reExpandForScope: jest.fn(async () => undefined) } }));
jest.mock("../../helpers/ReminderAdapter.js", () => ({ ReminderAdapterRegistry: { get: () => ({ category: "eventReminder" }), has: () => true } }));
jest.mock("../../helpers/ReminderBootstrap.js", () => ({ ensureRemindersReady: jest.fn() }));
jest.mock("../../helpers/TimezoneHelper.js", () => ({ TimezoneHelper: {} }));

import { ReminderController } from "../ReminderController.js";

const principal = (access: string[]) => ({ id: "u1", churchId: "c1", personId: "p1", checkAccess: (perm: any) => access.includes(perm) });

function makeController(access: string[], existing: any[] = []) {
  const reminderDefinition = {
    loadForEntity: jest.fn(async () => existing),
    loadForScope: jest.fn(async () => existing),
    save: jest.fn(async (d: any) => ({ ...d, id: d.id || "def1" }))
  };
  const controller = new ReminderController();
  (controller as any).repos = { reminderDefinition };
  (controller as any).actionWrapper = (_req: any, _res: any, action: any) => action(principal(access));
  (controller as any).json = (obj: any, status: number) => ({ obj, status });
  return { controller, reminderDefinition };
}

const call = (c: any, route: "entity" | "scope", channels: any) => route === "entity"
  ? c.saveForEntity("event", "e1", { body: { offsets: [60], channels } }, {})
  : c.saveForScope("plan", "pt1", { body: { offsets: [60], channels } }, {});

describe.each(["entity", "scope"] as const)("ReminderController %s save with the sms channel", (route) => {
  it("refuses content.edit without texting.send", async () => {
    const { controller, reminderDefinition } = makeController(["contentEdit"]);
    expect((await call(controller, route, ["push", "sms"])).status).toBe(401);
    expect(reminderDefinition.save).not.toHaveBeenCalled();
  });

  it("refuses a comma-separated sms channel too", async () => {
    const { controller, reminderDefinition } = makeController(["contentEdit"]);
    expect((await call(controller, route, "email, sms")).status).toBe(401);
    expect(reminderDefinition.save).not.toHaveBeenCalled();
  });

  it("saves when the caller can send texts", async () => {
    const { controller, reminderDefinition } = makeController(["contentEdit", "textingSend"]);
    await call(controller, route, ["sms"]);
    expect(reminderDefinition.save).toHaveBeenCalledWith(expect.objectContaining({ channels: "sms" }));
  });

  it("lets content.edit re-save a definition that already texts", async () => {
    const { controller, reminderDefinition } = makeController(["contentEdit"], [{ id: "def1", channels: "push,sms" }]);
    await call(controller, route, ["push", "sms"]);
    expect(reminderDefinition.save).toHaveBeenCalled();
  });

  it("leaves push and email alone", async () => {
    const { controller, reminderDefinition } = makeController(["contentEdit"]);
    await call(controller, route, ["push", "email"]);
    expect(reminderDefinition.save).toHaveBeenCalled();
  });
});
