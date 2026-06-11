import { RepoManager } from "../infrastructure/RepoManager.js";

// Gateway: the only seam through which other modules read attendance data.
export interface AttendanceModuleGateway {
  loadVisitsByPerson(churchId: string, personId: string): Promise<any[]>;
  // People who have visited before but not since the cutoff — the template for an
  // absence-driven trigger (e.g. "absent 6 weeks" evaluated by a scheduled automation).
  findPeopleAbsentSince(churchId: string, since: Date): Promise<string[]>;
  // List-condition provider: people who attended in the window, optionally scoped to
  // one campus / service / serviceTime / group (at most one scope id set).
  loadAttendeePersonIds(churchId: string, scope: { campusId?: string; serviceId?: string; serviceTimeId?: string; groupId?: string }, startDate: Date, endDate: Date): Promise<string[]>;
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
