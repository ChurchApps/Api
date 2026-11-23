import "reflect-metadata";

// GET /messaging/reminders/mute returns only the caller's own mutes in the caller's church.
jest.mock("../../../../shared/infrastructure/index", () => ({ BaseController: class { constructor(_module?: string) {} } }));
jest.mock("../../repositories/index", () => ({ Repos: class {} }));
jest.mock("../../../../shared/infrastructure/RepoManager.js", () => ({ RepoManager: { getRepos: jest.fn() } }));
jest.mock("../../../../shared/modules/MembershipModuleGateway.js", () => ({ getMembershipModuleGateway: jest.fn() }));
jest.mock("../../../../shared/helpers/Permissions", () => ({ Permissions: { content: { edit: "contentEdit" }, texting: { send: "textingSend" } } }));
jest.mock("../../helpers/ReminderEngine.js", () => ({ ReminderEngine: {} }));
jest.mock("../../helpers/ReminderAdapter.js", () => ({ ReminderAdapterRegistry: {} }));
jest.mock("../../helpers/ReminderBootstrap.js", () => ({ ensureRemindersReady: jest.fn() }));
jest.mock("../../helpers/TimezoneHelper.js", () => ({ TimezoneHelper: {} }));

import express from "express";
import { ReminderController } from "../ReminderController.js";
import { NotificationEntityMute } from "../../models/index.js";

const rows: NotificationEntityMute[] = [
  { id: "m1", churchId: "c1", personId: "p1", entityType: "group", entityId: "g1", level: "muted" },
  { id: "m2", churchId: "c1", personId: "p1", entityType: "conversation", entityId: "cv1", level: "muted" },
  { id: "m3", churchId: "c1", personId: "p2", entityType: "group", entityId: "g2", level: "muted" },
  { id: "m4", churchId: "c2", personId: "p1", entityType: "group", entityId: "g3", level: "muted" }
];

function makeController(principal: { churchId: string; personId?: string }) {
  const notificationEntityMute = { loadForPerson: jest.fn(async (churchId: string, personId: string) => rows.filter((r) => r.churchId === churchId && r.personId === personId)) };
  const controller = new ReminderController();
  Object.assign(controller, {
    repos: { notificationEntityMute },
    actionWrapper: (_req: express.Request, _res: express.Response, action: (a: unknown) => unknown) => action({ id: "u1", checkAccess: () => false, ...principal }),
    json: (obj: unknown, status: number) => ({ obj, status })
  });
  return { controller, notificationEntityMute };
}

const get = (c: ReminderController, query: Record<string, unknown> = {}) => c.myMutes({ query } as unknown as express.Request, {} as express.Response) as Promise<NotificationEntityMute[]>;

describe("ReminderController GET /mute", () => {
  it("loads by the caller's church and person from the token", async () => {
    const { controller, notificationEntityMute } = makeController({ churchId: "c1", personId: "p1" });
    const result = await get(controller, { personId: "p2", churchId: "c2" });
    expect(notificationEntityMute.loadForPerson).toHaveBeenCalledWith("c1", "p1");
    expect(result.map((m) => m.id)).toEqual(["m1", "m2"]);
  });

  it("never returns another church's rows for the same person", async () => {
    const { controller } = makeController({ churchId: "c2", personId: "p1" });
    expect((await get(controller)).map((m) => m.id)).toEqual(["m4"]);
  });

  it("narrows by entityType", async () => {
    const { controller } = makeController({ churchId: "c1", personId: "p1" });
    expect((await get(controller, { entityType: "group" })).map((m) => m.id)).toEqual(["m1"]);
  });

  it("returns nothing when the caller has no person record", async () => {
    const { controller, notificationEntityMute } = makeController({ churchId: "c1" });
    expect(await get(controller)).toEqual([]);
    expect(notificationEntityMute.loadForPerson).not.toHaveBeenCalled();
  });
});
