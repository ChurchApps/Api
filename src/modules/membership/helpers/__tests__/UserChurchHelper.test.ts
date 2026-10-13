// Issue #1251: two people in a church share an email. Adding the second one to a role created
// a user that createForNewUser linked to whichever person the database returned first, and the
// admin's later POST /userchurch for the chosen person was ignored because a link already existed.

const mockRows: { personId: string; churchId: string }[] = [];
const mockSave = jest.fn(async (uc: any) => uc);

jest.mock("kysely", () => ({ ...jest.requireActual("kysely"), sql: () => ({ execute: async () => ({ rows: mockRows }) }) }));
jest.mock("../../db/index", () => ({ getDb: () => ({}) }));
jest.mock("../../../../shared/infrastructure/index", () => ({ RepoManager: { getRepos: async () => ({ userChurch: { save: mockSave } }) } }));

import { UserChurchHelper } from "../UserChurchHelper";

describe("UserChurchHelper.createForNewUser", () => {
  beforeEach(() => {
    mockRows.length = 0;
    mockSave.mockClear();
  });

  it("does not guess when two people in a church share the email", async () => {
    mockRows.push({ personId: "mickey", churchId: "church1" }, { personId: "carol", churchId: "church1" });
    await UserChurchHelper.createForNewUser("user1", "mickey.cm@gmail.com");
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("links the only matching person in each church", async () => {
    mockRows.push({ personId: "p1", churchId: "church1" }, { personId: "p2", churchId: "church2" }, { personId: "p3", churchId: "church2" });
    await UserChurchHelper.createForNewUser("user1", "a@b.com");
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockSave).toHaveBeenCalledWith({ userId: "user1", churchId: "church1", personId: "p1" });
  });
});
