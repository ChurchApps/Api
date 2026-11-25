import "reflect-metadata";
jest.mock("../../db/index", () => ({ getDb: jest.fn() }));
jest.mock("@churchapps/apihelper", () => ({ __esModule: true, UniqueIdHelper: { shortId: jest.fn() } }));

import { VisitSessionRepo } from "../VisitSessionRepo.js";

describe("VisitSessionRepo.rowToModel visit details", () => {
  it("nests check-in and check-out details under visit", () => {
    const checkinTime = new Date("2026-01-04T08:45:00");
    const checkoutTime = new Date("2026-01-04T10:15:00");
    const model = new VisitSessionRepo().convertToModel("c1", { id: "vs1", visitId: "v1", sessionId: "s1", personId: "p1", checkinType: "member", checkinTime, checkoutTime, checkedOutBy: "Jane Smith", checkedInById: "mom" });
    expect(model.visit).toEqual({ id: "v1", personId: "p1", checkinType: "member", checkinTime, checkoutTime, checkedOutBy: "Jane Smith", checkedInById: "mom" });
  });

  it("omits visit for a plain visitSessions row", () => {
    const model = new VisitSessionRepo().convertToModel("c1", { id: "vs1", visitId: "v1", sessionId: "s1" });
    expect(model.visit).toBeUndefined();
  });
});
