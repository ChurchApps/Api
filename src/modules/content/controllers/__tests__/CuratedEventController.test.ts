import "reflect-metadata";
import express from "express";
jest.mock("../ContentBaseController", () => ({ ContentBaseController: class { json(obj: unknown, status: number) { return { obj, status }; } } }));
jest.mock("../../helpers/index", () => ({ Permissions: { content: { edit: "contentEdit" } }, CalendarHelper: { addExceptionDates: jest.fn() } }));

import { CuratedEventController } from "../CuratedEventController.js";
import { CuratedEvent } from "../../models/index.js";

const save = (controller: CuratedEventController, body: unknown) => controller.save({ body } as express.Request, {} as express.Response);

function makeController(initial: CuratedEvent[] = []) {
  let rows: CuratedEvent[] = initial.map((r) => ({ churchId: "c1", curatedCalendarId: "cal1", ...r }));
  let nextId = 1;
  const repos = {
    curatedEvent: {
      loadByCuratedCalendarId: jest.fn(async (churchId: string, calId: string) => rows.filter((r) => r.churchId === churchId && r.curatedCalendarId === calId)),
      save: jest.fn(async (ce: CuratedEvent) => { const row = { ...ce, id: ce.id || "new" + nextId++ }; rows.push(row); return row; }),
      delete: jest.fn(async (churchId: string, id: string) => { rows = rows.filter((r) => !(r.churchId === churchId && r.id === id)); })
    }
  };
  const au = { churchId: "c1", checkAccess: () => true };
  const controller = new CuratedEventController();
  Object.assign(controller, {
    repos,
    actionWrapper: (_req: express.Request, _res: express.Response, action: (a: typeof au) => unknown) => action(au)
  });
  return { controller, repos, rows: () => rows };
}

describe("CuratedEventController.save (#1337)", () => {
  it("does not add a single event whose whole group is already on the calendar", async () => {
    const { controller, repos, rows } = makeController([{ id: "g", groupId: "g1", eventId: null }]);
    await save(controller, [{ curatedCalendarId: "cal1", groupId: "g1", eventIds: ["e1"] }]);
    expect(repos.curatedEvent.save).not.toHaveBeenCalled();
    expect(rows()).toHaveLength(1);
  });

  it("does not add the same single event twice", async () => {
    const { controller, rows } = makeController([{ id: "x", groupId: "g1", eventId: "e1" }]);
    await save(controller, [{ curatedCalendarId: "cal1", groupId: "g1", eventIds: ["e1", "e2"] }]);
    expect(rows().map((r) => r.eventId).sort()).toEqual(["e1", "e2"]);
  });

  it("replaces the group's single-event rows when the whole group is added", async () => {
    const { controller, rows } = makeController([{ id: "x", groupId: "g1", eventId: "e1" }, { id: "y", groupId: "g2", eventId: "e9" }]);
    await save(controller, [{ curatedCalendarId: "cal1", groupId: "g1" }]);
    expect(rows().map((r) => [r.groupId, r.eventId ?? null])).toEqual([["g2", "e9"], ["g1", null]]);
  });

  it("does not add a whole group twice", async () => {
    const { controller, repos } = makeController([{ id: "g", groupId: "g1", eventId: null }]);
    await save(controller, [{ curatedCalendarId: "cal1", groupId: "g1" }]);
    expect(repos.curatedEvent.save).not.toHaveBeenCalled();
  });
});
