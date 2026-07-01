import { RepoManager } from "../infrastructure/RepoManager.js";
import { civilDate, civilISO, CivilOccurrence } from "../helpers/CivilDate.js";

// Gateway: the only seam through which other modules read content data.
export interface ContentModuleGateway {
  loadRegistrationsByPerson(churchId: string, personId: string): Promise<any[]>;
  // Expand a recurring event's occurrences in the window to civil-local dates.
  // Lives here (not in messaging) so the recurrence engine stays inside content.
  expandEventOccurrences(event: any, from: Date, to: Date): Promise<CivilOccurrence[]>;
}

class ContentModuleGatewayDb implements ContentModuleGateway {
  private async repos() {
    return RepoManager.getRepos<any>("content");
  }

  public async loadRegistrationsByPerson(churchId: string, personId: string) {
    return (await this.repos()).registration.loadForPerson(churchId, personId);
  }

  public async expandEventOccurrences(event: any, from: Date, to: Date): Promise<CivilOccurrence[]> {
    const { RecurrenceHelper } = await import("../../modules/content/helpers/RecurrenceHelper.js");
    const occ = RecurrenceHelper.getOccurrences(event, from, to, 200) as { start: Date }[];
    return occ.map((o) => ({ startLocalDate: civilDate(o.start), startLocalISO: civilISO(o.start) }));
  }
}

let _instance: ContentModuleGateway;
export const getContentModuleGateway = (): ContentModuleGateway => (_instance ??= new ContentModuleGatewayDb());
