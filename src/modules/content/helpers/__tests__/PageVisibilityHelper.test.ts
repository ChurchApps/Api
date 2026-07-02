import { canViewPage } from "../PageVisibilityHelper";

const page = (visibility?: string, groupIds?: string) => ({ churchId: "C1", visibility, groupIds });

describe("canViewPage", () => {
  it("everyone (default) is public to anonymous callers", () => {
    expect(canViewPage(page(), null)).toBe(true);
    expect(canViewPage(page("everyone"), null)).toBe(true);
    expect(canViewPage({ churchId: "C1" }, null)).toBe(true);
  });

  it("non-public pages are restricted for anonymous callers", () => {
    expect(canViewPage(page("members"), null)).toBe(false);
    expect(canViewPage(page("groups", '["G1"]'), null)).toBe(false);
  });

  it("members is viewable by any authenticated user of the same church", () => {
    expect(canViewPage(page("members"), { churchId: "C1", personId: "P1" })).toBe(true);
  });

  it("blocks users authenticated into a different church", () => {
    expect(canViewPage(page("members"), { churchId: "OTHER", personId: "P1" })).toBe(false);
    expect(canViewPage(page("groups", '["G1"]'), { churchId: "OTHER", personId: "P1", groupIds: ["G1"] })).toBe(false);
  });

  it("groups requires membership in one of the page's groups", () => {
    expect(canViewPage(page("groups", '["G1","G2"]'), { churchId: "C1", groupIds: ["G2"] })).toBe(true);
    expect(canViewPage(page("groups", '["G1","G2"]'), { churchId: "C1", groupIds: ["G9"] })).toBe(false);
    expect(canViewPage(page("groups"), { churchId: "C1", groupIds: ["G1"] })).toBe(false);
    expect(canViewPage(page("groups", "not-json"), { churchId: "C1", groupIds: ["G1"] })).toBe(false);
  });

  it("staff requires staff membership status", () => {
    expect(canViewPage(page("staff"), { churchId: "C1", membershipStatus: "Staff" })).toBe(true);
    expect(canViewPage(page("staff"), { churchId: "C1", membershipStatus: "Member" })).toBe(false);
  });

  it("visitors requires a personId", () => {
    expect(canViewPage(page("visitors"), { churchId: "C1", personId: "P1" })).toBe(true);
    expect(canViewPage(page("visitors"), { churchId: "C1" })).toBe(false);
  });
});
