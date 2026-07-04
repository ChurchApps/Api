// Verifies BatchUndoHelper: batch round-trip, conflict guard, op-marker safety,
// multi-touch grouping, and the groupMember onUndo hook.

jest.mock("@churchapps/apihelper", () => ({
  CustomBaseController: class {},
  AuthenticatedUser: class {},
  UniqueIdHelper: { shortId: () => "gen" + Math.random().toString(36).slice(2, 8) }
}));

// In-memory Kysely stand-in operating on a shared table store.
let store: Record<string, any[]> = {};
function match(row: any, conds: any[]) {
  return conds.every((c) => {
    if (c.op === "=") return row[c.col] === c.val;
    if (c.op === "in") return c.val.includes(row[c.col]);
    return true;
  });
}
function builder(table: string, op: string) {
  const conds: any[] = [];
  let payload: any = null;
  const b: any = {
    selectAll: () => b,
    select: () => b,
    set: (o: any) => { payload = o; return b; },
    values: (o: any) => { payload = o; return b; },
    where: (col: any, o: any, val: any) => { conds.push({ col, op: o, val }); return b; },
    execute: async () => {
      const rows = store[table] || (store[table] = []);
      if (op === "select") return rows.filter((r) => match(r, conds)).map((r) => ({ ...r }));
      if (op === "delete") { store[table] = rows.filter((r) => !match(r, conds)); return []; }
      if (op === "update") { rows.forEach((r) => { if (match(r, conds)) Object.assign(r, payload); }); return []; }
      if (op === "insert") { rows.push({ ...payload }); return []; }
      return [];
    },
    executeTakeFirst: async () => {
      const rows = store[table] || [];
      const hit = rows.filter((r) => match(r, conds))[0];
      return hit ? { ...hit } : undefined;
    }
  };
  return b;
}
const fakeDb = {
  selectFrom: (t: string) => builder(t, "select"),
  deleteFrom: (t: string) => builder(t, "delete"),
  updateTable: (t: string) => builder(t, "update"),
  insertInto: (t: string) => builder(t, "insert")
};
jest.mock("../KyselyPool.js", () => ({ KyselyPool: { getDb: () => fakeDb } }));

import { BatchUndoHelper } from "../BatchUndoHelper.js";

function auditRow(over: any, i: number) {
  return { module: "membership", category: over.entityType || "person", created: new Date(2026, 6, 4, 0, 0, i), ...over };
}

function repos(rows: any[], conflictFor: string[] = [], extra: any = {}) {
  const conflictCalls: any[] = [];
  const r: any = {
    auditLog: {
      loadForBatch: async () => rows,
      hasLaterModification: async (_c: string, _m: string, _e: string, entityId: string, after: Date) => {
        conflictCalls.push({ entityId, after });
        return conflictFor.includes(entityId);
      },
      create: async () => {}
    },
    ...extra
  };
  r.__conflictCalls = conflictCalls;
  return r;
}

beforeEach(() => { store = {}; });

describe("BatchUndoHelper round-trip", () => {
  const rows = [
    auditRow({ entityType: "person", action: "person_saved", entityId: "p1", details: JSON.stringify({ op: "update", before: { id: "p1", churchId: "ch1", firstName: "Alice", removed: false }, after: { id: "p1", firstName: "Alicia" } }) }, 1),
    auditRow({ entityType: "person", action: "person_saved", entityId: "p2", details: JSON.stringify({ op: "create", before: null, after: { firstName: "Bob" } }) }, 2),
    auditRow({ entityType: "person", action: "person_deleted", entityId: "p3", details: JSON.stringify({ op: "delete", before: { id: "p3", churchId: "ch1", firstName: "Carol", removed: false }, after: null }) }, 3)
  ];

  it("restores table state to the pre-batch snapshot", async () => {
    // Post-batch state (as the batch left it).
    store.people = [
      { id: "p1", churchId: "ch1", firstName: "Alicia", removed: false },
      { id: "p2", churchId: "ch1", firstName: "Bob", removed: false },
      { id: "p3", churchId: "ch1", firstName: "Carol", removed: true }
    ];
    const result = await BatchUndoHelper.undo(repos(rows), "ch1", { id: "b1" }, "u1");

    expect(result.restored).toBe(3);
    expect(result.skippedConflicts).toHaveLength(0);
    expect(result.failed).toHaveLength(0);
    expect(result.status).toBe("undone");

    expect(store.people).toHaveLength(2);
    expect(store.people.find((p) => p.id === "p1")).toMatchObject({ firstName: "Alice", removed: false });
    expect(store.people.find((p) => p.id === "p3")).toMatchObject({ firstName: "Carol", removed: false });
    expect(store.people.find((p) => p.id === "p2")).toBeUndefined();
  });

  it("skips + reports a row whose entity was modified after the batch", async () => {
    store.people = [
      { id: "p1", churchId: "ch1", firstName: "Alicia", removed: false },
      { id: "p2", churchId: "ch1", firstName: "Bob", removed: false },
      { id: "p3", churchId: "ch1", firstName: "Carol", removed: true }
    ];
    const result = await BatchUndoHelper.undo(repos(rows, ["p3"]), "ch1", { id: "b1" }, "u1");

    expect(result.restored).toBe(2);
    expect(result.skippedConflicts).toEqual([{ entityType: "person", entityId: "p3" }]);
    expect(result.status).toBe("partial");
    expect(store.people.find((p) => p.id === "p3")).toMatchObject({ removed: true });
  });
});

