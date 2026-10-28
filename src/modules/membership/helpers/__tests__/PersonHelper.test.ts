jest.mock("../../../../shared/infrastructure/index.js", () => ({ RepoManager: { getRepos: jest.fn() } }));
jest.mock("@churchapps/apihelper", () => ({ PersonHelper: class {} }));
jest.mock("../../../../shared/helpers/index.js", () => ({ Permissions: { people: { edit: "peopleEdit" } } }));
jest.mock("../SsoHelper.js", () => ({ SsoHelper: { applyStashedPhoto: jest.fn() } }));
jest.mock("../../../../shared/webhooks/WebhookDispatcher.js", () => ({ WebhookDispatcher: { emit: jest.fn() } }));
const mockCreatePersonNote = jest.fn();
const mockRecordAttendance = jest.fn();
jest.mock("../../../../shared/modules/index.js", () => ({
  getMessagingModuleGateway: () => ({ createPersonNote: (...args: any[]) => mockCreatePersonNote(...args) }),
  getAttendanceModuleGateway: () => ({ recordAttendance: (...args: any[]) => mockRecordAttendance(...args) })
}));

import { RepoManager } from "../../../../shared/infrastructure/index.js";
import { PersonHelper } from "../PersonHelper.js";
import { WebhookDispatcher } from "../../../../shared/webhooks/WebhookDispatcher.js";

// Mirrors the real PersonRepo: searchEmail filters `removed = false`, searchEmailIncludingRemoved does not.
// The rows fixture is the whole table for the church, so a test can never hand searchEmail a deleted
// person the real query would have hidden.
function mockRepos(rows: any[] = [], opts: any = {}) {
  const person = {
    searchEmail: jest.fn(async () => rows.filter((r) => !r.removed)),
    searchEmailIncludingRemoved: jest.fn(async () => [...rows].sort((a, b) => Number(!!a.removed) - Number(!!b.removed))),
    save: jest.fn(async (p: any) => { if (!p.id) p.id = "newP"; return p; }),
    load: jest.fn(async () => opts.loaded ?? { id: "newP", churchId: "c1", removed: false, name: {} }),
    convertAllToModelWithPermissions: (_c: string, data: any[]) => data.map((d) => ({ ...d })),
    convertToModel: (_c: string, d: any) => (d ? { ...d } : null),
    convertAllToModel: (_c: string, data: any[]) => data.map((d) => ({ ...d })),
    findGuestMatch: jest.fn(async (_c: string, q: any) => (opts.guestMatch ? opts.guestMatch(q) : null)),
    loadByHousehold: jest.fn(async (_c: string, hId: string) => (opts.householdPeople ?? []).filter((p: any) => p.householdId === hId)),
    updateFieldsByIds: jest.fn(),
    restore: jest.fn()
  };
  const household = { save: jest.fn(async (h: any) => { h.id = "h1"; return h; }) };
  const group = { load: jest.fn(async (_c: string, id: string) => (opts.groups ?? []).find((g: any) => g.id === id) ?? null) };
  const groupMember = {
    save: jest.fn(async (gm: any) => ({ ...gm, id: "gm-" + gm.personId })),
    loadForGroup: jest.fn(async (_c: string, gId: string) => (opts.groupMembers ?? []).filter((gm: any) => gm.groupId === gId))
  };
  const groupMemberHistory = { log: jest.fn() };
  (RepoManager.getRepos as jest.Mock).mockResolvedValue({ person, household, group, groupMember, groupMemberHistory });
  return { person, household, group, groupMember, groupMemberHistory };
}

const removedPerson = { id: "p1", churchId: "c1", email: "a@b.com", removed: true, name: {} };
const livePerson = { id: "p2", churchId: "c1", email: "A@B.com", removed: false, name: {} };

