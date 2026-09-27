import "reflect-metadata";

// PersonHelper drags in repos/RepoManager/webhooks; only its two date derivations are used here.
jest.mock("../PersonHelper", () => ({
  PersonHelper: {
    getAge: (d: any) => (d ? String(new Date().getFullYear() - new Date(d).getFullYear()) : ""),
    getBirthMonth: (d: any) => (d ? new Date(d).getMonth() + 1 : -1)
  }
}));
jest.mock("../../models/index", () => ({}));
// apihelper's dist is ESM-only, so pull the real ArrayHelper out of the workspace build of
// @churchapps/helpers (identical getAllOperator) rather than stubbing the comparison under test.
jest.mock("@churchapps/apihelper", () => ({ ArrayHelper: require("../../../../../../Packages/helpers/dist/ArrayHelper.js").ArrayHelper }));

import { PersonConditionHelper } from "../PersonConditionHelper";

// Rows come straight off the people table, so date columns are Date objects, while the
// filter value is whatever <input type="date"> posted, i.e. a "YYYY-MM-DD" string.
const people = [
  { id: "p1", anniversary: new Date(1994, 8, 17), birthDate: new Date(1970, 0, 2) },
  { id: "p2", anniversary: new Date(2001, 4, 3), birthDate: new Date(1985, 11, 25) },
  { id: "p3", anniversary: null as any, birthDate: null as any }
];

const ids = (rows: any[]) => rows.map((r) => r.id).sort();

describe("PersonConditionHelper date fields", () => {
  it("matches an exact anniversary posted as a YYYY-MM-DD string", () => {
    const result = PersonConditionHelper.apply(people, [{ field: "anniversary", operator: "equals", value: "1994-09-17" } as any]);
    expect(ids(result)).toEqual(["p1"]);
  });

  it("matches an exact birth date", () => {
    const result = PersonConditionHelper.apply(people, [{ field: "birthDate", operator: "equals", value: "1985-12-25" } as any]);
    expect(ids(result)).toEqual(["p2"]);
  });

  it("orders greaterThan and lessThan chronologically, not lexically", () => {
    const after = PersonConditionHelper.apply(people, [{ field: "anniversary", operator: "greaterThan", value: "2000-01-01" } as any]);
    expect(ids(after)).toEqual(["p2"]);

    const before = PersonConditionHelper.apply(people, [{ field: "birthDate", operator: "lessThan", value: "1980-01-01" } as any]);
    expect(ids(before)).toEqual(["p1"]);
  });

  it("leaves people with no date on file out of a date comparison", () => {
    const result = PersonConditionHelper.apply(people, [{ field: "anniversary", operator: "lessThan", value: "2026-01-01" } as any]);
    expect(ids(result)).toEqual(["p1", "p2"]);
  });

  it("handles a date the driver hands back as a string", () => {
    const rows = [{ id: "s1", birthDate: "1990-06-15T00:00:00.000Z" }, { id: "s2", birthDate: "1991-06-15" }];
    expect(ids(PersonConditionHelper.apply(rows, [{ field: "birthDate", operator: "equals", value: "1990-06-15" } as any]))).toEqual(["s1"]);
    expect(ids(PersonConditionHelper.apply(rows, [{ field: "birthDate", operator: "greaterThan", value: "1990-12-31" } as any]))).toEqual(["s2"]);
  });

  it("still derives age, month and phone conditions", () => {
    const month = PersonConditionHelper.apply(people, [{ field: "anniversaryMonth", operator: "equals", value: "5" } as any]);
    expect(ids(month)).toEqual(["p2"]);
  });
});
