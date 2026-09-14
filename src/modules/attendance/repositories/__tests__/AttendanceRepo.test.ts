import "reflect-metadata";
jest.mock("../../db/index", () => ({ getDb: jest.fn() }));
jest.mock("@churchapps/apihelper", () => ({ __esModule: true, DateHelper: { toMysqlDate: jest.fn() } }));

import { AttendanceRepo } from "../AttendanceRepo.js";

describe("AttendanceRepo.rowToModel checkinTime", () => {
  it("maps checkinTime from the row", () => {
    const when = new Date("2026-01-04T08:45:00");
    const model = new AttendanceRepo().convertToModel("c1", { visitDate: "2026-01-04", checkinTime: when, groupId: "g1" });
    expect(model.checkinTime).toBe(when);
  });

  it("leaves checkinTime undefined when the column is missing", () => {
    const model = new AttendanceRepo().convertToModel("c1", { visitDate: "2026-01-04", groupId: "g1" });
    expect(model.checkinTime).toBeUndefined();
  });
});
