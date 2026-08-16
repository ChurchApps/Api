const getReposMock = jest.fn();
jest.mock("../../../../shared/infrastructure/RepoManager.js", () => ({ RepoManager: { getRepos: (...a: any[]) => getReposMock(...a) } }));
jest.mock("../WebPushHelper.js", () => ({ WebPushHelper: {} }));
jest.mock("../ExpoPushHelper.js", () => ({ ExpoPushHelper: {} }));
jest.mock("../DeliveryHelper.js", () => ({ DeliveryHelper: {} }));
jest.mock("@churchapps/apihelper", () => ({
  ArrayHelper: { getIds: (arr: any[], field: string) => [...new Set((arr || []).map((a) => a[field]).filter(Boolean))] },
  EmailHelper: { sendEmail: jest.fn(), sendTemplatedEmail: jest.fn() }
}));
jest.mock("../../../../shared/helpers/Environment.js", () => ({ Environment: { jwtSecret: "should-not-be-posted", membershipApi: "http://unused" } }));
const axiosPost = jest.fn();
jest.mock("axios", () => ({ default: { post: axiosPost, get: jest.fn() }, post: axiosPost }));

import { NotificationHelper } from "../NotificationHelper.js";

describe("NotificationHelper.getEmailData", () => {
  beforeEach(() => {
    getReposMock.mockReset();
    axiosPost.mockReset();
  });

  it("loads emails from membership repos and does not POST jwtSecret", async () => {
    const loadByIdsOnly = jest.fn(async () => [{ id: "p1", email: "a@b.com" }, { id: "p2", email: "c@d.com" }]);
    getReposMock.mockResolvedValue({ person: { loadByIdsOnly } });

    const result = await NotificationHelper.getEmailData([{ personId: "p1" }, { personId: "p2" }] as any);

    expect(getReposMock).toHaveBeenCalledWith("membership");
    expect(loadByIdsOnly).toHaveBeenCalledWith(["p1", "p2"]);
    expect(result).toEqual([{ id: "p1", email: "a@b.com" }, { id: "p2", email: "c@d.com" }]);
    expect(axiosPost).not.toHaveBeenCalled();
  });
});
