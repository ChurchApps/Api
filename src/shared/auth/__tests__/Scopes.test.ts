import { filterPermissionsByScopes, parseScopes, listAllScopes } from "../Scopes.js";

// A representative full permission set, in the on-token string format
// `[apiName_]contentType_<contentId>_action`.
const fullSet = [
  "People__View",
  "People__View Members",
  "People__Edit",
  "Group Members__View",
  "Groups__Edit",
  "Donations__View",
  "Donations__View Summary",
  "Donations__Edit",
  "Attendance__View Summary",
  "Server__Admin",
  "MembershipApi_People__View", // reporting-style, apiName-prefixed
  "Groups_abc12345678_Edit" // a content-id-scoped permission
];

describe("filterPermissionsByScopes", () => {
  it("returns the set unchanged when no scopes are given (full access)", () => {
    expect(filterPermissionsByScopes(fullSet, [])).toEqual(fullSet);
  });

  it("keeps only people-read permissions for people:read", () => {
    const result = filterPermissionsByScopes(fullSet, ["people:read"]);
    expect(result).toContain("People__View");
    expect(result).toContain("People__View Members");
    expect(result).toContain("Group Members__View");
    expect(result).toContain("MembershipApi_People__View"); // apiName ignored when matching
    expect(result).not.toContain("People__Edit");
    expect(result).not.toContain("Donations__View");
    expect(result).not.toContain("Server__Admin");
  });

  it("write implies read — donations:write includes donation reads", () => {
    const result = filterPermissionsByScopes(fullSet, ["donations:write"]);
    expect(result).toContain("Donations__Edit");
    expect(result).toContain("Donations__View");
    expect(result).toContain("Donations__View Summary");
    expect(result).not.toContain("People__Edit");
  });

  it("matches content-id-scoped permissions, ignoring the id segment", () => {
    const result = filterPermissionsByScopes(fullSet, ["groups:write"]);
    expect(result).toContain("Groups__Edit");
    expect(result).toContain("Groups_abc12345678_Edit");
  });

  it("returns nothing for an unknown scope", () => {
    expect(filterPermissionsByScopes(fullSet, ["banana"])).toEqual([]);
  });

  it("never includes server admin via any scope", () => {
    listAllScopes().forEach((scope) => {
      expect(filterPermissionsByScopes(fullSet, [scope])).not.toContain("Server__Admin");
    });
  });
});

describe("parseScopes", () => {
  it("splits on whitespace and commas, trims, and dedupes", () => {
    expect(parseScopes("people:read  donations:read,people:read")).toEqual(["people:read", "donations:read"]);
  });

  it("returns an empty array for empty/absent input", () => {
    expect(parseScopes("")).toEqual([]);
    expect(parseScopes(undefined)).toEqual([]);
    expect(parseScopes(null)).toEqual([]);
  });
});
