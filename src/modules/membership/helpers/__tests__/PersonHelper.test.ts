jest.mock("../../../../shared/infrastructure/index.js", () => ({ RepoManager: { getRepos: jest.fn() } }));
jest.mock("@churchapps/apihelper", () => ({ PersonHelper: class {} }));
jest.mock("../../../../shared/helpers/index.js", () => ({ Permissions: { people: { edit: "peopleEdit" } } }));
jest.mock("../SsoHelper.js", () => ({ SsoHelper: { applyStashedPhoto: jest.fn() } }));
jest.mock("../../../../shared/webhooks/WebhookDispatcher.js", () => ({ WebhookDispatcher: { emit: jest.fn() } }));

import { RepoManager } from "../../../../shared/infrastructure/index.js";
import { PersonHelper } from "../PersonHelper.js";

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
    restore: jest.fn()
  };
  const household = { save: jest.fn(async (h: any) => { h.id = "h1"; return h; }) };
  (RepoManager.getRepos as jest.Mock).mockResolvedValue({ person, household });
  return { person, household };
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