describe("BatchUndoHelper op-marker safety", () => {
  it("fails (never deletes) a _saved row with no before-image and no op marker", async () => {
    store.people = [{ id: "p1", churchId: "ch1", firstName: "Alicia", removed: false }];
    const rows = [auditRow({ entityType: "person", action: "person_saved", entityId: "p1", details: JSON.stringify({ before: null, after: { firstName: "Alicia" } }) }, 1)];
    const result = await BatchUndoHelper.undo(repos(rows), "ch1", { id: "b1" }, "u1");

    expect(result.restored).toBe(0);
    expect(result.failed).toEqual([{ entityType: "person", entityId: "p1", reason: "no before-image" }]);
    expect(result.status).toBe("partial");
    expect(store.people).toHaveLength(1);
  });
});

describe("BatchUndoHelper multi-touch entities", () => {
  it("restores an entity updated twice to its original state with no spurious conflict", async () => {
    store.people = [{ id: "p1", churchId: "ch1", firstName: "Carl", removed: false }];
    const rows = [
      auditRow({ entityType: "person", action: "person_saved", entityId: "p1", details: JSON.stringify({ op: "update", before: { id: "p1", churchId: "ch1", firstName: "Alice", removed: false }, after: { firstName: "Bob" } }) }, 1),
      auditRow({ entityType: "person", action: "person_saved", entityId: "p1", details: JSON.stringify({ op: "update", before: { id: "p1", churchId: "ch1", firstName: "Bob", removed: false }, after: { firstName: "Carl" } }) }, 2)
    ];
    const r = repos(rows);
    const result = await BatchUndoHelper.undo(r, "ch1", { id: "b1" }, "u1");

    expect(result.restored).toBe(1);
    expect(result.skippedConflicts).toHaveLength(0);
    expect(result.status).toBe("undone");
    expect(store.people).toHaveLength(1);
    expect(store.people[0]).toMatchObject({ firstName: "Alice" });
    // conflict guard runs once per entity, against the LATEST touch's created time.
    expect(r.__conflictCalls).toHaveLength(1);
    expect(r.__conflictCalls[0].after).toEqual(rows[1].created);
  });

  it("deletes an entity created then updated in the same batch", async () => {
    store.people = [{ id: "p1", churchId: "ch1", firstName: "Bobby", removed: false }];
    const rows = [
      auditRow({ entityType: "person", action: "person_saved", entityId: "p1", details: JSON.stringify({ op: "create", before: null, after: { firstName: "Bob" } }) }, 1),
      auditRow({ entityType: "person", action: "person_saved", entityId: "p1", details: JSON.stringify({ op: "update", before: { id: "p1", churchId: "ch1", firstName: "Bob", removed: false }, after: { firstName: "Bobby" } }) }, 2)
    ];
    const result = await BatchUndoHelper.undo(repos(rows), "ch1", { id: "b1" }, "u1");

    expect(result.restored).toBe(1);
    expect(result.status).toBe("undone");
    expect(store.people).toHaveLength(0);
  });

  it("restores via insert an entity updated then hard-deleted in the same batch", async () => {
    store.people = [];
    const rows = [
      auditRow({ entityType: "person", action: "person_saved", entityId: "p1", details: JSON.stringify({ op: "update", before: { id: "p1", churchId: "ch1", firstName: "Alice", removed: false }, after: { firstName: "Bob" } }) }, 1),
      auditRow({ entityType: "person", action: "person_deleted", entityId: "p1", details: JSON.stringify({ op: "delete", before: { id: "p1", churchId: "ch1", firstName: "Bob", removed: false }, after: null }) }, 2)
    ];
    const result = await BatchUndoHelper.undo(repos(rows), "ch1", { id: "b1" }, "u1");

    expect(result.restored).toBe(1);
    expect(result.status).toBe("undone");
    expect(store.people).toHaveLength(1);
    expect(store.people[0]).toMatchObject({ id: "p1", firstName: "Alice", removed: false });
  });
});

describe("BatchUndoHelper groupMember onUndo hook", () => {
  it("writes groupMemberHistory 'left' when undoing an add", async () => {
    const history: any[] = [];
    const r = repos(
      [auditRow({ entityType: "groupMember", action: "groupMember_saved", entityId: "per1", details: JSON.stringify({ op: "create", before: null, after: { groupId: "grp1" } }) }, 1)],
      [],
      { groupMemberHistory: { log: async (_c: string, g: string, p: string, a: string) => history.push({ g, p, a }) }, groupMember: { save: async () => ({}) } }
    );
    const result = await BatchUndoHelper.undo(r, "ch1", { id: "b1" }, "u1");
    expect(result.restored).toBe(1);
    expect(history).toEqual([{ g: "grp1", p: "per1", a: "left" }]);
  });

  it("re-adds the member + writes 'joined' when undoing a remove", async () => {
    const history: any[] = [];
    const saved: any[] = [];
    const r = repos(
      [auditRow({ entityType: "groupMember", action: "groupMember_deleted", entityId: "per1", details: JSON.stringify({ op: "delete", before: null, after: { groupId: "grp1" } }) }, 1)],
      [],
      { groupMemberHistory: { log: async (_c: string, g: string, p: string, a: string) => history.push({ g, p, a }) }, groupMember: { save: async (m: any) => { saved.push(m); return m; } } }
    );
    const result = await BatchUndoHelper.undo(r, "ch1", { id: "b1" }, "u1");
    expect(result.restored).toBe(1);
    expect(saved).toEqual([{ churchId: "ch1", groupId: "grp1", personId: "per1", leader: false }]);
    expect(history).toEqual([{ g: "grp1", p: "per1", a: "joined" }]);
  });
});
