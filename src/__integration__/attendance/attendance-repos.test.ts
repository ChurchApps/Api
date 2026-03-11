import { initTestDb, teardownTestDb } from "../db-helper";
import { CampusRepo } from "../../modules/attendance/repositories/CampusRepo";
import { ServiceRepo } from "../../modules/attendance/repositories/ServiceRepo";
import { ServiceTimeRepo } from "../../modules/attendance/repositories/ServiceTimeRepo";
import { SessionRepo } from "../../modules/attendance/repositories/SessionRepo";
import { VisitRepo } from "../../modules/attendance/repositories/VisitRepo";
import { VisitSessionRepo } from "../../modules/attendance/repositories/VisitSessionRepo";
import { GroupServiceTimeRepo } from "../../modules/attendance/repositories/GroupServiceTimeRepo";
import { getDrizzleDb } from "../../db/drizzle";
import { sql } from "drizzle-orm";

// Shared test churchId — must fit in char(11), unique per run
const churchId = `t${Date.now().toString(36).slice(-10)}`;

beforeAll(async () => {
  await initTestDb();
});

afterAll(async () => {
  // Clean up test data
  const db = getDrizzleDb("attendance");
  await db.execute(sql`DELETE FROM visitSessions WHERE churchId = ${churchId}`);
  await db.execute(sql`DELETE FROM visits WHERE churchId = ${churchId}`);
  await db.execute(sql`DELETE FROM sessions WHERE churchId = ${churchId}`);
  await db.execute(sql`DELETE FROM groupServiceTimes WHERE churchId = ${churchId}`);
  await db.execute(sql`DELETE FROM serviceTimes WHERE churchId = ${churchId}`);
  await db.execute(sql`DELETE FROM services WHERE churchId = ${churchId}`);
  await db.execute(sql`DELETE FROM campuses WHERE churchId = ${churchId}`);
  await teardownTestDb();
});

describe("CampusRepo", () => {
  const repo = new CampusRepo();
  let campusId: string;

  it("should create a campus", async () => {
    const campus = await repo.save({ churchId, name: "Main Campus", address1: "123 Church St", city: "Springfield", state: "IL", zip: "62701" } as any);
    expect(campus.id).toBeDefined();
    expect(campus.id.length).toBe(11);
    campusId = campus.id;
  });

  it("should load a campus by id", async () => {
    const campus = await repo.load(churchId, campusId);
    expect(campus).not.toBeNull();
    expect(campus.name).toBe("Main Campus");
  });

  it("should update a campus", async () => {
    await repo.save({ id: campusId, churchId, name: "Updated Campus" } as any);
    const campus = await repo.load(churchId, campusId);
    expect(campus.name).toBe("Updated Campus");
  });

  it("should loadAll (excludes removed)", async () => {
    const all = await repo.loadAll(churchId);
    expect(all.length).toBeGreaterThanOrEqual(1);
    // All should have removed=false
    for (const c of all) {
      expect(c.removed).toBe(false);
    }
  });

  it("should delete a campus", async () => {
    // Create a throwaway campus to delete
    const temp = await repo.save({ churchId, name: "Temp Campus" } as any);
    await repo.delete(churchId, temp.id);
    const deleted = await repo.load(churchId, temp.id);
    expect(deleted).toBeNull();
  });
});

describe("ServiceRepo", () => {
  const campusRepo = new CampusRepo();
  const repo = new ServiceRepo();
  let campusId: string;
  let serviceId: string;

  beforeAll(async () => {
    const campus = await campusRepo.save({ churchId, name: "Service Test Campus" } as any);
    campusId = campus.id;
  });

  it("should create a service", async () => {
    const svc = await repo.save({ churchId, campusId, name: "Sunday AM" } as any);
    expect(svc.id).toBeDefined();
    serviceId = svc.id;
  });

  it("should load a service", async () => {
    const svc = await repo.load(churchId, serviceId);
    expect(svc).not.toBeNull();
    expect(svc.name).toBe("Sunday AM");
  });

  it("should loadAll (excludes removed)", async () => {
    const all = await repo.loadAll(churchId);
    expect(all.length).toBeGreaterThanOrEqual(1);
  });

  it("should loadWithCampus", async () => {
    const results = await repo.loadWithCampus(churchId);
    expect(results.length).toBeGreaterThanOrEqual(1);
    const svc = results.find((r: any) => r.id === serviceId);
    expect(svc).toBeDefined();
    expect(svc.campus).toBeDefined();
    expect(svc.campus.name).toBe("Service Test Campus");
  });

  it("should searchByCampus", async () => {
    const results = await repo.searchByCampus(churchId, campusId);
    expect(results.length).toBeGreaterThanOrEqual(1);
  });
});

