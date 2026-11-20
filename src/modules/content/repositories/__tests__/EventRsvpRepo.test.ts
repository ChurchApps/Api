import "reflect-metadata";
jest.mock("../../db/index", () => ({ getDb: jest.fn() }));
jest.mock("@churchapps/apihelper", () => ({
  UniqueIdHelper: { shortId: () => "gen_id" },
  DateHelper: { toMysqlDate: (d: Date) => new Date(d).toISOString().slice(0, 19).replace("T", " ") }
}));

import { sql, type RawBuilder } from "kysely";
import { getDb } from "../../db/index.js";
import { EventRsvpRepo } from "../EventRsvpRepo.js";

function recordingDb(results: { execute?: unknown; executeTakeFirst?: unknown } = {}) {
  const calls: { method: string; args: unknown[] }[] = [];
  const proxy: Record<string, unknown> = new Proxy({}, {
    get(_t, prop) {
      if (typeof prop === "symbol" || prop === "then") return undefined;
      if (prop === "execute") return async () => results.execute ?? [];
      if (prop === "executeTakeFirst") return async () => results.executeTakeFirst ?? null;
      return (...args: unknown[]) => { calls.push({ method: prop as string, args }); return proxy; };
    }
  });
  return { proxy, calls };
}

const firstArg = (calls: { method: string; args: unknown[] }[], method: string) => calls.find((c) => c.method === method)?.args[0];

describe("EventRsvpRepo upsert", () => {
  afterEach(() => jest.restoreAllMocks());

  const base = { churchId: "c1", eventId: "e1", personId: "p1", occurrenceStart: new Date("2026-08-02T09:00:00Z"), response: "yes" as const };

  it("inserts a new row when no existing response (round-trip, generated id)", async () => {
    const { proxy, calls } = recordingDb({ executeTakeFirst: null });
    (getDb as jest.Mock).mockReturnValue(proxy);
    const saved = await new EventRsvpRepo().save({ ...base });
    expect(saved.id).toBe("gen_id");
    expect(firstArg(calls, "insertInto")).toBe("eventRsvps");
    expect(firstArg(calls, "values")).toMatchObject({ id: "gen_id", eventId: "e1", personId: "p1", response: "yes" });
  });

  it("updates in place (no duplicate) when a response already exists", async () => {
    const { proxy, calls } = recordingDb({ executeTakeFirst: { id: "existing1" } });
    (getDb as jest.Mock).mockReturnValue(proxy);
    const saved = await new EventRsvpRepo().save({ ...base, response: "maybe" });
    expect(saved.id).toBe("existing1");
    expect(calls.some((c) => c.method === "insertInto")).toBe(false);
    expect(firstArg(calls, "updateTable")).toBe("eventRsvps");
    expect(firstArg(calls, "set")).toMatchObject({ response: "maybe" });
  });

  it("deleteOwn scopes by all four natural-key columns", async () => {
    const { proxy, calls } = recordingDb();
    (getDb as jest.Mock).mockReturnValue(proxy);
    await new EventRsvpRepo().deleteOwn("c1", "e1", "p1", base.occurrenceStart);
    expect(firstArg(calls, "deleteFrom")).toBe("eventRsvps");
    // occurrenceStart is compared in its stored string form, so it is passed as sql.ref("occurrenceStart").
    const wheres = calls.filter((c) => c.method === "where").map((c) => (typeof c.args[0] === "string" ? c.args[0] : (c.args[0] as RawBuilder<unknown>).toOperationNode()));
    expect(wheres).toEqual(expect.arrayContaining(["churchId", "eventId", "personId", sql.ref("occurrenceStart").toOperationNode()]));
  });

  it("loadForGroupWindow joins events and filters by groupId + window", async () => {
    const { proxy, calls } = recordingDb({ execute: [] });
    (getDb as jest.Mock).mockReturnValue(proxy);
    await new EventRsvpRepo().loadForGroupWindow("c1", "g1", new Date("2026-08-01"), new Date("2026-09-01"));
    expect(firstArg(calls, "innerJoin")).toBe("events");
    const wheres = calls.filter((c) => c.method === "where").map((c) => c.args[0]);
    expect(wheres).toEqual(expect.arrayContaining(["eventRsvps.churchId", "events.groupId"]));
  });
});