describe("PersonHelper.getPerson with allowRestore (the claim path)", () => {
  it("restores a removed person rather than duplicating them", async () => {
    const { person } = mockRepos([removedPerson]);
    const result = await PersonHelper.getPerson("c1", "a@b.com", "A", "B", false, true);
    expect(person.searchEmailIncludingRemoved).toHaveBeenCalledWith("c1", "a@b.com");
    expect(person.restore).toHaveBeenCalledWith("c1", "p1");
    expect(result.id).toBe("p1");
    expect(result.removed).toBe(false);
    expect(person.save).not.toHaveBeenCalled();
  });

  it("prefers a live person over a deleted duplicate and restores nothing", async () => {
    const { person } = mockRepos([removedPerson, livePerson]);
    const result = await PersonHelper.getPerson("c1", "a@b.com", "A", "B", false, true);
    expect(result.id).toBe("p2");
    expect(person.restore).not.toHaveBeenCalled();
    expect(person.save).not.toHaveBeenCalled();
  });

  it("defaults to allowRestore when the argument is omitted", async () => {
    const { person } = mockRepos([removedPerson]);
    await PersonHelper.getPerson("c1", "a@b.com", "A", "B", false);
    expect(person.restore).toHaveBeenCalledWith("c1", "p1");
  });
});

describe("PersonHelper.getPerson without allowRestore (the anon path)", () => {
  it("never queries removed rows, so a deleted person is created fresh instead of restored", async () => {
    const { person, household } = mockRepos([removedPerson]);
    const result = await PersonHelper.getPerson("c1", "a@b.com", "A", "B", false, false);
    expect(person.searchEmail).toHaveBeenCalledWith("c1", "a@b.com");
    expect(person.searchEmailIncludingRemoved).not.toHaveBeenCalled();
    expect(person.restore).not.toHaveBeenCalled();
    expect(household.save).toHaveBeenCalled();
    expect(person.save).toHaveBeenCalled();
    expect(result.id).toBe("newP");
    expect(result.removed).toBe(false);
  });

  it("returns an existing live person without touching restore", async () => {
    const { person } = mockRepos([livePerson]);
    const result = await PersonHelper.getPerson("c1", "a@b.com", "A", "B", false, false);
    expect(result.id).toBe("p2");
    expect(person.restore).not.toHaveBeenCalled();
    expect(person.save).not.toHaveBeenCalled();
  });

  it("ignores partial and wildcard email matches", async () => {
    mockRepos([{ id: "p3", churchId: "c1", email: "bob@x.com", removed: false, name: {} }]);
    expect((await PersonHelper.getPerson("c1", "b@x.com", "A", "B", false, false)).id).toBe("newP");
    expect((await PersonHelper.getPerson("c1", "%", "A", "B", false, false)).id).toBe("newP");
  });

  it("creates a new person when no one matches the email", async () => {
    const { person } = mockRepos([]);
    const result = await PersonHelper.getPerson("c1", "a@b.com", "A", "B", false, false);
    expect(result.id).toBe("newP");
    expect(person.restore).not.toHaveBeenCalled();
  });
});

describe("PersonHelper.claim", () => {
  it("does not link another church to the caller's person from their current church", async () => {
    const { person } = mockRepos([]);
    const userChurch = { loadByUserId: jest.fn(async () => null), save: jest.fn(async (uc: any) => uc) };
    (RepoManager.getRepos as jest.Mock).mockResolvedValue({ person, household: { save: jest.fn(async (h: any) => { h.id = "h1"; return h; }) }, userChurch });
    const au: any = { id: "u1", email: "a@b.com", firstName: "A", lastName: "B", churchId: "churchA", personId: "personA", checkAccess: () => false };
    const result = await PersonHelper.claim(au, "churchB");
    expect(person.load).not.toHaveBeenCalledWith("churchA", "personA");
    expect(result.userChurch.personId).toBe("newP");
    expect(result.userChurch.churchId).toBe("churchB");
  });
});

