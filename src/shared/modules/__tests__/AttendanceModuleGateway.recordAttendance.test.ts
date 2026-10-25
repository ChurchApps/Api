jest.mock("../../infrastructure/KyselyPool.js", () => ({ KyselyPool: { getDb: jest.fn() } }));
jest.mock("../../infrastructure/RepoManager.js", () => ({ RepoManager: { getRepos: jest.fn() } }));
jest.mock("../../webhooks/WebhookDispatcher.js", () => ({ WebhookDispatcher: { emit: jest.fn().mockResolvedValue(undefined) } }));
jest.mock("../../../modules/attendance/helpers/CheckinTimeZoneHelper.js", () => ({ CheckinTimeZoneHelper: { load: jest.fn(async () => () => "America/Chicago") } }));

import { RepoManager } from "../../infrastructure/RepoManager.js";
import { WebhookDispatcher } from "../../webhooks/WebhookDispatcher.js";
import { getAttendanceModuleGateway } from "../AttendanceModuleGateway.js";

// Sunday night service, 6:30–7:45pm church time (America/Chicago).
const sundayNight = { id: "st1", serviceId: "s1", dayOfWeek: 0, startTime: "18:30", endTime: "19:45" };
const during = new Date("2026-10-25T23:50:00Z"); // Sunday 6:50pm CDT
const after = new Date("2026-10-26T02:00:00Z"); // Sunday 9:00pm CDT

function fakeRepos(serviceTimes: any[]) {
  const sessions: any[] = [];
  const visits: any[] = [];
  const visitSessions: any[] = [];
  let n = 0;
  const repos = {
    groupServiceTime: { loadWithServiceNames: jest.fn(async () => serviceTimes.map((st) => ({ groupId: "g1", serviceTimeId: st.id }))) },
    serviceTime: { loadByIds: jest.fn(async () => serviceTimes) },
    service: { loadAll: jest.fn(async () => []) },
    session: {
      loadByGroupServiceTimeDate: jest.fn(async (_c: string, groupId: string, serviceTimeId: string, date: Date) =>
        sessions.find((s) => s.groupId === groupId && s.serviceTimeId === serviceTimeId && s.sessionDate.getTime() === date.getTime()) || null),
      save: jest.fn(async (s: any) => { s.id = "sess" + ++n; sessions.push(s); return s; })
    },
    visit: {
      loadByServiceDatePeopleIds: jest.fn(async (_c: string, serviceId: string, date: Date, peopleIds: string[]) =>
        visits.filter((v) => v.serviceId === serviceId && v.visitDate.getTime() === date.getTime() && peopleIds.includes(v.personId))),
      save: jest.fn(async (v: any) => { if (!v.id) { v.id = "v" + ++n; visits.push(v); } return v; })
    },
    visitSession: {
      loadByVisitIdSessionId: jest.fn(async (_c: string, visitId: string, sessionId: string) => visitSessions.find((vs) => vs.visitId === visitId && vs.sessionId === sessionId) || null),
      save: jest.fn(async (vs: any) => { vs.id = "vs" + ++n; visitSessions.push(vs); return vs; })
    }
  };
  (RepoManager.getRepos as jest.Mock).mockResolvedValue(repos);
  return { repos, sessions, visits, visitSessions };
}

describe("AttendanceModuleGateway.recordAttendance", () => {
  beforeEach(() => jest.clearAllMocks());

  it("marks the person present for the group's service time that is under way", async () => {
    const { sessions, visits, visitSessions } = fakeRepos([sundayNight]);
    const count = await getAttendanceModuleGateway().recordAttendance("c1", "p1", "g1", during);
    expect(count).toBe(1);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ churchId: "c1", groupId: "g1", serviceTimeId: "st1" });
    // The church-local date (Sunday), not the UTC date of the submission.
    expect([sessions[0].sessionDate.getFullYear(), sessions[0].sessionDate.getMonth(), sessions[0].sessionDate.getDate()]).toEqual([2026, 9, 25]);
    expect(visits).toHaveLength(1);
    expect(visits[0]).toMatchObject({ churchId: "c1", personId: "p1", serviceId: "s1", groupId: "g1" });
    expect(visitSessions).toEqual([expect.objectContaining({ visitId: visits[0].id, sessionId: sessions[0].id })]);
    expect(WebhookDispatcher.emit).toHaveBeenCalledWith("c1", "attendance.recorded", expect.objectContaining({ personId: "p1" }));
  });

  it("records nothing when no scheduled service time is under way", async () => {
    const { sessions, visits } = fakeRepos([sundayNight]);
    expect(await getAttendanceModuleGateway().recordAttendance("c1", "p1", "g1", after)).toBe(0);
    expect(sessions).toHaveLength(0);
    expect(visits).toHaveLength(0);
  });

  it("never treats an unscheduled service time as under way", async () => {
    const { visits } = fakeRepos([{ id: "st2", serviceId: "s1", dayOfWeek: null, startTime: null }]);
    expect(await getAttendanceModuleGateway().recordAttendance("c1", "p1", "g1", during)).toBe(0);
    expect(visits).toHaveLength(0);
  });

  it("does not count the same person twice when it runs again", async () => {
    const { sessions, visits, visitSessions } = fakeRepos([sundayNight]);
    await getAttendanceModuleGateway().recordAttendance("c1", "p1", "g1", during);
    expect(await getAttendanceModuleGateway().recordAttendance("c1", "p1", "g1", during)).toBe(1);
    expect(sessions).toHaveLength(1);
    expect(visits).toHaveLength(1);
    expect(visitSessions).toHaveLength(1);
    expect(WebhookDispatcher.emit).toHaveBeenCalledTimes(2); // session.created + one attendance.recorded
  });

  it("honors the check-in open minutes before the start", async () => {
    const { visits } = fakeRepos([{ ...sundayNight, checkinOpenMinutes: 30 }]);
    const early = new Date("2026-10-25T23:10:00Z"); // 6:10pm CDT
    expect(await getAttendanceModuleGateway().recordAttendance("c1", "p1", "g1", early)).toBe(1);
    expect(visits).toHaveLength(1);
  });
});
