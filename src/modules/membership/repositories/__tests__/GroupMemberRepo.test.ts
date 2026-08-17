import "reflect-metadata";
jest.mock("../../db/index", () => ({ getDb: jest.fn() }));
jest.mock("@churchapps/apihelper", () => ({ __esModule: true, UniqueIdHelper: { shortId: () => "gm_gen" } }));
jest.mock("../../helpers/index.js", () => ({ __esModule: true, PersonHelper: { getPhotoPath: (_c: string, p: any) => (p.photoUpdated ? "photo/" + p.id : "") } }));

import { getDb } from "../../db/index.js";
import { GroupMemberRepo } from "../GroupMemberRepo.js";

function recordingDb(results: any[] = []) {
  const calls: { method: string; args: any[] }[] = [];
  const proxy: any = new Proxy({}, {
    get(_t, prop) {
      if (typeof prop === "symbol" || prop === "then") return undefined;
      if (prop === "execute") return async () => results;
      if (prop === "executeTakeFirst") return async () => results[0] ?? null;
      return (...args: any[]) => { calls.push({ method: prop as string, args }); return proxy; };
    }
  });
  return { proxy, calls };
}
const whereCalls = (calls: any[]) => calls.filter((c) => c.method === "where");

describe("GroupMemberRepo.loadPublicForGroup gating", () => {
  afterEach(() => jest.restoreAllMocks());

  it("scopes by church + group and requires a non-removed, non-archived, opted-in group, leaders first", async () => {
    const { proxy, calls } = recordingDb([]);
    (getDb as jest.Mock).mockReturnValue(proxy);
    await new GroupMemberRepo().loadPublicForGroup("c1", "g1");
    const wheres = whereCalls(calls);
    expect(wheres.some((c) => c.args[0] === "gm.churchId" && c.args[2] === "c1")).toBe(true);
    expect(wheres.some((c) => c.args[0] === "gm.groupId" && c.args[2] === "g1")).toBe(true);
    expect(wheres.some((c) => c.args[0] === "g.removed" && c.args[2] === false)).toBe(true);
    // roster exposure is an explicit per-group opt-in
    expect(wheres.some((c) => c.args[0] === "g.publicRoster" && c.args[2] === true)).toBe(true);
    // archived exclusion is expressed as an OR callback
    expect(wheres.some((c) => typeof c.args[0] === "function")).toBe(true);
    const orderBy = calls.filter((c) => c.method === "orderBy");
    expect(orderBy[0].args).toEqual(["gm.leader", "desc"]);
  });
});

describe("GroupMemberRepo.convertAllToPublicModel privacy", () => {
  it("emits only id, name.display, photo, and role for leaders — no contact fields", () => {
    const rows = [
      { id: "GME1", personId: "PER1", leader: true, displayName: "Jane Doe", photoUpdated: new Date(), email: "j@x.com", mobilePhone: "555", address1: "1 St", birthDate: new Date() },
      { id: "GME2", personId: "PER2", leader: false, displayName: "John Roe", photoUpdated: null, email: "j2@x.com" }
    ];
    const result = new GroupMemberRepo().convertAllToPublicModel("c1", rows);

    expect(result[0]).toEqual({ id: "PER1", name: { display: "Jane Doe" }, photo: "photo/PER1", role: "Leader" });
    expect(result[1]).toEqual({ id: "PER2", name: { display: "John Roe" }, photo: "" });
    expect(result[1]).not.toHaveProperty("role");

    const forbidden = [
      "email", "mobilePhone", "homePhone", "workPhone", "address1", "address2", "city", "state", "zip", "birthDate", "membershipStatus"
    ];
    const serialized = JSON.stringify(result);
    forbidden.forEach((f) => expect(serialized).not.toContain(f));
  });

  it("returns [] for non-array input", () => {
    expect(new GroupMemberRepo().convertAllToPublicModel("c1", null as any)).toEqual([]);
  });
});

describe("GroupMemberRepo.isPublicGroupLeader", () => {
  afterEach(() => jest.restoreAllMocks());

  it("requires church, person, leader flag, and a visible non-confidential group", async () => {
    const { proxy, calls } = recordingDb([{ id: "gm1" }]);
    (getDb as jest.Mock).mockReturnValue(proxy);
    const result = await new GroupMemberRepo().isPublicGroupLeader("c1", "p9");
    expect(result).toBe(true);
    const wheres = whereCalls(calls);
    expect(wheres.some((c) => c.args[0] === "gm.churchId" && c.args[2] === "c1")).toBe(true);
    expect(wheres.some((c) => c.args[0] === "gm.personId" && c.args[2] === "p9")).toBe(true);
    expect(wheres.some((c) => c.args[0] === "gm.leader" && c.args[2] === 1)).toBe(true);
    expect(wheres.some((c) => c.args[0] === "g.churchId" && c.args[2] === "c1")).toBe(true);
    expect(wheres.some((c) => c.args[0] === "g.removed" && c.args[2] === false)).toBe(true);
    expect(wheres.filter((c) => typeof c.args[0] === "function").length).toBeGreaterThanOrEqual(2);
  });

  it("does not restrict to a group when no groupId is given", async () => {
    const { proxy, calls } = recordingDb([{ id: "gm1" }]);
    (getDb as jest.Mock).mockReturnValue(proxy);
    await new GroupMemberRepo().isPublicGroupLeader("c1", "p9");
    expect(whereCalls(calls).some((c) => c.args[0] === "gm.groupId")).toBe(false);
  });

  it("restricts to the supplied group", async () => {
    const { proxy, calls } = recordingDb([{ id: "gm1" }]);
    (getDb as jest.Mock).mockReturnValue(proxy);
    const result = await new GroupMemberRepo().isPublicGroupLeader("c1", "p9", "g1");
    expect(result).toBe(true);
    expect(whereCalls(calls).some((c) => c.args[0] === "gm.groupId" && c.args[2] === "g1")).toBe(true);
  });

  it("returns false when no matching leader row exists", async () => {
    const { proxy } = recordingDb([]);
    (getDb as jest.Mock).mockReturnValue(proxy);
    expect(await new GroupMemberRepo().isPublicGroupLeader("c1", "p9", "g1")).toBe(false);
  });
});