describe("PersonHelper.registerGuestHousehold", () => {
  it("records every new person as a Visitor and writes the included profile fields", async () => {
    const saved: any[] = [];
    const { person } = mockRepos();
    person.save.mockImplementation(async (p: any) => { p.id = "p" + (saved.length + 1); saved.push({ ...p, contactInfo: { ...p.contactInfo } }); return p; });
    await PersonHelper.registerGuestHousehold("c1", {
      members: [
        { firstName: "Pat", lastName: "Visitor", email: "pat@example.com", phone: "555-0100", birthDate: "1990-04-02", gender: "Female" },
        { firstName: "Sam", lastName: "Visitor", grade: "3" }
      ],
      address: { address1: "1 Main St", city: "Springfield", state: "IL", zip: "62701" },
      maritalStatus: "Married"
    });
    expect(saved.map((p) => p.membershipStatus)).toEqual(["Visitor", "Visitor"]);
    expect(saved[0]).toMatchObject({ householdRole: "Head", birthDate: "1990-04-02", gender: "Female", maritalStatus: "Married", contactInfo: { email: "pat@example.com", mobilePhone: "555-0100", address1: "1 Main St", city: "Springfield", state: "IL", zip: "62701" } });
    expect(saved[1]).toMatchObject({ householdRole: "Other", grade: "3", contactInfo: { address1: "1 Main St", city: "Springfield", state: "IL", zip: "62701" } });
    expect(saved[1].maritalStatus).toBeUndefined();
    expect(saved[1].contactInfo.email).toBeUndefined();
  });
});

// Issue #1374: the guest QR sign-up can add the household to the church's chosen group and save a comment as a note.
describe("PersonHelper.registerGuestHousehold group and comments", () => {
  const registration = { members: [{ firstName: "Pat", lastName: "Visitor" }, { firstName: "Sam", lastName: "Visitor" }] };
  const savePeople = (person: any) => {
    let n = 0;
    person.save.mockImplementation(async (p: any) => { if (!p.id) p.id = "p" + (++n); return p; });
  };

  beforeEach(() => { mockCreatePersonNote.mockReset().mockResolvedValue("conv1"); (WebhookDispatcher.emit as jest.Mock).mockClear(); });

  it("adds every new person to the chosen group and fires group.member.added", async () => {
    const { person, groupMember, groupMemberHistory } = mockRepos([], { groups: [{ id: "g1" }] });
    savePeople(person);
    await PersonHelper.registerGuestHousehold("c1", registration, "g1");
    expect(groupMember.save.mock.calls.map((c: any[]) => c[0])).toEqual([
      expect.objectContaining({ churchId: "c1", groupId: "g1", personId: "p1" }),
      expect.objectContaining({ churchId: "c1", groupId: "g1", personId: "p2" })
    ]);
    expect(groupMemberHistory.log).toHaveBeenCalledWith("c1", "g1", "p1", "joined");
    expect(WebhookDispatcher.emit).toHaveBeenCalledWith("c1", "group.member.added", expect.objectContaining({ groupId: "g1", personId: "p2" }));
  });

  it("skips a group that no longer exists and still registers", async () => {
    const { person, groupMember } = mockRepos([], { groups: [] });
    savePeople(person);
    const result = await PersonHelper.registerGuestHousehold("c1", registration, "gone");
    expect(groupMember.save).not.toHaveBeenCalled();
    expect(result.people).toHaveLength(2);
  });

  it("saves the comment as a note on the head of household and links it to their Notes tab", async () => {
    const { person } = mockRepos();
    savePeople(person);
    await PersonHelper.registerGuestHousehold("c1", { ...registration, comments: "Loved the picnic" });
    expect(mockCreatePersonNote).toHaveBeenCalledWith("c1", "p1", "Pat Visitor Notes", "Loved the picnic");
    expect(person.save).toHaveBeenLastCalledWith(expect.objectContaining({ id: "p1", conversationId: "conv1" }));
  });

  it("does not fail the sign-up when the note cannot be saved", async () => {
    const { person } = mockRepos();
    savePeople(person);
    mockCreatePersonNote.mockRejectedValue(new Error("down"));
    jest.spyOn(console, "error").mockImplementation(() => {});
    const result = await PersonHelper.registerGuestHousehold("c1", { ...registration, comments: "Hi" });
    expect(result.people).toHaveLength(2);
  });
});

