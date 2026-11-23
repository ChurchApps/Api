import "reflect-metadata";

// PersonHelper drags in repos/RepoManager/webhooks; only its two date derivations are used here.
jest.mock("../PersonHelper", () => ({
  PersonHelper: {
    getAge: (d: Date | string) => (d ? String(new Date().getFullYear() - new Date(d).getFullYear()) : ""),
    getBirthMonth: (d: Date | string) => (d ? new Date(d).getMonth() + 1 : -1)
  }
}));
jest.mock("../../models/index", () => ({}));
// apihelper's dist is ESM-only, so pull the real ArrayHelper out of the workspace build of
// @churchapps/helpers (identical getAllOperator) rather than stubbing the comparison under test.
jest.mock("@churchapps/apihelper", () => ({ ArrayHelper: require("../../../../../../Packages/helpers/dist/ArrayHelper.js").ArrayHelper }));

import { PersonConditionHelper } from "../PersonConditionHelper";
import type { PersonConditionRow } from "../PersonConditionHelper.js";
import type { SearchCondition } from "../../models/index.js";

// Rows come straight off the people table, so date columns are Date objects, while the
// filter value is whatever <input type="date"> posted, i.e. a "YYYY-MM-DD" string.
const people = [
  { id: "p1", anniversary: new Date(1994, 8, 17), birthDate: new Date(1970, 0, 2) },
  { id: "p2", anniversary: new Date(2001, 4, 3), birthDate: new Date(1985, 11, 25) },
  { id: "p3", anniversary: null, birthDate: null }
];

const ids = (rows: PersonConditionRow[]) => rows.map((r) => r.id).sort();

describe("PersonConditionHelper date fields", () => {
  it("matches an exact anniversary posted as a YYYY-MM-DD string", () => {
    const result = PersonConditionHelper.apply(people, [{ field: "anniversary", operator: "equals", value: "1994-09-17" } as SearchCondition]);
    expect(ids(result)).toEqual(["p1"]);
  });

  it("matches an exact birth date", () => {
    const result = PersonConditionHelper.apply(people, [{ field: "birthDate", operator: "equals", value: "1985-12-25" } as SearchCondition]);
    expect(ids(result)).toEqual(["p2"]);
  });

  it("orders greaterThan and lessThan chronologically, not lexically", () => {
    const after = PersonConditionHelper.apply(people, [{ field: "anniversary", operator: "greaterThan", value: "2000-01-01" } as SearchCondition]);
    expect(ids(after)).toEqual(["p2"]);

    const before = PersonConditionHelper.apply(people, [{ field: "birthDate", operator: "lessThan", value: "1980-01-01" } as SearchCondition]);
    expect(ids(before)).toEqual(["p1"]);
  });

  it("leaves people with no date on file out of a date comparison", () => {
    const result = PersonConditionHelper.apply(people, [{ field: "anniversary", operator: "lessThan", value: "2026-01-01" } as SearchCondition]);
    expect(ids(result)).toEqual(["p1", "p2"]);
  });

  it("handles a date the driver hands back as a string", () => {
    const rows = [{ id: "s1", birthDate: "1990-06-15T00:00:00.000Z" }, { id: "s2", birthDate: "1991-06-15" }];
    expect(ids(PersonConditionHelper.apply(rows, [{ field: "birthDate", operator: "equals", value: "1990-06-15" } as SearchCondition]))).toEqual(["s1"]);
    expect(ids(PersonConditionHelper.apply(rows, [{ field: "birthDate", operator: "greaterThan", value: "1990-12-31" } as SearchCondition]))).toEqual(["s2"]);
  });

  it("still derives age, month and phone conditions", () => {
    const month = PersonConditionHelper.apply(people, [{ field: "anniversaryMonth", operator: "equals", value: "5" } as SearchCondition]);
    expect(ids(month)).toEqual(["p2"]);
  });
});

