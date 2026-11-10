import fs from "fs";
import path from "path";

describe("daily group attendance report", () => {
  const reportPath = path.join(process.cwd(), "reports", "dailyGroupAttendance.json");
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));

  it("is addressable by its key and renders as a table", () => {
    expect(report.keyName).toBe("dailyGroupAttendance");
    expect(report.outputs?.[0]?.outputType).toBe("table");
  });

  it("has a title with no unfilled placeholder", () => {
    expect(report.displayName).toBe("Group attendance by day");
  });

  it("formats the attendee count as a number", () => {
    expect(report.outputs[0].columns.find((c: any) => c.value === "attendees")?.formatter).toBe("number");
  });
});
