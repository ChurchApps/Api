import fs from "fs";
import path from "path";
import { GroupAttendanceDownloadHelper } from "../helpers/GroupAttendanceDownloadHelper";

const loadReport = (keyName: string) => JSON.parse(fs.readFileSync(path.join(process.cwd(), "reports", keyName + ".json"), "utf8"));

describe("group attendance reports", () => {
  ["groupAttendance", "groupAttendanceDownload"].forEach((keyName) => {
    const report = loadReport(keyName);
    const sql = (report.queries?.[0]?.sqlLines || []).join("\n");

    it(`${keyName} takes a start and end date instead of a single week`, () => {
      const keys = report.parameters.map((p: any) => p.keyName);
      expect(keys).toEqual(expect.arrayContaining(["startDate", "endDate"]));
      expect(keys).not.toContain("week");
      expect(report.parameters.find((p: any) => p.keyName === "startDate")).toMatchObject({ source: "date", defaultValue: "lastSunday" });
      expect(report.parameters.find((p: any) => p.keyName === "endDate")).toMatchObject({ source: "date", defaultValue: "today" });
    });

    it(`${keyName} filters sessions from startDate through the whole endDate`, () => {
      expect(sql).toMatch(/s\.sessionDate >= :startDate AND s\.sessionDate < DATE_ADD\(:endDate, INTERVAL 1 DAY\)/);
      expect(sql).toMatch(/DATE_FORMAT\(s\.sessionDate, '%Y-%m-%d'\) as sessionDate/);
      expect(sql).not.toMatch(/:week/);
    });
  });
});

describe("GroupAttendanceDownloadHelper.combine", () => {
  const buildReport = () => ({
    queries: [
      {
        keyName: "main",
        value: [
          { serviceName: "Sunday", serviceTimeName: "9:00 AM", serviceId: "s1", serviceTimeId: "t1", groupId: "g1", personId: "p1", sessionDate: "2024-03-09" },
          { serviceName: "Sunday", serviceTimeName: "9:00 AM", serviceId: "s1", serviceTimeId: "t1", groupId: "g1", personId: "p2", sessionDate: "2024-03-16" },
          { serviceName: "Sunday", serviceTimeName: "9:00 AM", serviceId: "s1", serviceTimeId: "t1", groupId: "g1", personId: "p1", sessionDate: "2024-03-16" }
        ]
      },
      { keyName: "groups", value: [{ id: "g2", groupName: "Youth" }, { id: "g1", groupName: "Choir" }] },
      { keyName: "groupMembers", value: [{ groupId: "g1", personId: "p2" }, { groupId: "g1", personId: "p1" }, { groupId: "g2", personId: "p1" }] },
      { keyName: "people", value: [{ id: "p1", displayName: "Ann" }, { id: "p2", displayName: "Bob" }] }
    ]
  });

  it("gives each dated session of a service time its own column", () => {
    const rows = GroupAttendanceDownloadHelper.combine(buildReport() as any);
    expect(Object.keys(rows[0])).toEqual(["displayName", "groupName", "Sunday - 9:00 AM (2024-03-09)", "Sunday - 9:00 AM (2024-03-16)", "personId", "groupId"]);
  });

  it("marks present/absent per session date", () => {
    const rows = GroupAttendanceDownloadHelper.combine(buildReport() as any);
    const bob = rows.find((r: any) => r.displayName === "Bob" && r.groupName === "Choir");
    expect(bob["Sunday - 9:00 AM (2024-03-09)"]).toBe("absent");
    expect(bob["Sunday - 9:00 AM (2024-03-16)"]).toBe("present");
    const annYouth = rows.find((r: any) => r.displayName === "Ann" && r.groupName === "Youth");
    expect(annYouth["Sunday - 9:00 AM (2024-03-09)"]).toBe("absent");
  });

  it("sorts rows by group, then name", () => {
    const rows = GroupAttendanceDownloadHelper.combine(buildReport() as any);
    expect(rows.map((r: any) => r.groupName + "/" + r.displayName)).toEqual(["Choir/Ann", "Choir/Bob", "Youth/Ann"]);
  });
});
