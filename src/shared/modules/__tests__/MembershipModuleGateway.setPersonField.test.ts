import "reflect-metadata";
import { CompiledQuery, DummyDriver, Kysely, MysqlAdapter, MysqlIntrospector, MysqlQueryCompiler, QueryResult } from "kysely";
import type { DynamicDatabase } from "../../infrastructure/KyselyPool.js";

const getDbMock = jest.fn();
const getReposMock = jest.fn();
jest.mock("../../infrastructure/KyselyPool.js", () => ({ KyselyPool: { getDb: (...args: unknown[]) => getDbMock(...args) } }));
jest.mock("../../infrastructure/RepoManager.js", () => ({ RepoManager: { getRepos: (...args: unknown[]) => getReposMock(...args) } }));
jest.mock("../../webhooks/WebhookDispatcher.js", () => ({ WebhookDispatcher: {} }));
jest.mock("../../../modules/membership/helpers/GdprErasureHelper.js", () => ({ GdprErasureHelper: {} }));
jest.mock("@churchapps/apihelper", () => ({ __esModule: true, UniqueIdHelper: { shortId: () => "newValueId" } }));

import { getMembershipModuleGateway } from "../MembershipModuleGateway.js";
import { PersonFieldValueRepo } from "../../../modules/membership/repositories/PersonFieldValueRepo.js";

interface ValueRow { id: string; churchId: string; personId: string; fieldId: string; value: string }

// Church c1 owns field f1 and person p1; field f2 and person p9 belong to church c2.
const FIELDS = [{ id: "f1", churchId: "c1", name: "Baptized", fieldType: "Yes/No" }, { id: "f2", churchId: "c2", name: "Other church", fieldType: "Textbox" }];
const PEOPLE = [{ id: "p1", churchId: "c1" }, { id: "p9", churchId: "c2" }];

// Answers the selects the gateway and PersonFieldValueRepo run, and records every statement.
function setup(existing: ValueRow[] = []) {
  const queries: { sql: string; parameters: readonly unknown[] }[] = [];
  const driver = new DummyDriver();
  driver.acquireConnection = async () => ({
    executeQuery: async <R>(q: CompiledQuery): Promise<QueryResult<R>> => {
      queries.push({ sql: q.sql, parameters: q.parameters });
      let rows: unknown[] = [];
      if (q.sql.startsWith("select") && q.sql.includes("`people`")) {
        rows = PEOPLE.filter((p) => q.parameters.includes(p.churchId) && q.parameters.includes(p.id));
      } else if (q.sql.startsWith("select") && q.sql.includes("`personFieldValues`")) {
        rows = existing.filter((v) => q.parameters.includes(v.churchId) && q.parameters.includes(v.personId) && q.parameters.includes(v.fieldId));
      }
      return { rows: rows as R[] };
    },
    streamQuery: async function* () {}
  });
  const db = new Kysely<DynamicDatabase>({
    dialect: {
      createAdapter: () => new MysqlAdapter(),
      createDriver: () => driver,
      createIntrospector: (k) => new MysqlIntrospector(k),
      createQueryCompiler: () => new MysqlQueryCompiler()
    }
  });
  getDbMock.mockReturnValue(db);
  const loadField = jest.fn(async (churchId: string, id: string) => FIELDS.find((f) => f.churchId === churchId && f.id === id) ?? null);
  getReposMock.mockResolvedValue({ personField: { load: loadField }, personFieldValue: new PersonFieldValueRepo() });
  const writes = () => queries.filter((q) => !q.sql.startsWith("select"));
  return { queries, writes, loadField };
}

describe("MembershipModuleGateway.setPersonField", () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it("still updates a built-in people column", async () => {
    const { queries, loadField } = setup();
    await getMembershipModuleGateway().setPersonField("c1", "p1", "membershipStatus", "Member");
    expect(queries).toHaveLength(1);
    expect(queries[0].sql).toBe("update `people` set `membershipStatus` = ? where `churchId` = ? and `id` = ?");
    expect(queries[0].parameters).toEqual(["Member", "c1", "p1"]);
    expect(loadField).not.toHaveBeenCalled();
  });

  it("still rejects a field that is not an allowed people column", async () => {
    const { queries } = setup();
    await expect(getMembershipModuleGateway().setPersonField("c1", "p1", "removed", "1")).rejects.toThrow("Invalid person field: removed");
    expect(queries).toHaveLength(0);
  });

  it("inserts a value row the first time a custom field is set", async () => {
    const { writes, loadField } = setup();
    await getMembershipModuleGateway().setPersonField("c1", "p1", "personField_f1", "True");
    expect(loadField).toHaveBeenCalledWith("c1", "f1");
    expect(writes()).toHaveLength(1);
    expect(writes()[0].sql).toContain("insert into `personFieldValues`");
    expect(writes()[0].parameters).toEqual(["newValueId", "c1", "p1", "f1", "True"]);
  });

  it("updates the person's existing row instead of adding a second one", async () => {
    const { writes } = setup([{ id: "v1", churchId: "c1", personId: "p1", fieldId: "f1", value: "False" }]);
    await getMembershipModuleGateway().setPersonField("c1", "p1", "personField_f1", "True");
    expect(writes()).toHaveLength(1);
    expect(writes()[0].sql).toBe("update `personFieldValues` set `personId` = ?, `fieldId` = ?, `value` = ? where `id` = ? and `churchId` = ?");
    expect(writes()[0].parameters).toEqual(["p1", "f1", "True", "v1", "c1"]);
  });

  it("clears the row when the value is blank, as the person edit form does", async () => {
    const { writes } = setup([{ id: "v1", churchId: "c1", personId: "p1", fieldId: "f1", value: "True" }]);
    await getMembershipModuleGateway().setPersonField("c1", "p1", "personField_f1", "");
    expect(writes()).toHaveLength(1);
    expect(writes()[0].sql).toContain("delete from `personFieldValues`");
    expect(writes()[0].parameters).toEqual(["v1", "c1"]);
  });

  it("rejects another church's field id and writes nothing", async () => {
    const { queries, loadField } = setup();
    await expect(getMembershipModuleGateway().setPersonField("c1", "p1", "personField_f2", "x")).rejects.toThrow("Invalid person field: personField_f2");
    expect(loadField).toHaveBeenCalledWith("c1", "f2");
    expect(queries).toHaveLength(0);
  });

  it("rejects an unknown or empty field id and writes nothing", async () => {
    const { queries } = setup();
    await expect(getMembershipModuleGateway().setPersonField("c1", "p1", "personField_missing", "x")).rejects.toThrow("Invalid person field: personField_missing");
    await expect(getMembershipModuleGateway().setPersonField("c1", "p1", "personField_", "x")).rejects.toThrow("Invalid person field: personField_");
    expect(queries).toHaveLength(0);
  });

  it("writes nothing for a person outside the church", async () => {
    const { writes } = setup();
    await getMembershipModuleGateway().setPersonField("c1", "p9", "personField_f1", "True");
    expect(writes()).toHaveLength(0);
  });
});
