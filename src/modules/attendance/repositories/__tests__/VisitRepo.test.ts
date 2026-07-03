import "reflect-metadata";
jest.mock("../../db/index", () => ({ getDb: jest.fn() }));
jest.mock("@churchapps/apihelper", () => ({ __esModule: true, UniqueIdHelper: { shortId: () => "vis_gen" } }));

import { VisitRepo } from "../VisitRepo.js";

describe("VisitRepo.rowToModel checkinType", () => {
  it("maps checkinType and checkedInById from the row", () => {
    const model = new VisitRepo().convertToModel("c1", { id: "v1", personId: "p1", checkinType: "volunteer", checkedInById: "u9" });
    expect(model.checkinType).toBe("volunteer");
    expect(model.checkedInById).toBe("u9");
  });

  it("leaves the fields undefined for a legacy row", () => {
    const model = new VisitRepo().convertToModel("c1", { id: "v1", personId: "p1" });
    expect(model.checkinType).toBeUndefined();
    expect(model.checkedInById).toBeUndefined();
  });
});
