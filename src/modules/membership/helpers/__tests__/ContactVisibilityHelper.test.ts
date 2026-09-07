jest.mock("../index.js", () => ({ Permissions: { people: { view: "peopleView" } } }));

import { ContactVisibilityHelper } from "../ContactVisibilityHelper.js";

function fakeRepos(opts: { settings?: any[]; prefs?: any[]; groupRows?: any[] } = {}) {
  return {
    setting: {
      loadPublicSettings: jest.fn(async () => opts.settings ?? []),
      convertAllToModel: (_c: string, rows: any[]) => rows
    },
    visibilityPreference: { loadForPeople: jest.fn(async () => opts.prefs ?? []) },
    groupMember: { loadForPeople: jest.fn(async () => opts.groupRows ?? []) }
  } as any;
}

function viewer(opts: any = {}) {
  return {
    churchId: "c1",
    personId: opts.personId ?? "viewer",
    membershipStatus: opts.membershipStatus ?? "Member",
    groupIds: opts.groupIds ?? [],
    leaderGroupIds: opts.leaderGroupIds ?? [],
    checkAccess: (perm: any) => (opts.access ?? []).includes(perm)
  };
}

function target(id = "t1") {
  return { id, name: { display: "Target " + id }, contactInfo: { email: id + "@x.org", mobilePhone: "111", homePhone: "222", workPhone: "333", address1: "1 Main", address2: "Apt 2", city: "Springfield", state: "IL", zip: "62701" } } as any;
}

describe("ContactVisibilityHelper.canSee", () => {
  const base = { isSelf: false, isMember: true, sharesGroup: false, leadsGroup: false };
  it("orders the five levels strictly narrower each step", () => {
    const groupMate = { ...base, sharesGroup: true };
    const leader = { ...base, sharesGroup: true, leadsGroup: true };
    expect(ContactVisibilityHelper.canSee("everyone", { ...base, isMember: false })).toBe(true);
    expect(ContactVisibilityHelper.canSee("members", { ...base, isMember: false })).toBe(false);
    expect(ContactVisibilityHelper.canSee("members", base)).toBe(true);
    expect(ContactVisibilityHelper.canSee("groups", base)).toBe(false);
    expect(ContactVisibilityHelper.canSee("groups", groupMate)).toBe(true);
    expect(ContactVisibilityHelper.canSee("leaders", groupMate)).toBe(false);
    expect(ContactVisibilityHelper.canSee("leaders", leader)).toBe(true);
    expect(ContactVisibilityHelper.canSee("staff", leader)).toBe(false);
  });

  it("always lets people see their own record", () => {
    expect(ContactVisibilityHelper.canSee("staff", { ...base, isSelf: true, isMember: false })).toBe(true);
  });

  it("treats unknown values as members", () => {
    expect(ContactVisibilityHelper.normalizeLevel("hidden")).toBe("members");
    expect(ContactVisibilityHelper.normalizeLevel(undefined)).toBe("members");
    expect(ContactVisibilityHelper.normalizeLevel("staff")).toBe("staff");
  });
});

