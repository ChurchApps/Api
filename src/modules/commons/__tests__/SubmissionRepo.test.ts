import "reflect-metadata";

// A chainable stand-in for the Kysely builder that records the order clauses loadQueue applies.
const calls: { orderBy: [string, string][]; where: any[] } = { orderBy: [], where: [] };
const builder: any = new Proxy({}, {
  get: (_t, prop) => {
    if (prop === "execute") return async () => [];
    if (prop === "executeTakeFirst") return async () => undefined;
    if (prop === "orderBy") return (col: string, dir: string) => { calls.orderBy.push([col, dir]); return builder; };
    if (prop === "where") return (...args: any[]) => { calls.where.push(args); return builder; };
    return () => builder;
  }
});
jest.mock("../db/index", () => ({ getDb: () => builder }));
jest.mock("kysely", () => ({ sql: Object.assign(() => ({ as: () => "expr", execute: async () => ({}) }), { ref: () => "ref" }) }));
jest.mock("@churchapps/apihelper", () => ({ UniqueIdHelper: { shortId: () => "id000000001" } }), { virtual: true });

import { SubmissionRepo } from "../repositories/SubmissionRepo";

describe("SubmissionRepo.loadQueue", () => {
  it("orders by triage score first, then oldest submitted", async () => {
    calls.orderBy.length = 0;
    await new SubmissionRepo().loadQueue({ status: "pending" });
    expect(calls.orderBy).toEqual([
      ["submissions.triageScore", "desc"],
      ["submissions.submittedAt", "asc"],
      ["submissions.createdAt", "asc"]
    ]);
  });
});
