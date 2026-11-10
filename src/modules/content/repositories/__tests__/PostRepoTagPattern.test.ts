import "reflect-metadata";
jest.mock("../../db/index", () => ({ getDb: jest.fn() }));
jest.mock("@churchapps/apihelper", () => ({ UniqueIdHelper: { shortId: () => "gen_id" } }));

import { PostRepo } from "../PostRepo.js";

// Mirrors MySQL REGEXP closely enough for these cases: [[:space:]] becomes \s.
const matches = (tags: string, tag: string) => new RegExp(PostRepo.tagPattern(tag).replace(/\[\[:space:\]\]/g, "\\s"), "i").test(tags);

describe("PostRepo.tagPattern", () => {
  it("matches a whole tag anywhere in the comma-separated list", () => {
    expect(matches("art", "art")).toBe(true);
    expect(matches("music, art", "art")).toBe(true);
    expect(matches("art,heart", "art")).toBe(true);
  });

  it("does not match a tag that only contains the word", () => {
    expect(matches("heart, music", "art")).toBe(false);
    expect(matches("artsy", "art")).toBe(false);
  });

  it("escapes regex characters in the tag", () => {
    expect(matches("c++, music", "c++")).toBe(true);
    expect(matches("cxx", "c.x")).toBe(false);
  });
});
