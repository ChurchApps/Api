import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { firstExisting, listMigrationFiles } from "../MigrationFiles";

describe("listMigrationFiles", () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "migrations-")); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  const touch = (...names: string[]) => names.forEach((n) => fs.writeFileSync(path.join(dir, n), ""));

  it("names compiled files the same as their sources, oldest first", () => {
    touch("2026-09-20_b.js", "2026-08-01_a.js");
    expect(listMigrationFiles(dir).map((m) => m.name)).toEqual(["2026-08-01_a", "2026-09-20_b"]);
  });

  it("skips declarations, source maps and specs", () => {
    touch("2026-09-20_b.ts", "2026-09-20_b.d.ts", "2026-09-20_b.js.map", "2026-09-20_b.spec.ts", "README.md");
    expect(listMigrationFiles(dir).map((m) => m.name)).toEqual(["2026-09-20_b"]);
  });

  it("returns nothing for a module with no folder", () => {
    expect(listMigrationFiles(path.join(dir, "nope"))).toEqual([]);
  });

  it("firstExisting picks the compiled root before the source root", () => {
    const compiled = path.join(dir, "compiled");
    fs.mkdirSync(compiled);
    expect(firstExisting([compiled, dir])).toBe(compiled);
    expect(firstExisting([path.join(dir, "missing"), dir])).toBe(dir);
    expect(firstExisting([path.join(dir, "missing")])).toBeNull();
  });
});