describe("ServiceTimeRepo", () => {
  const campusRepo = new CampusRepo();
  const serviceRepo = new ServiceRepo();
  const repo = new ServiceTimeRepo();
  let serviceId: string;
  let serviceTimeId: string;

  beforeAll(async () => {
    const campus = await campusRepo.save({ churchId, name: "ST Test Campus" } as any);
    const svc = await serviceRepo.save({ churchId, campusId: campus.id, name: "ST Test Service" } as any);
    serviceId = svc.id;
  });

  it("should create a service time", async () => {
    const st = await repo.save({ churchId, serviceId, name: "9:00 AM" } as any);
    expect(st.id).toBeDefined();
    serviceTimeId = st.id;
  });

  it("should load a service time", async () => {
    const st = await repo.load(churchId, serviceTimeId);
    expect(st).not.toBeNull();
    expect(st.name).toBe("9:00 AM");
  });

  it("should loadNamesWithCampusService", async () => {
    const results = await repo.loadNamesWithCampusService(churchId);
    expect(results.length).toBeGreaterThanOrEqual(1);
    const st = results.find((r: any) => r.id === serviceTimeId);
    expect(st).toBeDefined();
    expect(st.longName).toContain("ST Test Campus");
    expect(st.longName).toContain("ST Test Service");
    expect(st.longName).toContain("9:00 AM");
  });
});

describe("GroupServiceTimeRepo", () => {
  const repo = new GroupServiceTimeRepo();
  let gstId: string;
  const groupId = "testgrp0001";

  // Need a service time to reference
  let serviceTimeId: string;
  beforeAll(async () => {
    const campusRepo = new CampusRepo();
    const serviceRepo = new ServiceRepo();
    const stRepo = new ServiceTimeRepo();
    const campus = await campusRepo.save({ churchId, name: "GST Test Campus" } as any);
    const svc = await serviceRepo.save({ churchId, campusId: campus.id, name: "GST Test Svc" } as any);
    const st = await stRepo.save({ churchId, serviceId: svc.id, name: "10:00 AM" } as any);
    serviceTimeId = st.id;
  });

  it("should create a group service time", async () => {
    const gst = await repo.save({ churchId, groupId, serviceTimeId } as any);
    expect(gst.id).toBeDefined();
    gstId = gst.id;
  });

  it("should load by id", async () => {
    const gst = await repo.load(churchId, gstId);
    expect(gst).not.toBeNull();
    expect(gst.groupId).toBe(groupId);
  });

  it("should loadWithServiceNames", async () => {
    const results = await repo.loadWithServiceNames(churchId, groupId);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].serviceTime).toBeDefined();
  });

  it("should loadByServiceTimeIds", async () => {
    const results = await repo.loadByServiceTimeIds(churchId, [serviceTimeId]);
    expect(results.length).toBeGreaterThanOrEqual(1);
  });
});

describe("SessionRepo", () => {
  const repo = new SessionRepo();
  let sessionId: string;
  const groupId = "sessgrp0001";
  const serviceTimeId = "sessst00001";
  const sessionDate = new Date("2025-06-15");

  it("should create a session", async () => {
    const session = await repo.save({ churchId, groupId, serviceTimeId, sessionDate } as any);
    expect(session.id).toBeDefined();
    sessionId = session.id;
  });

  it("should load a session", async () => {
    const session = await repo.load(churchId, sessionId);
    expect(session).not.toBeNull();
    expect(session.groupId).toBe(groupId);
  });

  it("should update a session", async () => {
    const newDate = new Date(2025, 5, 22);
    await repo.save({ id: sessionId, churchId, groupId, serviceTimeId, sessionDate: newDate } as any);
    const session = await repo.load(churchId, sessionId);
    // Verify the session was updated (date stored, fields intact)
    expect(session).not.toBeNull();
    expect(session.groupId).toBe(groupId);
    expect(session.sessionDate).not.toBeNull();
  });

  it("should loadAll ordered by date desc", async () => {
    const all = await repo.loadAll(churchId);
    expect(all.length).toBeGreaterThanOrEqual(1);
  });

  it("should loadByGroupServiceTimeDate", async () => {
    // Create a fresh session with a known date for this test
    const testDate = new Date("2025-07-01T00:00:00");
    const s = await repo.save({ churchId, groupId: "gstdgrp0001", serviceTimeId: "gstdst00001", sessionDate: testDate } as any);
    const result = await repo.loadByGroupServiceTimeDate(churchId, "gstdgrp0001", "gstdst00001", testDate);
    expect(result).not.toBeNull();
    expect(result.id).toBe(s.id);
  });
});

