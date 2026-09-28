import { detect, suggestBaseline, type LiveSchema, type MigrationFingerprints } from "../MigrationFingerprint";

const prints: MigrationFingerprints[string] = {
  "01_initial": { schemaChanges: 2, checks: [{ kind: "table", table: "plans", present: true }, { kind: "table", table: "planItemTimes", present: true }] },
  "02_data_only": { schemaChanges: 0, checks: [] },
  "03_widen": { schemaChanges: 1, checks: [{ kind: "columnType", table: "plans", column: "name", type: "varchar(255)", nullable: true }] },
  "04_position": { schemaChanges: 1, checks: [{ kind: "column", table: "planItemTimes", column: "positionId", present: true }] },
  "05_drop_old": { schemaChanges: 1, checks: [{ kind: "column", table: "plans", column: "legacy", present: false }] }
};
const names = Object.keys(prints);

const schema = (cols: Record<string, string>, tables = ["plans", "planItemTimes"]): LiveSchema => ({
  tables: new Set(tables),
  columns: new Map(Object.entries(cols).map(([k, t]) => [k, { type: t, nullable: true }])),
  indexes: new Set()
});

describe("detect + suggestBaseline", () => {
  it("prod's #1114 shape: everything applied except the missing column, which stays pending", () => {
    const live = schema({ "plans.name": "varchar(255)" });
    const found = detect(names, prints, live);
    expect(found.map((f) => f.state)).toEqual(["applied", "unknown", "applied", "missing", "applied"]);
    expect(suggestBaseline(found)).toEqual({ names: ["01_initial", "02_data_only", "03_widen", "05_drop_old"] });
  });

  it("a fully migrated database baselines everything", () => {
    const live = schema({ "plans.name": "varchar(255)", "planItemTimes.positionId": "char(11)" });
    expect(suggestBaseline(detect(names, prints, live)).names).toEqual(names);
  });

  it("trailing data-only migrations after the last detected one are left pending", () => {
    const p = { ...prints, "06_data": { schemaChanges: 0, checks: [] } };
    const live = schema({ "plans.name": "varchar(255)", "planItemTimes.positionId": "char(11)" });
    expect(suggestBaseline(detect([...names, "06_data"], p, live)).names).not.toContain("06_data");
  });

  it("a half-applied migration blocks the baseline", () => {
    const p = { ...prints, "01_initial": prints["01_initial"] };
    const live = schema({ "plans.name": "varchar(255)" }, ["plans"]);
    const found = detect(names, p, live);
    expect(found[0].state).toBe("partial");
    expect(found[0].failing).toEqual(["table planItemTimes"]);
    expect(suggestBaseline(found)).toEqual({ names: [], blocked: "Partly applied: 01_initial" });
  });

  it("a column still at its old type counts as missing, not applied", () => {
    const live = schema({ "plans.name": "varchar(100)", "planItemTimes.positionId": "char(11)" });
    expect(detect(names, prints, live)[2].state).toBe("missing");
  });
});
