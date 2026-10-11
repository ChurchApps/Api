import "reflect-metadata";
jest.mock("../../db/index", () => ({ getDb: jest.fn() }));
jest.mock("@churchapps/apihelper", () => ({ UniqueIdHelper: { shortId: () => "gen_id" } }));

import { DummyDriver, Kysely, MysqlAdapter, MysqlIntrospector, MysqlQueryCompiler } from "kysely";
import { BibleVerseTextRepo } from "../BibleVerseTextRepo.js";

const verses = (chapter: number, from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => ({ chapterNumber: chapter, verseNumber: from + i })) as any[];

describe("BibleVerseTextRepo.coversRange", () => {
  it("accepts a complete contiguous range", () => {
    expect(BibleVerseTextRepo.coversRange(verses(3, 14, 18), "JHN.3.14", "JHN.3.18")).toBe(true);
    expect(BibleVerseTextRepo.coversRange([...verses(3, 35, 36), ...verses(4, 1, 2)], "JHN.3.35", "JHN.4.2")).toBe(true);
  });

  it("rejects a cached subset of the requested range", () => {
    expect(BibleVerseTextRepo.coversRange([], "JHN.3.1", "JHN.3.5")).toBe(false);
    expect(BibleVerseTextRepo.coversRange(verses(3, 1, 5), "JHN.3.1", "JHN.3.12")).toBe(false);
    expect(BibleVerseTextRepo.coversRange([...verses(3, 1, 5), ...verses(3, 10, 12)], "JHN.3.1", "JHN.3.12")).toBe(false);
  });
});

// Production: GET /content/bibles/:translationKey/verses/... was in the slow log (580 requests over 1 s in a week).
// The cache read used only the translationKey part of idx_bibleVerseTexts_translationKey_verseKey, so it read every
// cached verse of the translation and filtered by book afterwards. A verseKey prefix lets the index stop at the book.
describe("BibleVerseTextRepo.loadRange", () => {
  const { getDb } = jest.requireMock("../../db/index");

  it("bounds the read by the book's verseKey prefix and keeps the original filters", async () => {
    const { db, queries } = capturingDb(verses(3, 14, 18));
    getDb.mockReturnValue(db);
    const result = await new BibleVerseTextRepo().loadRange("ENGWEBP", "JHN.3.16", "JHN.3.17");
    expect(queries).toHaveLength(1);
    expect(queries[0].sql).toMatch(/where `translationKey` = \? and `verseKey` like \? and `bookKey` = \? and `chapterNumber` >= \? and `chapterNumber` <= \? order by `chapterNumber`, `verseNumber`/);
    expect(queries[0].parameters).toEqual(["ENGWEBP", "JHN.%", "JHN", 3, 3]);
    expect(result.map((r: any) => r.verseNumber)).toEqual([16, 17]);
  });

  it("escapes LIKE wildcards in the book key", async () => {
    const { db, queries } = capturingDb([]);
    getDb.mockReturnValue(db);
    await new BibleVerseTextRepo().loadRange("T1", "A_B.1.1", "A_B.2.3");
    expect(queries[0].parameters).toEqual(["T1", "A\\_B.%", "A_B", 1, 2]);
  });
});

function capturingDb(rows: any[]) {
  const queries: { sql: string; parameters: readonly unknown[] }[] = [];
  const driver = new DummyDriver();
  driver.acquireConnection = async () => ({
    executeQuery: async (q: any) => {
      queries.push({ sql: q.sql, parameters: q.parameters });
      return { rows } as any;
    },
    streamQuery: async function* () {}
  });
  const db = new Kysely<any>({
    dialect: {
      createAdapter: () => new MysqlAdapter(),
      createDriver: () => driver,
      createIntrospector: (k) => new MysqlIntrospector(k),
      createQueryCompiler: () => new MysqlQueryCompiler()
    }
  });
  return { db, queries };
}
