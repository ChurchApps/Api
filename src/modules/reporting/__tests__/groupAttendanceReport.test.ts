import fs from "fs";
import path from "path";

describe("group attendance report", () => {
  const reportPath = path.join(process.cwd(), "reports", "groupAttendance.json");
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  const querySql = (keyName: string) => (report.queries.find((q: any) => q.keyName === keyName)?.sqlLines || []).join("\n");
  const columns = report.outputs[0].columns;

  it("selects the visit check-in time", () => {
    expect(querySql("main")).toMatch(/v\.checkinTime/);
  });

  it("selects each person's membership status", () => {
    expect(querySql("people")).toMatch(/membershipStatus/);
  });

  it("outputs Checked In and Membership Status columns after Person", () => {
    expect(columns.map((c: any) => c.header)).toEqual(["Session Date", "Service Time", "Group", "Person", "Checked In", "Membership Status"]);
    expect(columns.find((c: any) => c.value === "checkinTime")?.formatter).toBe("time");
    expect(columns.find((c: any) => c.value === "people.membershipStatus")?.formatter).toBe("string");
  });

  it("keeps the session, service time and group groupings", () => {
    expect(report.outputs[0].groupings).toEqual([1, 1, 1]);
  });
});
