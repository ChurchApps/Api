jest.mock("@churchapps/apihelper", () => ({ ArrayHelper: { getOne: (arr: any[], key: string, value: any) => arr.find((a) => a[key] === value) } }));

import { ReportResultHelper } from "../ReportResultHelper";

describe("ReportResultHelper.combineResults", () => {
  it("joins each main row to its own related rows by joinConditions", () => {
    const report: any = {
      queries: [
        { keyName: "main", value: [{ groupId: "g1", personId: "p1" }, { groupId: "g2", personId: "p2" }] },
        { keyName: "people", joinConditions: [{ parent: "personId", child: "id" }], value: [{ id: "p1", displayName: "Ann" }, { id: "p2", displayName: "Bob" }] },
        { keyName: "groups", joinConditions: [{ parent: "groupId", child: "id" }], value: [{ id: "g1", groupName: "Choir" }, { id: "g2", groupName: "Youth" }] }
      ]
    };
    const rows = ReportResultHelper.combineResults(report);
    expect(rows[0]).toMatchObject({ "people.displayName": "Ann", "groups.groupName": "Choir", displayName: "Ann", groupName: "Choir", id: "p1" });
    expect(rows[1]).toMatchObject({ "people.displayName": "Bob", "groups.groupName": "Youth", displayName: "Bob", groupName: "Youth", id: "p2" });
  });

  it("leaves main rows untouched by queries without joinConditions", () => {
    const report: any = { queries: [{ keyName: "groups", value: [{ id: "g1" }] }, { keyName: "main", value: [{ week: "2026-01-04", visits: 3 }] }] };
    expect(ReportResultHelper.combineResults(report)).toEqual([{ week: "2026-01-04", visits: 3 }]);
  });
});
