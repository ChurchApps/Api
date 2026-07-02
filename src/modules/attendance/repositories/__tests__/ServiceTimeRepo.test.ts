import "reflect-metadata";
jest.mock("../../db/index", () => ({ getDb: jest.fn() }));
jest.mock("@churchapps/apihelper", () => ({ __esModule: true, UniqueIdHelper: { shortId: () => "st_gen" } }));

import { ServiceTimeRepo } from "../ServiceTimeRepo.js";

describe("ServiceTimeRepo.buildPublicTree", () => {
  const rows = [
    { serviceId: "S1", serviceName: "Sunday Morning", campusId: "CAM1", timeId: "T1", timeName: "9:00 AM" },
    { serviceId: "S1", serviceName: "Sunday Morning", campusId: "CAM1", timeId: "T2", timeName: "10:30 AM" },
    { serviceId: "S2", serviceName: "Wednesday", campusId: null, timeId: "T3", timeName: "7:00 PM" }
  ];

  it("groups times under their service and resolves campus names", () => {
    const tree = new ServiceTimeRepo().buildPublicTree(rows, { CAM1: "Main Campus" });
    expect(tree).toEqual([
      { serviceId: "S1", serviceName: "Sunday Morning", campusName: "Main Campus", times: [{ id: "T1", name: "9:00 AM" }, { id: "T2", name: "10:30 AM" }] },
      { serviceId: "S2", serviceName: "Wednesday", times: [{ id: "T3", name: "7:00 PM" }] }
    ]);
  });

  it("omits campusName when the campus is unknown or unmapped", () => {
    const tree = new ServiceTimeRepo().buildPublicTree(rows, {});
    expect(tree[0]).not.toHaveProperty("campusName");
    expect(tree[1]).not.toHaveProperty("campusName");
  });

  it("returns [] for non-array input", () => {
    expect(new ServiceTimeRepo().buildPublicTree(null as any)).toEqual([]);
  });
});
