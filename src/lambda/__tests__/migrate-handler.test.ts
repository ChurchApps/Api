const run = jest.fn();

jest.mock("../../shared/helpers/Environment.js", () => ({ Environment: { currentEnvironment: "test", init: jest.fn() } }));
jest.mock("../../shared/helpers/MigrationRunner.js", () => ({ MigrationRunner: { run: (...args: unknown[]) => run(...args) } }));
jest.mock("../../shared/helpers/MigrationFiles.js", () => ({ MIGRATION_MODULES: ["membership", "attendance"] }));

import { handleMigrate } from "../migrate-handler";

describe("handleMigrate", () => {
  beforeEach(() => {
    run.mockReset();
    jest.spyOn(console, "log").mockImplementation(() => undefined);
    jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("runs every module in order and reports ok when none failed", async () => {
    run.mockImplementation(async (module: string) => ({ module, applied: module === "attendance" ? ["2026-10-15_session_notes"] : [] }));
    const result = await handleMigrate();
    expect(run.mock.calls.map((c) => c[0])).toEqual(["membership", "attendance"]);
    expect(result.ok).toBe(true);
    expect(result.environment).toBe("test");
    expect(result.modules[1].applied).toEqual(["2026-10-15_session_notes"]);
  });

  it("keeps going after a failure but reports not ok", async () => {
    run.mockImplementation(async (module: string) =>
      module === "membership" ? { module, applied: [], failed: "2026-10-01_bad", error: "Duplicate column" } : { module, applied: [] });
    const result = await handleMigrate();
    expect(run).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(false);
  });

  it("treats a refused module (no migration history) as a failure", async () => {
    run.mockImplementation(async (module: string) => ({ module, applied: [], error: "No migration history in this database" }));
    expect((await handleMigrate()).ok).toBe(false);
  });
});
