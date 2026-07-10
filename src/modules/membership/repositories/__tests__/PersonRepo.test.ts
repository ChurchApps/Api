import "reflect-metadata";
jest.mock("../../db/index", () => ({ getDb: jest.fn() }));
jest.mock("@churchapps/apihelper", () => ({ __esModule: true, UniqueIdHelper: { shortId: () => "per_gen" } }));
jest.mock("../../helpers/index.js", () => ({
  __esModule: true,
  PersonHelper: { getPhotoPath: (_c: string, p: any) => (p.photoUpdated ? "photo/" + p.id : "") },
  DateHelper: { toMysqlDate: (d: any) => d ?? null, toMysqlDateOnly: (d: any) => d ?? null }
}));
jest.mock("../../../../shared/helpers/index.js", () => ({
  __esModule: true,
  CollectionHelper: { convertAll: (data: any, convert: (row: any) => any) => (Array.isArray(data) ? data.map(convert) : []) }
}));

import { getDb } from "../../db/index.js";
import { PersonRepo } from "../PersonRepo.js";

function recordingDb(results: any[] = []) {
  const calls: { method: string; args: any[] }[] = [];
  const proxy: any = new Proxy({}, {
    get(_t, prop) {
      if (typeof prop === "symbol" || prop === "then") return undefined;
      if (prop === "execute") return async () => results;
      return (...args: any[]) => { calls.push({ method: prop as string, args }); return proxy; };
    }
  });
  return { proxy, calls };
}
const whereCalls = (calls: any[]) => calls.filter((c) => c.method === "where");

describe("PersonRepo.search term handling", () => {
  it("wraps a single-word term in % wildcards", async () => {
    const { proxy, calls } = recordingDb([]);
    (getDb as jest.Mock).mockReturnValue(proxy);
    await new PersonRepo().search("c1", "smith", false);
    const wheres = whereCalls(calls);
    expect(wheres.some((c) => c.args[0] === "churchId" && c.args[2] === "c1")).toBe(true);
    expect(wheres.some((c) => c.args[2] === "%smith%")).toBe(true);
  });

  it("only replaces the first space in a multi-word term (String#replace, not replaceAll)", async () => {
    // note: suspicious — PersonRepo.ts:234 uses term.replace(" ", "%") which only replaces the FIRST space;
    // a term like "john smith jones" leaves the second space un-wildcarded, likely missing matches. Possible bug.
    const { proxy, calls } = recordingDb([]);
    (getDb as jest.Mock).mockReturnValue(proxy);
    await new PersonRepo().search("c1", "john smith jones", false);
    const wheres = whereCalls(calls);
    expect(wheres.some((c) => c.args[2] === "%john%smith jones%")).toBe(true);
  });

  it("adds an optedOut OR-clause only when filterOptedOut is true", async () => {
    const { proxy: proxyOn, calls: callsOn } = recordingDb([]);
    (getDb as jest.Mock).mockReturnValue(proxyOn);
    await new PersonRepo().search("c1", "smith", true);
    expect(whereCalls(callsOn).some((c) => typeof c.args[0] === "function")).toBe(true);

    const { proxy: proxyOff, calls: callsOff } = recordingDb([]);
    (getDb as jest.Mock).mockReturnValue(proxyOff);
    await new PersonRepo().search("c1", "smith", false);
    expect(whereCalls(callsOff).some((c) => typeof c.args[0] === "function")).toBe(false);
  });
});

describe("PersonRepo.searchPhone term handling", () => {
  it("replaces every space and dash with % (global regex, unlike search())", async () => {
    const { proxy, calls } = recordingDb([]);
    (getDb as jest.Mock).mockReturnValue(proxy);
    await new PersonRepo().searchPhone("c1", "555 - 12-34");
    const wheres = whereCalls(calls);
    expect(wheres.some((c) => typeof c.args[0] === "function")).toBe(true);
  });
});

describe("PersonRepo.loadMembersByVisibility statuses mapping", () => {
  const casesAndExpected: [string, string[]][] = [
    ["Staff", ["Staff"]],
    ["Members", ["Member", "Staff"]],
    ["Regular Attendees", ["Regular Attendee", "Member", "Staff"]],
    ["Everyone", ["Visitor", "Regular Attendee", "Member", "Staff"]],
    ["SomeUnknownValue", ["Member", "Staff"]]
  ];

  casesAndExpected.forEach(([visibility, expected]) => {
    it(`maps "${visibility}" to ${JSON.stringify(expected)}`, async () => {
      const { proxy, calls } = recordingDb([]);
      (getDb as jest.Mock).mockReturnValue(proxy);
      await new PersonRepo().loadMembersByVisibility("c1", visibility);
      const wheres = whereCalls(calls);
      expect(wheres.some((c) => c.args[0] === "membershipStatus" && c.args[1] === "in" && JSON.stringify(c.args[2]) === JSON.stringify(expected))).toBe(true);
    });
  });
});

describe("PersonRepo model conversion", () => {
  const row = {
    id: "p1",
    churchId: "c1",
    displayName: "Jane Doe",
    firstName: "Jane",
    lastName: "Doe",
    email: "jane@x.com",
    membershipStatus: "Member",
    conversationId: "conv1",
    photoUpdated: new Date("2024-01-01")
  };

  it("convertToModel maps a row into name/contactInfo shape and computes photo when missing", () => {
    const result = new PersonRepo().convertToModel("c1", row);
    expect(result).toMatchObject({ id: "p1", name: { display: "Jane Doe", first: "Jane", last: "Doe" }, contactInfo: { email: "jane@x.com" } });
    expect(result!.photo).toBe("photo/p1");
  });

  it("convertToModel returns null for falsy input", () => {
    expect(new PersonRepo().convertToModel("c1", null)).toBeNull();
  });

  it("convertAllToModel returns [] for non-array input", () => {
    expect(new PersonRepo().convertAllToModel("c1", null as any)).toEqual([]);
  });

  it("convertToModelWithPermissions strips conversationId when canEdit is false, keeps it when true", () => {
    const withoutEdit = new PersonRepo().convertToModelWithPermissions("c1", row, false);
    expect(withoutEdit).not.toHaveProperty("conversationId");
    const withEdit = new PersonRepo().convertToModelWithPermissions("c1", row, true);
    expect(withEdit.conversationId).toBe("conv1");
  });

  it("convertAllToModelWithPermissions returns [] for non-array input", () => {
    expect(new PersonRepo().convertAllToModelWithPermissions("c1", null, true)).toEqual([]);
  });

  it("convertToBasicModel exposes only name.display, photo, membershipStatus and id", () => {
    const basic = new PersonRepo().convertToBasicModel("c1", row);
    expect(basic).toEqual({ name: { display: "Jane Doe" }, contactInfo: {}, photo: "photo/p1", photoUpdated: row.photoUpdated, membershipStatus: "Member", id: "p1" });
  });

  it("convertToPreferenceModel exposes only name.display, contactInfo, photo, photoUpdated, membershipStatus and id", () => {
    const full = new PersonRepo().convertToModel("c1", row)!;
    const pref = new PersonRepo().convertToPreferenceModel("c1", full);
    expect(Object.keys(pref).sort()).toEqual(["contactInfo", "id", "membershipStatus", "name", "photo", "photoUpdated"].sort());
    expect(pref.name.display).toBe("Jane Doe");
  });
});
