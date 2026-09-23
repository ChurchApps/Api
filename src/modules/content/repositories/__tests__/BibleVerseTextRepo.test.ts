import "reflect-metadata";
jest.mock("../../db/index", () => ({ getDb: jest.fn() }));
jest.mock("@churchapps/apihelper", () => ({ UniqueIdHelper: { shortId: () => "gen_id" } }));

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
