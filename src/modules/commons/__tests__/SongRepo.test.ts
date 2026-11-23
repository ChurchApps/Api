import "reflect-metadata";

// A chainable stand-in for the Kysely builder that records what insertInto(...).values() receives.
type Row = Record<string, unknown>;
type Builder = Record<string | symbol, (...args: unknown[]) => unknown>;
const inserted: Row[] = [];
const builder: Builder = new Proxy({}, {
  get: (_t, prop) => {
    if (prop === "execute") return async (): Promise<Row[]> => [];
    if (prop === "executeTakeFirst") return async (): Promise<Row | undefined> => undefined;
    if (prop === "values") return (row: Row) => { inserted.push(row); return builder; };
    return () => builder;
  }
});
jest.mock("../db/index", () => ({ getDb: () => builder }));
jest.mock("kysely", () => ({ sql: Object.assign(() => ({ as: () => "expr", execute: async () => ({}) }), { ref: () => "ref" }) }));
jest.mock("@churchapps/apihelper", () => ({ UniqueIdHelper: { shortId: () => "id000000001" } }), { virtual: true });
jest.mock("@churchapps/helpers", () => require("../__mocks__/churchappsHelpers"), { virtual: true });

import { SongRepo } from "../repositories/SongRepo.js";

describe("SongRepo.upsert", () => {
  it("keeps a co-written song's full writer credit on the first publish", async () => {
    inserted.length = 0;
    await new SongRepo().upsert({ assetId: "a1", authorId: "w1", writerCredit: "Elton Smith and Larry Holder" });
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ assetId: "a1", authorId: "w1", writerCredit: "Elton Smith and Larry Holder" });
  });
});
