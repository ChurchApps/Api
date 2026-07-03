import "reflect-metadata";
jest.mock("../../db/index", () => ({ getDb: jest.fn() }));
jest.mock("@churchapps/apihelper", () => ({ UniqueIdHelper: { shortId: () => "gen_id" } }));

import { getDb } from "../../db/index.js";
import { MessageReactionRepo } from "../MessageReactionRepo.js";

function recordingDb(results: { execute?: any; executeTakeFirst?: any } = {}) {
  const calls: { method: string; args: any[] }[] = [];
  const proxy: any = new Proxy({}, {
    get(_t, prop) {
      if (typeof prop === "symbol" || prop === "then") return undefined;
      if (prop === "execute") return async () => results.execute ?? [];
      if (prop === "executeTakeFirst") return async () => results.executeTakeFirst ?? null;
      return (...args: any[]) => { calls.push({ method: prop as string, args }); return proxy; };
    }
  });
  return { proxy, calls };
}

const firstArg = (calls: { method: string; args: any[] }[], method: string) => calls.find((c) => c.method === method)?.args[0];

describe("MessageReactionRepo", () => {
  afterEach(() => jest.restoreAllMocks());

  it("create inserts with a generated id", async () => {
    const { proxy, calls } = recordingDb();
    (getDb as jest.Mock).mockReturnValue(proxy);
    const saved = await new MessageReactionRepo().create({ churchId: "c1", messageId: "m1", conversationId: "conv1", personId: "p1", emoji: "👍" });
    expect(saved.id).toBe("gen_id");
    expect(firstArg(calls, "insertInto")).toBe("messageReactions");
    expect(firstArg(calls, "values")).toMatchObject({ id: "gen_id", messageId: "m1", emoji: "👍" });
  });

  it("loadOne scopes by message + person + emoji", async () => {
    const { proxy, calls } = recordingDb({ executeTakeFirst: null });
    (getDb as jest.Mock).mockReturnValue(proxy);
    await new MessageReactionRepo().loadOne("c1", "m1", "p1", "👍");
    const wheres = calls.filter((c) => c.method === "where").map((c) => c.args[0]);
    expect(wheres).toEqual(expect.arrayContaining(["churchId", "messageId", "personId", "emoji"]));
  });

  it("loadForMessages returns [] for an empty id list without querying", async () => {
    const { proxy, calls } = recordingDb();
    (getDb as jest.Mock).mockReturnValue(proxy);
    const result = await new MessageReactionRepo().loadForMessages("c1", []);
    expect(result).toEqual([]);
    expect(calls.length).toBe(0);
  });

  it("loadForMessages filters by churchId and an in() list of message ids", async () => {
    const { proxy, calls } = recordingDb({ execute: [] });
    (getDb as jest.Mock).mockReturnValue(proxy);
    await new MessageReactionRepo().loadForMessages("c1", ["m1", "m2"]);
    const inCall = calls.find((c) => c.method === "where" && c.args[1] === "in");
    expect(inCall?.args[0]).toBe("messageId");
    expect(inCall?.args[2]).toEqual(["m1", "m2"]);
  });
});
