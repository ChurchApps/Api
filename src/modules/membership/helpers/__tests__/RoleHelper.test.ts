// ChurchAppsSupport#1426: anyone in any role picks up the Everyone permissions, so a Check-in grant
// on Everyone let every role holder run the kiosk and use its person reads.
const mockRolePermissionSave = jest.fn(async (rp: any) => rp);

jest.mock("../../../../shared/infrastructure/index", () => ({
  RepoManager: {
    getRepos: async () => ({
      role: { save: async (r: any) => ({ ...r, id: "role-" + r.name }) },
      roleMember: { save: async (rm: any) => rm },
      rolePermission: { save: mockRolePermissionSave }
    })
  }
}));
jest.mock("../../models/index", () => ({ RolePermission: class { constructor(data: any) { Object.assign(this, data); } } }));

import { RoleHelper } from "../RoleHelper";

const savedPermissions = () => mockRolePermissionSave.mock.calls.map(([rp]) => rp);

describe("RoleHelper.init", () => {
  beforeEach(async () => {
    mockRolePermissionSave.mockClear();
    await new RoleHelper("church1", "user1").init();
  });

  it("does not grant Check-in to Everyone at a new church", () => {
    const everyone = savedPermissions().filter((rp) => rp.roleId === null);
    expect(everyone.map((rp) => `${rp.contentType}/${rp.action}`)).toEqual(["People/Edit Self"]);
  });
});
