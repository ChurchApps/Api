import { RepoManager } from "../infrastructure/RepoManager.js";

// Gateway: the only seam through which other modules read attendance data.
export interface AttendanceModuleGateway {
  loadVisitsByPerson(churchId: string, personId: string): Promise<any[]>;
  // People who have visited before but not since the cutoff — the template for an
  // absence-driven trigger (e.g. "absent 6 weeks" evaluated by a scheduled automation).
  findPeopleAbsentSince(churchId: string, since: Date): Promise<string[]>;
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
}

let _instance: AttendanceModuleGateway;
export const getAttendanceModuleGateway = (): AttendanceModuleGateway => (_instance ??= new AttendanceModuleGatewayDb());
