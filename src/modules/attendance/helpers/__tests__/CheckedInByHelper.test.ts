const gateway = { loadPeople: jest.fn() };
jest.mock("../../../../shared/modules/index", () => ({ getMembershipModuleGateway: () => gateway }));

import { CheckedInByHelper } from "../CheckedInByHelper.js";

describe("CheckedInByHelper", () => {
  beforeEach(() => gateway.loadPeople.mockReset());

  it("clears ids that are not people in the church and keeps the rest", async () => {
    gateway.loadPeople.mockResolvedValue([{ id: "mom", displayName: "Mary Smith" }]);
    const visits = [{ checkedInById: "mom" }, { checkedInById: "outsider" }, {}];
    await CheckedInByHelper.keepChurchPeopleOnly("c1", visits);
    expect(gateway.loadPeople).toHaveBeenCalledWith("c1", ["mom", "outsider"]);
    expect(visits.map((v) => v.checkedInById)).toEqual(["mom", undefined, undefined]);
  });

  it("skips the lookup when no visit names a checked-in-by person", async () => {
    await CheckedInByHelper.keepChurchPeopleOnly("c1", [{}, {}]);
    await CheckedInByHelper.attachNames("c1", [{}, undefined]);
    expect(gateway.loadPeople).not.toHaveBeenCalled();
  });

  it("attaches display names, blank for a person no longer found", async () => {
    gateway.loadPeople.mockResolvedValue([{ id: "mom", displayName: "Mary Smith" }]);
    const targets: { checkedInById?: string; checkedInBy?: string }[] = [{ checkedInById: "mom" }, { checkedInById: "mom" }, { checkedInById: "gone" }, {}];
    await CheckedInByHelper.attachNames("c1", targets);
    expect(gateway.loadPeople).toHaveBeenCalledWith("c1", ["mom", "gone"]);
    expect(targets.map((t) => t.checkedInBy)).toEqual(["Mary Smith", "Mary Smith", "", undefined]);
  });
});
