import "reflect-metadata";

// Cut the infrastructure bootstrap PersonHelper drags in; the date cases never reach ArrayHelper.
jest.mock("../../../../shared/infrastructure/index.js", () => ({ RepoManager: { getRepos: jest.fn() } }));
jest.mock("../../../../shared/helpers/index.js", () => ({ Permissions: {} }));
jest.mock("../SsoHelper.js", () => ({ SsoHelper: {} }));
jest.mock("../../../../shared/webhooks/WebhookDispatcher.js", () => ({ WebhookDispatcher: {} }));
jest.mock("@churchapps/apihelper", () => ({
  __esModule: true,
  PersonHelper: class {},
  ArrayHelper: {
    getAllOperator: (data: any[], field: string, value: string) => data.filter((r) => String(r[field]) === String(value)),
    getAllOperatorArray: (data: any[]) => data,
    getUnique: (data: any[]) => data
  }
}));

import { PersonConditionHelper } from "../PersonConditionHelper.js";

// Rows as mysql2 returns them for datetime columns: Date objects at local midnight.
const people = [
  { id: "p1", anniversary: new Date(1994, 8, 17), birthDate: new Date(1970, 0, 1) },
  { id: "p2", anniversary: new Date(2001, 5, 30), birthDate: new Date(1985, 11, 31) },
  { id: "p3", anniversary: null, birthDate: undefined },
  { id: "p4", anniversary: "1994-09-17T00:00:00.000Z", birthDate: "2000-02-29" }
];

const ids = (rows: any[]) => rows.map((r) => r.id);

describe("PersonConditionHelper date fields (birthDate, anniversary)", () => {
  it("equals matches the calendar date the picker sends, not the Date's string form", () => {
    const rows = PersonConditionHelper.applyOne(people, { field: "anniversary", operator: "equals", value: "1994-09-17" } as any);
    expect(ids(rows)).toEqual(["p1", "p4"]);
  });

  it("greaterThan and lessThan order by calendar date", () => {
    expect(ids(PersonConditionHelper.applyOne(people, { field: "birthDate", operator: "greaterThan", value: "1984-01-01" } as any))).toEqual(["p2", "p4"]);
    expect(ids(PersonConditionHelper.applyOne(people, { field: "anniversary", operator: "lessThan", value: "2000-01-01" } as any))).toEqual(["p1", "p4"]);
  });

  it("people without the date never match, and an unparsable condition matches nobody", () => {
    expect(ids(PersonConditionHelper.applyOne(people, { field: "birthDate", operator: "lessThan", value: "2100-01-01" } as any))).toEqual(["p1", "p2", "p4"]);
    expect(PersonConditionHelper.applyOne(people, { field: "anniversary", operator: "equals", value: "not a date" } as any)).toEqual([]);
  });

  it("leaves other fields on the generic path", () => {
    const rows = PersonConditionHelper.applyOne([{ id: "a", gender: "Male" }, { id: "b", gender: "Female" }], { field: "gender", operator: "equals", value: "Male" } as any);
    expect(ids(rows)).toEqual(["a"]);
  });
});