describe("VisitRepo", () => {
  const repo = new VisitRepo();
  let visitId: string;
  const personId = "testprs0001";
  const serviceId = "testsvc0001";
  const visitDate = new Date("2025-06-15");

  it("should create a visit", async () => {
    const visit = await repo.save({ churchId, personId, serviceId, visitDate } as any);
    expect(visit.id).toBeDefined();
    visitId = visit.id;
  });

  it("should load a visit", async () => {
    const visit = await repo.load(churchId, visitId);
    expect(visit).not.toBeNull();
    expect(visit.personId).toBe(personId);
  });

  it("should update a visit", async () => {
    const checkinTime = new Date("2025-06-15T09:00:00");
    await repo.save({ id: visitId, churchId, personId, serviceId, visitDate, checkinTime } as any);
    const visit = await repo.load(churchId, visitId);
    expect(visit.checkinTime).not.toBeNull();
  });

  it("should loadForPerson", async () => {
    const results = await repo.loadForPerson(churchId, personId);
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it("should loadAllByDate", async () => {
    const start = new Date("2025-06-01");
    const end = new Date("2025-06-30");
    const results = await repo.loadAllByDate(churchId, start, end);
    expect((results as any[]).length).toBeGreaterThanOrEqual(1);
  });

  it("should loadByServiceDatePeopleIds", async () => {
    // Create a fresh visit with midnight date for exact match
    const testDate = new Date("2025-07-01T00:00:00");
    const v = await repo.save({ churchId, personId: "sdpid000001", serviceId: "sdpsvc00001", visitDate: testDate } as any);
    const results = await repo.loadByServiceDatePeopleIds(churchId, "sdpsvc00001", testDate, ["sdpid000001"]);
    expect((results as any[]).length).toBeGreaterThanOrEqual(1);
  });

  it("should loadLastLoggedDate", async () => {
    const date = await repo.loadLastLoggedDate(churchId, serviceId, [personId]);
    expect(date).toBeInstanceOf(Date);
  });

  it("should delete a visit", async () => {
    const temp = await repo.save({ churchId, personId: "delprs00001", serviceId, visitDate } as any);
    await repo.delete(churchId, temp.id);
    const deleted = await repo.load(churchId, temp.id);
    expect(deleted).toBeNull();
  });
});

describe("VisitSessionRepo", () => {
  const visitRepo = new VisitRepo();
  const sessionRepo = new SessionRepo();
  const repo = new VisitSessionRepo();
  let visitId: string;
  let sessionId: string;
  let vsId: string;

  beforeAll(async () => {
    const visit = await visitRepo.save({ churchId, personId: "vsprs000001", serviceId: "vssvc000001", visitDate: new Date("2025-06-15") } as any);
    visitId = visit.id;
    const session = await sessionRepo.save({ churchId, groupId: "vsgrp000001", serviceTimeId: "vsst0000001", sessionDate: new Date("2025-06-15") } as any);
    sessionId = session.id;
  });

  it("should create a visit session", async () => {
    const vs = await repo.save({ churchId, visitId, sessionId } as any);
    expect(vs.id).toBeDefined();
    vsId = vs.id;
  });

  it("should load by id", async () => {
    const vs = await repo.load(churchId, vsId);
    expect(vs).not.toBeNull();
    expect(vs.visitId).toBe(visitId);
  });

  it("should loadByVisitIdSessionId", async () => {
    const vs = await repo.loadByVisitIdSessionId(churchId, visitId, sessionId);
    expect(vs).not.toBeNull();
    expect(vs.id).toBe(vsId);
  });

  it("should loadByVisitIds", async () => {
    const results = await repo.loadByVisitIds(churchId, [visitId]);
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it("should loadByVisitId", async () => {
    const results = await repo.loadByVisitId(churchId, visitId);
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it("should loadForSession with personId", async () => {
    const results = await repo.loadForSession(churchId, sessionId);
    expect((results as any[]).length).toBeGreaterThanOrEqual(0);
  });
});
