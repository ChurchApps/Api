import "reflect-metadata";
jest.mock("../ContentBaseController", () => ({ ContentBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("../../helpers/index", () => ({ Permissions: { content: { edit: "contentEdit" } }, CalendarHelper: { addExceptionDates: jest.fn() } }));

import { CuratedEventController } from "../CuratedEventController.js";

function makeController(initial: any[] = []) {
  let rows: any[] = initial.map((r) => ({ churchId: "c1", curatedCalendarId: "cal1", ...r }));
  let nextId = 1;
  const repos: any = {
    curatedEvent: {
      loadByCuratedCalendarId: jest.fn(async (churchId: string, calId: string) => rows.filter((r) => r.churchId === churchId && r.curatedCalendarId === calId)),
      save: jest.fn(async (ce: any) => { const row = { ...ce, id: ce.id || "new" + nextId++ }; rows.push(row); return row; }),
      delete: jest.fn(async (churchId: string, id: string) => { rows = rows.filter((r) => !(r.churchId === churchId && r.id === id)); })
    }
  };
  const au = { churchId: "c1", checkAccess: () => true };
  const controller = new CuratedEventController();
  (controller as any).repos = repos;
  (controller as any).actionWrapper = (_req: any, _res: any, action: any) => action(au);
  return { controller, repos, rows: () => rows };
}

describe("CuratedEventController.save (#1337)", () => {
  it("does not add a single event whose whole group is already on the calendar", async () => {
    const { controller, repos, rows } = makeController([{ id: "g", groupId: "g1", eventId: null }]);
    await (controller as any).save({ body: [{ curatedCalendarId: "cal1", groupId: "g1", eventIds: ["e1"] }] }, {});
    expect(repos.curatedEvent.save).not.toHaveBeenCalled();
    expect(rows()).toHaveLength(1);
  });

  it("does not add the same single event twice", async () => {
    const { controller, rows } = makeController([{ id: "x", groupId: "g1", eventId: "e1" }]);
    await (controller as any).save({ body: [{ curatedCalendarId: "cal1", groupId: "g1", eventIds: ["e1", "e2"] }] }, {});
    expect(rows().map((r) => r.eventId).sort()).toEqual(["e1", "e2"]);
  });

  it("replaces the group's single-event rows when the whole group is added", async () => {
    const { controller, rows } = makeController([{ id: "x", groupId: "g1", eventId: "e1" }, { id: "y", groupId: "g2", eventId: "e9" }]);
    await (controller as any).save({ body: [{ curatedCalendarId: "cal1", groupId: "g1" }] }, {});
    expect(rows().map((r) => [r.groupId, r.eventId ?? null])).toEqual([["g2", "e9"], ["g1", null]]);
  });

  it("does not add a whole group twice", async () => {
    const { controller, repos } = makeController([{ id: "g", groupId: "g1", eventId: null }]);
    await (controller as any).save({ body: [{ curatedCalendarId: "cal1", groupId: "g1" }] }, {});
    expect(repos.curatedEvent.save).not.toHaveBeenCalled();
  });
});
