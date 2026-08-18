import fs from "fs";
import path from "path";

describe("anniversaries report", () => {
  const reportPath = path.join(process.cwd(), "reports", "anniversaries.json");
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  const sql = (report.queries?.[0]?.sqlLines || []).join("\n");

  it("exists with keyName anniversaries", () => {
    expect(fs.existsSync(reportPath)).toBe(true);
    expect(report.keyName).toBe("anniversaries");
  });

  it("filters on p.anniversary rather than birthDate", () => {
    expect(sql).toMatch(/p\.anniversary is not null/i);
    expect(sql).toMatch(/month\(p\.anniversary\) = :month/i);
    expect(sql).not.toMatch(/birthDate/i);
  });
});
