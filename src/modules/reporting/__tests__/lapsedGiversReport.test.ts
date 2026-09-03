import fs from "fs";
import path from "path";

describe("lapsedGivers report", () => {
  const reportPath = path.join(process.cwd(), "reports", "lapsedGivers.json");
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  const sql = (report.queries?.[0]?.sqlLines || []).join("\n");

  it("exists with keyName lapsedGivers", () => {
    expect(fs.existsSync(reportPath)).toBe(true);
    expect(report.keyName).toBe("lapsedGivers");
  });

  it("runs against the giving db", () => {
    expect(report.queries?.[0]?.db).toBe("giving");
  });

  it("selects gifts in the previous window that have no gift in the current window", () => {
    expect(sql).toMatch(/donationDate between :prevstart and :prevend/i);
    expect(sql).toMatch(/donationDate between :currstart and :currend/i);
    expect(sql).toMatch(/not in/i);
  });

  it("excludes anonymous donations", () => {
    expect(sql).toMatch(/personId is not null/i);
  });

  it("requires the donations View permission", () => {
    const actions = (report.permissions || []).flatMap((p: any) => p.requireOne.map((r: any) => r.action));
    expect(actions).toContain("View");
  });

  it("outputs person, last gift date and previous total", () => {
    const columns = report.outputs?.[0]?.columns || [];
    const values = columns.map((c: any) => c.value);
    expect(values).toEqual(["personId", "lastGiftDate", "previousTotal"]);
    expect(columns.find((c: any) => c.value === "personId").formatter).toBe("person");
  });
});
