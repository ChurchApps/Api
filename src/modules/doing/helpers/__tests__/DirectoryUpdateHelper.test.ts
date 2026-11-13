const store = jest.fn(async () => undefined);
jest.mock("@churchapps/apihelper", () => ({ FileStorageHelper: { store: (...a: any[]) => (store as any)(...a) } }));
jest.mock("../../../../shared/infrastructure/index", () => ({ RepoManager: { getRepos: jest.fn() } }));
jest.mock("../../../../shared/events/InternalEventBus", () => ({ InternalEventBus: { publish: jest.fn() } }));
jest.mock("../Environment", () => ({ Environment: { contentRoot: "https://cdn.test" } }));

import { DirectoryUpdateHelper } from "../DirectoryUpdateHelper.js";

describe("DirectoryUpdateHelper photo checks", () => {
  beforeEach(() => store.mockClear());

  it("stores a small jpeg photo", async () => {
    const task: any = { status: "Open", associatedWithId: "p1", data: JSON.stringify([{ field: "photo", value: "data:image/jpeg;base64,AAAA" }]) };
    await DirectoryUpdateHelper.handleDirectoryUpdate("c1", task);
    expect(store).toHaveBeenCalledTimes(1);
    expect(JSON.parse(task.data)[0].value).toContain("https://cdn.test/c1/membership/people/pending/p1-");
  });

  it("drops non-image and oversized data urls", async () => {
    const huge = "data:image/png;base64," + "A".repeat(8 * 1024 * 1024);
    const task: any = { status: "Open", associatedWithId: "p1", data: JSON.stringify([{ field: "photo", value: "data:text/html;base64,PHNjcmlwdD4=" }, { field: "photo", value: huge }, { field: "name", value: "Bob" }]) };
    await DirectoryUpdateHelper.handleDirectoryUpdate("c1", task);
    expect(store).not.toHaveBeenCalled();
    expect(JSON.parse(task.data)).toEqual([{ field: "name", value: "Bob" }]);
  });
});

// ChurchAppsSupport#1554: a member can attach a photo to a family member they add.
describe("DirectoryUpdateHelper family member photos", () => {
  beforeEach(() => store.mockClear());

  it("parks a family member's photo as a pending file and keeps the email", async () => {
    const member = { first: "Ann", last: "Clark", email: "ann@example.com", photo: "data:image/png;base64,AAAA" };
    const task: any = { status: "Open", associatedWithId: "p1", data: JSON.stringify([{ field: "familyMember", value: JSON.stringify(member) }]) };
    await DirectoryUpdateHelper.handleDirectoryUpdate("c1", task);
    expect(store).toHaveBeenCalledTimes(1);
    const saved = JSON.parse(JSON.parse(task.data)[0].value);
    expect(saved.email).toBe("ann@example.com");
    expect(saved.photo).toContain("https://cdn.test/c1/membership/people/pending/p1-family-");
  });

  it("drops a family member photo that is not an acceptable image", async () => {
    const member = { first: "Ann", photo: "data:text/html;base64,PHNjcmlwdD4=" };
    const task: any = { status: "Open", associatedWithId: "p1", data: JSON.stringify([{ field: "familyMember", value: JSON.stringify(member) }]) };
    await DirectoryUpdateHelper.handleDirectoryUpdate("c1", task);
    expect(store).not.toHaveBeenCalled();
    expect(JSON.parse(JSON.parse(task.data)[0].value)).toEqual({ first: "Ann" });
  });
});
