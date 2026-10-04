import fs from "fs";
import path from "path";

describe("attendanceTrend report", () => {
  const reportPath = path.join(process.cwd(), "reports", "attendanceTrend.json");
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  const main = report.queries.find((q: any) => q.keyName === "main");
  const sql = (main?.sqlLines || []).join("\n");
  const param = (keyName: string) => report.parameters.find((p: any) => p.keyName === keyName);
  const output = (outputType: string) => report.outputs.find((o: any) => o.outputType === outputType);

  it("has Start Date and End Date filters", () => {
    expect(param("startDate")).toMatchObject({ displayName: "Start Date", source: "date", defaultValue: "lastYear" });
    expect(param("endDate")).toMatchObject({ displayName: "End Date", source: "date", defaultValue: "today" });
  });

  it("limits visits to the selected date range", () => {
    expect(sql).toMatch(/v\.visitDate >= :startDate/);
    expect(sql).toMatch(/v\.visitDate < DATE_ADD\(:endDate, INTERVAL 1 DAY\)/);
  });

  it("lists the distinct session dates in each week", () => {
    expect(sql).toMatch(/GROUP_CONCAT\(DISTINCT DATE_FORMAT\(v\.visitDate.*\) AS sessionDates/);
    expect(output("table").columns.map((c: any) => c.value)).toEqual(["week", "visits", "sessionDates"]);
  });

  it("keeps the bar chart as Week / Visits", () => {
    expect(output("barChart").columns.map((c: any) => c.value)).toEqual(["week", "visits"]);
  });
});
