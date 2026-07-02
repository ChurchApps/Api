import { ConversationalFormHelper } from "../ConversationalFormHelper.js";

const q = (id: string, fieldType: string, title: string) => ({ id, fieldType, title });
const a = (questionId: string, value: string) => ({ questionId, value });

describe("ConversationalFormHelper.extractContact", () => {
  it("maps by fieldType (Email/Phone Number) and first/last name titles", () => {
    const questions = [
      q("q1", "Email", "Email Address"),
      q("q2", "Phone Number", "Cell"),
      q("q3", "Textbox", "First Name"),
      q("q4", "Textbox", "Last Name")
    ];
    const answers = [a("q1", "  jane@doe.com "), a("q2", "555-1234"), a("q3", "Jane"), a("q4", "Doe")];
    expect(ConversationalFormHelper.extractContact(questions, answers)).toEqual({
      email: "jane@doe.com",
      phone: "555-1234",
      firstName: "Jane",
      lastName: "Doe"
    });
  });

  it("maps by title keyword when fieldType is generic", () => {
    const questions = [q("q1", "Textbox", "Your Email"), q("q2", "Textbox", "Mobile phone")];
    const answers = [a("q1", "x@y.com"), a("q2", "111")];
    expect(ConversationalFormHelper.extractContact(questions, answers)).toEqual({ email: "x@y.com", phone: "111" });
  });

  it("splits a single full-name field into first/last", () => {
    const questions = [q("q1", "Textbox", "Name")];
    const answers = [a("q1", "Ada Lovelace King")];
    const c = ConversationalFormHelper.extractContact(questions, answers);
    expect(c.firstName).toBe("Ada");
    expect(c.lastName).toBe("Lovelace King");
  });

  it("ignores blank answers and unmatched questions", () => {
    const questions = [q("q1", "Email", "Email"), q("q2", "Heading", "Welcome"), q("q3", "Textbox", "Favorite Color")];
    const answers = [a("q1", "   "), a("q3", "Blue")];
    expect(ConversationalFormHelper.extractContact(questions, answers)).toEqual({});
  });
});

describe("ConversationalFormHelper.applyTokens", () => {
  it("replaces all occurrences of {firstName} and {churchName}", () => {
    const out = ConversationalFormHelper.applyTokens("Hi {firstName}, welcome to {churchName}! Thanks {firstName}.", {
      firstName: "Sam",
      churchName: "Grace Church"
    });
    expect(out).toBe("Hi Sam, welcome to Grace Church! Thanks Sam.");
  });

  it("is blank-safe for missing token values", () => {
    expect(ConversationalFormHelper.applyTokens("Hi {firstName}!", {})).toBe("Hi !");
  });

  it("returns falsy templates unchanged", () => {
    expect(ConversationalFormHelper.applyTokens("", { firstName: "X" })).toBe("");
    expect(ConversationalFormHelper.applyTokens(null as any, {})).toBeNull();
  });
});

describe("ConversationalFormHelper.findOrCreatePerson", () => {
  const makeRepos = (searchResult: any[]) => {
    const person = {
      save: jest.fn(async (p: any) => ({ ...p, id: "newPid" })),
      load: jest.fn(async (_c: string, id: string) => ({ id, email: "created@x.com" })),
      searchEmail: jest.fn(async () => searchResult),
      convertToModel: jest.fn((_c: string, row: any) => row)
    };
    const household = { save: jest.fn(async (h: any) => Object.assign(h, { id: "hh1" })) };
    return { person, household } as any;
  };

  it("returns null without an email", async () => {
    const repos = makeRepos([]);
    expect(await ConversationalFormHelper.findOrCreatePerson(repos, "ch1", { firstName: "A" })).toBeNull();
    expect(repos.person.searchEmail).not.toHaveBeenCalled();
  });

  it("reuses an existing person on exact email match and never creates", async () => {
    const repos = makeRepos([{ id: "existing", email: "Match@Example.com" }]);
    const result = await ConversationalFormHelper.findOrCreatePerson(repos, "ch1", { email: "match@example.com" });
    expect(result.id).toBe("existing");
    expect(repos.person.save).not.toHaveBeenCalled();
    expect(repos.household.save).not.toHaveBeenCalled();
  });

  it("ignores partial (LIKE) matches that are not the exact email", async () => {
    const repos = makeRepos([{ id: "other", email: "notmatch@example.com.uk" }]);
    const result = await ConversationalFormHelper.findOrCreatePerson(repos, "ch1", { email: "match@example.com", firstName: "New", lastName: "Guest" });
    expect(repos.household.save).toHaveBeenCalled();
    expect(repos.person.save).toHaveBeenCalled();
    expect(result.id).toBe("newPid");
  });

  it("creates a Guest household+person with contact fields when none exists", async () => {
    const repos = makeRepos([]);
    await ConversationalFormHelper.findOrCreatePerson(repos, "ch1", { email: "new@x.com", firstName: "Pat", lastName: "Lee", phone: "555" });
    const saved = repos.person.save.mock.calls[0][0];
    expect(saved.membershipStatus).toBe("Guest");
    expect(saved.householdRole).toBe("Head");
    expect(saved.householdId).toBe("hh1");
    expect(saved.name).toEqual({ first: "Pat", last: "Lee" });
    expect(saved.contactInfo).toEqual({ email: "new@x.com", mobilePhone: "555" });
  });
});