// Issue #1375: with the church's switch on, guests who sign up during one of the group's service times are marked present.
describe("PersonHelper.registerGuestHousehold attendance", () => {
  const registration = { members: [{ firstName: "Pat", lastName: "Visitor" }, { firstName: "Sam", lastName: "Visitor" }] };
  const savePeople = (person: any) => {
    let n = 0;
    person.save.mockImplementation(async (p: any) => { if (!p.id) p.id = "p" + (++n); return p; });
  };

  beforeEach(() => { mockRecordAttendance.mockReset().mockResolvedValue(1); });

  it("records attendance in the guest group for every new person when the switch is on", async () => {
    const { person } = mockRepos([], { groups: [{ id: "g1" }] });
    savePeople(person);
    await PersonHelper.registerGuestHousehold("c1", registration, "g1", true);
    expect(mockRecordAttendance.mock.calls.map((c: any[]) => c.slice(0, 3))).toEqual([["c1", "p1", "g1"], ["c1", "p2", "g1"]]);
    expect(mockRecordAttendance.mock.calls[0][3]).toBeInstanceOf(Date);
  });

  it("does not record attendance when the switch is off, or without a group", async () => {
    const { person } = mockRepos([], { groups: [{ id: "g1" }] });
    savePeople(person);
    await PersonHelper.registerGuestHousehold("c1", registration, "g1", false);
    await PersonHelper.registerGuestHousehold("c1", registration, undefined, true);
    expect(mockRecordAttendance).not.toHaveBeenCalled();
  });

  it("still registers when attendance cannot be recorded", async () => {
    const { person, groupMember } = mockRepos([], { groups: [{ id: "g1" }] });
    savePeople(person);
    mockRecordAttendance.mockRejectedValue(new Error("down"));
    jest.spyOn(console, "error").mockImplementation(() => {});
    const result = await PersonHelper.registerGuestHousehold("c1", registration, "g1", true);
    expect(groupMember.save).toHaveBeenCalledTimes(2);
    expect(result.people).toHaveLength(2);
  });
});

