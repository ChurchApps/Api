import { RepoManager } from "../infrastructure/RepoManager.js";
import { KyselyPool } from "../infrastructure/KyselyPool.js";
import { WebhookDispatcher } from "../webhooks/WebhookDispatcher.js";
import { DateHelper } from "../helpers/DateHelper.js";
import { CheckinGateHelper } from "../../modules/attendance/helpers/CheckinGateHelper.js";

// Gateway: the only seam through which other modules read attendance data.
export interface AttendanceModuleGateway {
  loadVisitsByPerson(churchId: string, personId: string): Promise<any[]>;
  // People who have visited before but not since the cutoff — the template for an
  // absence-driven trigger (e.g. "absent 6 weeks" evaluated by a scheduled automation).
  findPeopleAbsentSince(churchId: string, since: Date): Promise<string[]>;
  // List-condition provider: people who attended in the window, optionally scoped to
  // one campus / service / serviceTime / group (at most one scope id set).
  loadAttendeePersonIds(churchId: string, scope: { campusId?: string; serviceId?: string; serviceTimeId?: string; groupId?: string }, startDate: Date, endDate: Date): Promise<string[]>;
  // The groups the given check-in sessions belong to (check-in trigger facts).
  loadSessionGroupIds(churchId: string, sessionIds: string[]): Promise<string[]>;
  // Groups that meet at a matching service time. Each id of "0" means "any".
  loadGroupIdsForServiceTimes(churchId: string, campusId: string, serviceId: string, serviceTimeId: string): Promise<string[]>;
  // Marks the person present for each of the group's scheduled service times under way at `at`.
  // Returns how many sessions the person is now present for (0 when none is in progress). Re-runs never double count.
  recordAttendance(churchId: string, personId: string, groupId: string, at: Date): Promise<number>;
}

class AttendanceModuleGatewayDb implements AttendanceModuleGateway {
  private async repos() {
    return RepoManager.getRepos<any>("attendance");
  }

  public async loadVisitsByPerson(churchId: string, personId: string) {
    return (await this.repos()).visit.loadForPerson(churchId, personId);
  }

  public async findPeopleAbsentSince(churchId: string, since: Date) {
    return (await this.repos()).visit.loadPersonIdsAbsentSince(churchId, since);
  }

  public async loadSessionGroupIds(churchId: string, sessionIds: string[]): Promise<string[]> {
    if (sessionIds.length === 0) return [];
    const db = KyselyPool.getDb("attendance") as any;
    const rows = (await db.selectFrom("sessions")
      .select("groupId")
      .where("churchId", "=", churchId)
      .where("id", "in", sessionIds)
      .execute()) as { groupId: string }[];
    return [...new Set(rows.map((r) => r.groupId).filter((id: string) => !!id))];
  }

  public async loadGroupIdsForServiceTimes(churchId: string, campusId: string, serviceId: string, serviceTimeId: string): Promise<string[]> {
    const db = KyselyPool.getDb("attendance") as any;
    let query = db.selectFrom("groupServiceTimes as gst")
      .innerJoin("serviceTimes as st", "st.id", "gst.serviceTimeId")
      .innerJoin("services as s", "s.id", "st.serviceId")
      .select("gst.groupId")
      .where("gst.churchId", "=", churchId);
    if (serviceTimeId !== "0") query = query.where("gst.serviceTimeId", "=", serviceTimeId);
    if (serviceId !== "0") query = query.where("st.serviceId", "=", serviceId);
    if (campusId !== "0") query = query.where("s.campusId", "=", campusId);
    const rows = (await query.execute()) as { groupId: string }[];
    return [...new Set(rows.map((r) => r.groupId).filter((id: string) => !!id))];
  }

  public async recordAttendance(churchId: string, personId: string, groupId: string, at: Date): Promise<number> {
    const repos = await this.repos();
    const links = (await repos.groupServiceTime.loadWithServiceNames(churchId, groupId)) as { serviceTimeId: string }[];
    const serviceTimeIds = [...new Set(links.map((l) => l.serviceTimeId).filter(Boolean))];
    if (serviceTimeIds.length === 0) return 0;
    // Lazy: the zone helper reaches back through shared/modules, which this gateway is part of.
    const { CheckinTimeZoneHelper } = await import("../../modules/attendance/helpers/CheckinTimeZoneHelper.js");
    const zoneFor = await CheckinTimeZoneHelper.load(churchId, repos.service);
    // Unscheduled service times are always open for check-in, but would match at any hour here.
    const open = ((await repos.serviceTime.loadByIds(churchId, serviceTimeIds)) as any[])
      .filter((st) => !st.removed && CheckinGateHelper.hasSchedule(st) && CheckinGateHelper.isServiceTimeOpen(st, at, zoneFor(st)));

    let recorded = 0;
    for (const st of open) {
      // The church-local calendar date, held as local midnight like check-in's currentDate.
      const [y, m, d] = DateHelper.toChurchTime(at, zoneFor(st)).substring(0, 10).split("-").map(Number);
      const date = new Date(y, m - 1, d);

      let session = await repos.session.loadByGroupServiceTimeDate(churchId, groupId, st.id, date);
      if (!session) {
        session = await repos.session.save({ churchId, groupId, serviceTimeId: st.id, sessionDate: date });
        await WebhookDispatcher.emit(churchId, "session.created", session);
      }

      const existing = (await repos.visit.loadByServiceDatePeopleIds(churchId, st.serviceId, date, [personId])) as any[];
      const visit = existing.length > 0
        ? existing[0]
        : await repos.visit.save({ churchId, personId, serviceId: st.serviceId, groupId, visitDate: date, checkinTime: at });
      recorded++;
      if (await repos.visitSession.loadByVisitIdSessionId(churchId, visit.id, session.id)) continue; // already counted
      await repos.visitSession.save({ churchId, visitId: visit.id, sessionId: session.id });
      await WebhookDispatcher.emit(churchId, "attendance.recorded", visit);
    }
    return recorded;
  }

  public async loadAttendeePersonIds(churchId: string, scope: { campusId?: string; serviceId?: string; serviceTimeId?: string; groupId?: string }, startDate: Date, endDate: Date) {
    const repos = await this.repos();
    let rows: any[];
    if (scope.campusId) rows = await repos.attendance.loadByCampusId(churchId, scope.campusId, startDate, endDate);
    else if (scope.serviceId) rows = await repos.attendance.loadByServiceId(churchId, scope.serviceId, startDate, endDate);
    else if (scope.serviceTimeId) rows = await repos.attendance.loadByServiceTimeId(churchId, scope.serviceTimeId, startDate, endDate);
    else if (scope.groupId) rows = await repos.attendance.loadByGroupId(churchId, scope.groupId, startDate, endDate);
    else rows = await repos.visit.loadAllByDate(churchId, startDate, endDate);
    const ids = new Set<string>();
    (rows || []).forEach((r: any) => { if (r.personId) ids.add(r.personId); });
    return Array.from(ids);
  }
}

let _instance: AttendanceModuleGateway;
export const getAttendanceModuleGateway = (): AttendanceModuleGateway => (_instance ??= new AttendanceModuleGatewayDb());
