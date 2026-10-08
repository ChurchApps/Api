import "reflect-metadata";

// A chainable stand-in for the Kysely builder that records what insertInto(...).values() receives.
const inserted: any[] = [];
const builder: any = new Proxy({}, {
  get: (_t, prop) => {
    if (prop === "execute") return async () => [];
    if (prop === "executeTakeFirst") return async () => undefined;
    if (prop === "values") return (row: any) => { inserted.push(row); return builder; };
    return () => builder;
  }
});
jest.mock("../db/index", () => ({ getDb: () => builder }));
jest.mock("kysely", () => ({ sql: Object.assign(() => ({ as: () => "expr", execute: async () => ({}) }), { ref: () => "ref" }) }));
jest.mock("@churchapps/apihelper", () => ({ UniqueIdHelper: { shortId: () => "id000000001" } }), { virtual: true });
jest.mock("@churchapps/helpers", () => require("../__mocks__/churchappsHelpers"), { virtual: true });

import { SongRepo } from "../repositories/SongRepo";

describe("SongRepo.upsert", () => {
  it("keeps a co-written song's full writer credit on the first publish", async () => {
    inserted.length = 0;
    await new SongRepo().upsert({ assetId: "a1", authorId: "w1", writerCredit: "Elton Smith and Larry Holder" } as any);
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ assetId: "a1", authorId: "w1", writerCredit: "Elton Smith and Larry Holder" });
  });
});