describe("PersonConditionHelper dateAdded and lastDays", () => {
  const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d; };
  const rows = [
    { id: "new", dateAdded: daysAgo(3), birthDate: daysAgo(10) },
    { id: "old", dateAdded: daysAgo(90), birthDate: daysAgo(400) },
    { id: "legacy", dateAdded: null, birthDate: null }
  ];

  it("filters dateAdded with before / after like the other date fields", () => {
    const cutoff = toDateOnly(daysAgo(30));
    expect(ids(PersonConditionHelper.apply(rows, [{ field: "dateAdded", operator: "greaterThan", value: cutoff } as SearchCondition]))).toEqual(["new"]);
    expect(ids(PersonConditionHelper.apply(rows, [{ field: "dateAdded", operator: "lessThan", value: cutoff } as SearchCondition]))).toEqual(["old"]);
  });

  it("matches people added in the last N days, leaving out undated people", () => {
    expect(ids(PersonConditionHelper.apply(rows, [{ field: "dateAdded", operator: "lastDays", value: "30" } as SearchCondition]))).toEqual(["new"]);
    expect(ids(PersonConditionHelper.apply(rows, [{ field: "dateAdded", operator: "lastDays", value: "120" } as SearchCondition]))).toEqual(["new", "old"]);
  });

  it("supports lastDays on other date fields too", () => {
    expect(ids(PersonConditionHelper.apply(rows, [{ field: "birthDate", operator: "lastDays", value: "30" } as SearchCondition]))).toEqual(["new"]);
  });

  it("matches nothing for a non-numeric day count", () => {
    expect(PersonConditionHelper.apply(rows, [{ field: "dateAdded", operator: "lastDays", value: "abc" } as SearchCondition])).toEqual([]);
  });
});

function toDateOnly(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

describe("PersonConditionHelper list operators", () => {
  const rows = [
    { id: "m1", membershipStatus: "Member", campusId: "c1" },
    { id: "m2", membershipStatus: "Regular Attendee", campusId: "c2" },
    { id: "m3", membershipStatus: "Visitor", campusId: "c1" },
    { id: "m4", membershipStatus: null as string | null, campusId: "c1" }
  ];

  it("matches any of several membership statuses", () => {
    expect(ids(PersonConditionHelper.apply(rows, [{ field: "membershipStatus", operator: "in", value: "Member,Regular Attendee" } as SearchCondition]))).toEqual(["m1", "m2"]);
  });

  it("leaves out every listed status, keeping people with no status", () => {
    expect(ids(PersonConditionHelper.apply(rows, [{ field: "membershipStatus", operator: "notIn", value: "Visitor" } as SearchCondition]))).toEqual(["m1", "m2", "m4"]);
  });

  it("ignores case and spaces around list values", () => {
    expect(ids(PersonConditionHelper.apply(rows, [{ field: "membershipStatus", operator: "in", value: "member, regular attendee" } as SearchCondition]))).toEqual(["m1", "m2"]);
  });

  it("treats the UI's notEquals as not equal", () => {
    expect(ids(PersonConditionHelper.apply(rows, [{ field: "campusId", operator: "notEquals", value: "c1" } as SearchCondition]))).toEqual(["m2"]);
  });

  it("excludes the whole id list for notIn", () => {
    expect(ids(PersonConditionHelper.apply(rows, [{ field: "id", operator: "notIn", value: "m1,m2" } as SearchCondition]))).toEqual(["m3", "m4"]);
  });
});

describe("PersonConditionHelper this month", () => {
  it("resolves the month in the church's time zone", () => {
    const now = new Date("2026-12-01T03:00:00Z");
    expect(PersonConditionHelper.resolveMonth("thisMonth", "America/Chicago", now)).toBe("11");
    expect(PersonConditionHelper.resolveMonth("thisMonth", "Europe/London", now)).toBe("12");
    expect(PersonConditionHelper.resolveMonth("5", "America/Chicago", now)).toBe("5");
  });

  it("matches birth and anniversary months against the current month", () => {
    const month = parseInt(PersonConditionHelper.resolveMonth("thisMonth", "UTC"), 10);
    const rows = [
      { id: "now", birthDate: new Date(1990, month - 1, 15), anniversary: new Date(2010, month - 1, 15) },
      { id: "later", birthDate: new Date(1990, month % 12, 15), anniversary: new Date(2010, month % 12, 15) }
    ];
    expect(ids(PersonConditionHelper.apply(rows, [{ field: "birthMonth", operator: "equals", value: "thisMonth" } as SearchCondition], "UTC"))).toEqual(["now"]);
    expect(ids(PersonConditionHelper.apply(rows, [{ field: "anniversaryMonth", operator: "equals", value: "thisMonth" } as SearchCondition], "UTC"))).toEqual(["now"]);
  });
});