// Issue #1408: a guest who signs up again by QR reuses their profile instead of becoming a duplicate.
describe("PersonHelper.registerGuestHousehold reuses existing people", () => {
  const donald = { id: "pDonald", churchId: "c1", householdId: "hClark", householdRole: "Head", name: { first: "Donald", last: "Clark" }, conversationId: null as string };
  const carol = { id: "pCarol", churchId: "c1", householdId: "hClark", householdRole: "Spouse", name: { first: "Carol", last: "Clark" } };
  const savePeople = (person: any) => {
    let n = 0;
    person.save.mockImplementation(async (p: any) => { if (!p.id) p.id = "new" + (++n); return p; });
  };

  beforeEach(() => { mockCreatePersonNote.mockReset().mockResolvedValue("conv1"); (WebhookDispatcher.emit as jest.Mock).mockClear(); });

  it("reuses the one person with the same first name and email, and changes nothing on them", async () => {
    const { person, household } = mockRepos([], { guestMatch: (q: any) => (q.email === "donald@example.com" ? { ...donald } : null) });
    savePeople(person);
    const result = await PersonHelper.registerGuestHousehold("c1", { members: [{ firstName: "Donald", lastName: "Clarke", email: "donald@example.com" }] });
    expect(person.findGuestMatch).toHaveBeenCalledWith("c1", { firstName: "Donald", email: "donald@example.com", phone: undefined });
    expect(person.save).not.toHaveBeenCalled();
    expect(household.save).not.toHaveBeenCalled();
    expect(WebhookDispatcher.emit).not.toHaveBeenCalledWith("c1", "person.created", expect.anything());
    // The public response echoes what was typed, never the stored record.
    expect(result).toEqual({ householdId: "hClark", people: [{ id: "pDonald", name: { first: "Donald", last: "Clarke" } }] });
  });

  it("reuses a person matched by phone", async () => {
    const { person } = mockRepos([], { guestMatch: (q: any) => (q.phone === "(555) 010-0101" ? { ...donald } : null) });
    savePeople(person);
    const result = await PersonHelper.registerGuestHousehold("c1", { members: [{ firstName: "Donald", lastName: "Clark", phone: "(555) 010-0101" }] });
    expect(result.people.map((p) => p.id)).toEqual(["pDonald"]);
    expect(person.save).not.toHaveBeenCalled();
  });

  it("creates a new person when no single match is found", async () => {
    const { person, household } = mockRepos([], { guestMatch: () => null });
    savePeople(person);
    const result = await PersonHelper.registerGuestHousehold("c1", { members: [{ firstName: "Dana", lastName: "Clark", email: "donald@example.com" }] });
    expect(household.save).toHaveBeenCalled();
    expect(result.people.map((p) => p.id)).toEqual(["new1"]);
  });

  it("reuses a child without contact details inside the matched household and adds new people to it", async () => {
    const { person, household } = mockRepos([], {
      guestMatch: (q: any) => (q.firstName === "Donald" ? { ...donald } : null),
      householdPeople: [donald, carol]
    });
    savePeople(person);
    const result = await PersonHelper.registerGuestHousehold("c1", {
      members: [
        { firstName: "Donald", lastName: "Clark", email: "donald@example.com" },
        { firstName: "carol", lastName: "Clark" },
        { firstName: "Timmy", lastName: "Clark" }
      ]
    });
    expect(household.save).not.toHaveBeenCalled();
    expect(result.people.map((p) => p.id)).toEqual(["pDonald", "pCarol", "new1"]);
    expect(person.save).toHaveBeenCalledTimes(1);
    expect(person.save).toHaveBeenCalledWith(expect.objectContaining({ householdId: "hClark", householdRole: "Other", name: { first: "Timmy", last: "Clark" } }));
  });

  it("does not re-add someone who is already in the group", async () => {
    const { person, groupMember } = mockRepos([], {
      guestMatch: (q: any) => (q.firstName === "Donald" ? { ...donald } : null),
      groups: [{ id: "g1" }],
      groupMembers: [{ groupId: "g1", personId: "pDonald" }]
    });
    savePeople(person);
    await PersonHelper.registerGuestHousehold("c1", { members: [{ firstName: "Donald", lastName: "Clark", email: "donald@example.com" }, { firstName: "Timmy", lastName: "Clark" }] }, "g1");
    expect(groupMember.save.mock.calls.map((c: any[]) => c[0].personId)).toEqual(["new1"]);
  });

  it("links a comment to a reused head only when they have no notes conversation yet", async () => {
    const { person } = mockRepos([], { guestMatch: () => ({ ...donald }) });
    savePeople(person);
    await PersonHelper.registerGuestHousehold("c1", { members: [{ firstName: "Donald", lastName: "Clark", email: "donald@example.com" }], comments: "Back again" });
    expect(mockCreatePersonNote).toHaveBeenCalledWith("c1", "pDonald", "Donald Clark Notes", "Back again");
    expect(person.updateFieldsByIds).toHaveBeenCalledWith("c1", ["pDonald"], { conversationId: "conv1" });
    expect(person.save).not.toHaveBeenCalled();

    const linked = mockRepos([], { guestMatch: () => ({ ...donald, conversationId: "convOld" }) });
    await PersonHelper.registerGuestHousehold("c1", { members: [{ firstName: "Donald", lastName: "Clark", email: "donald@example.com" }], comments: "Again" });
    expect(linked.person.updateFieldsByIds).not.toHaveBeenCalled();
  });
});
