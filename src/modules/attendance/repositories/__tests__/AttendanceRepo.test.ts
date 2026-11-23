import "reflect-metadata";
jest.mock("../../db/index", () => ({ getDb: jest.fn() }));
jest.mock("@churchapps/apihelper", () => ({ __esModule: true, DateHelper: { toMysqlDate: jest.fn() } }));

import { AttendanceRepo } from "../AttendanceRepo.js";

describe("AttendanceRepo.rowToModel checkinTime", () => {
  it("maps checkinTime from the row", () => {
    const when = new Date("2026-01-04T08:45:00");
    const model = new AttendanceRepo().convertToModel("c1", { visitDate: new Date("2026-01-04"), checkinTime: when, groupId: "g1" });
    expect(model.checkinTime).toBe(when);
  });

  it("leaves checkinTime undefined when the column is missing", () => {
    const model = new AttendanceRepo().convertToModel("c1", { visitDate: new Date("2026-01-04"), groupId: "g1" });
    expect(model.checkinTime).toBeUndefined();
  });
});

describe("AttendanceRepo.rowToModel checkout", () => {
  it("maps checkoutTime and checkedOutBy from the row", () => {
    const out = new Date("2026-01-04T10:15:00");
    const model = new AttendanceRepo().convertToModel("c1", { visitDate: new Date("2026-01-04"), checkoutTime: out, checkedOutBy: "Jane Smith", groupId: "g1" });
    expect(model.checkoutTime).toBe(out);
    expect(model.checkedOutBy).toBe("Jane Smith");
  });

  it("leaves checkout fields undefined for a visit that was never checked out", () => {
    const model = new AttendanceRepo().convertToModel("c1", { visitDate: new Date("2026-01-04"), groupId: "g1" });
    expect(model.checkoutTime).toBeUndefined();
    expect(model.checkedOutBy).toBeUndefined();
  });
});

describe("AttendanceRepo.rowToModel checked in by", () => {
  it("maps checkedInById from the row", () => {
    const model = new AttendanceRepo().convertToModel("c1", { visitDate: new Date("2026-01-04"), checkedInById: "mom", groupId: "g1" });
    expect(model.checkedInById).toBe("mom");
  });
});