describe("ContactVisibilityHelper.redactAll", () => {
  it("returns people untouched for a viewer with people.view", async () => {
    const repos = fakeRepos();
    const result = await ContactVisibilityHelper.redactAll(viewer({ access: ["peopleView"] }), [target()], repos);
    expect(result[0].contactInfo.email).toBe("t1@x.org");
    expect(repos.setting.loadPublicSettings).not.toHaveBeenCalled();
  });

  it("uses the church default 'leaders': a leader of a shared group sees, a plain group-mate does not", async () => {
    const settings = [{ keyName: "emailVisibility", value: "leaders" }, { keyName: "phoneVisibility", value: "leaders" }, { keyName: "addressVisibility", value: "leaders" }];
    const groupRows = [{ churchId: "c1", personId: "t1", groupId: "g1" }];
    const asLeader = await ContactVisibilityHelper.redactAll(viewer({ groupIds: ["g1"], leaderGroupIds: ["g1"] }), [target()], fakeRepos({ settings, groupRows }));
    expect(asLeader[0].contactInfo.email).toBe("t1@x.org");
    expect(asLeader[0].contactInfo.mobilePhone).toBe("111");
    expect(asLeader[0].contactInfo.address1).toBe("1 Main");

    const asMate = await ContactVisibilityHelper.redactAll(viewer({ groupIds: ["g1"] }), [target()], fakeRepos({ settings, groupRows }));
    expect(asMate[0].contactInfo.email).toBeUndefined();
    expect(asMate[0].contactInfo.mobilePhone).toBeUndefined();
    expect(asMate[0].contactInfo.homePhone).toBeUndefined();
    expect(asMate[0].contactInfo.address1).toBeUndefined();
    expect(asMate[0].contactInfo.city).toBeUndefined();
    expect(asMate[0].contactInfo.zip).toBeUndefined();
  });

  it("a person's own 'staff' preference hides from group leaders but not from themselves", async () => {
    const prefs = [{ personId: "t1", address: "staff", phoneNumber: "staff", email: "staff" }];
    const groupRows = [{ churchId: "c1", personId: "t1", groupId: "g1" }];
    const asLeader = await ContactVisibilityHelper.redactAll(viewer({ groupIds: ["g1"], leaderGroupIds: ["g1"] }), [target()], fakeRepos({ prefs, groupRows }));
    expect(asLeader[0].contactInfo.email).toBeUndefined();
    expect(asLeader[0].contactInfo.mobilePhone).toBeUndefined();
    expect(asLeader[0].contactInfo.address1).toBeUndefined();

    const asSelf = await ContactVisibilityHelper.redactAll(viewer({ personId: "t1" }), [target()], fakeRepos({ prefs, groupRows }));
    expect(asSelf[0].contactInfo.email).toBe("t1@x.org");
  });

  it("applies per-field levels independently and falls back to the church default per field", async () => {
    const settings = [{ keyName: "emailVisibility", value: "everyone" }];
    const prefs = [{ personId: "t1", address: "staff", phoneNumber: "", email: "" }];
    const result = await ContactVisibilityHelper.redactAll(viewer({ membershipStatus: "Visitor" }), [target()], fakeRepos({ settings, prefs }));
    expect(result[0].contactInfo.email).toBe("t1@x.org"); // church default everyone
    expect(result[0].contactInfo.mobilePhone).toBeUndefined(); // default members, viewer is a visitor
    expect(result[0].contactInfo.address1).toBeUndefined(); // person chose staff
  });

  it("batches lookups: one settings, one prefs and one group query for the whole list", async () => {
    const settings = [{ keyName: "emailVisibility", value: "groups" }];
    const repos = fakeRepos({ settings, groupRows: [{ churchId: "c1", personId: "t2", groupId: "g9" }] });
    const result = await ContactVisibilityHelper.redactAll(viewer({ groupIds: ["g9"] }), [target("t1"), target("t2"), target("t3")], repos);
    expect(repos.setting.loadPublicSettings).toHaveBeenCalledTimes(1);
    expect(repos.visibilityPreference.loadForPeople).toHaveBeenCalledTimes(1);
    expect(repos.visibilityPreference.loadForPeople).toHaveBeenCalledWith("c1", ["t1", "t2", "t3"]);
    expect(repos.groupMember.loadForPeople).toHaveBeenCalledTimes(1);
    expect(result.map((p) => p.contactInfo.email)).toEqual([undefined, "t2@x.org", undefined]);
  });

  it("skips the group query when no level needs it", async () => {
    const repos = fakeRepos({ settings: [{ keyName: "emailVisibility", value: "staff" }] });
    await ContactVisibilityHelper.redactAll(viewer(), [target()], repos);
    expect(repos.groupMember.loadForPeople).not.toHaveBeenCalled();
  });

  it("does not mutate the input objects", async () => {
    const input = target();
    await ContactVisibilityHelper.redactAll(viewer(), [input], fakeRepos({ settings: [{ keyName: "emailVisibility", value: "staff" }] }));
    expect(input.contactInfo.email).toBe("t1@x.org");
  });
});
