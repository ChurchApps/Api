import { getMembershipModuleGateway } from "../../../shared/modules/index.js";

interface ServiceLoader {
  loadAll(churchId: string): Promise<{ id: string; campusId?: string | null }[]>;
}

export class CheckinTimeZoneHelper {
  // Returns the zone each service time's check-in window is measured in: its service's campus zone,
  // then the church zone, then the first campus zone. Undefined means New York (DateHelper default).
  // The campus comes first because most churches had America/New_York backfilled as their church zone.
  static async load(churchId: string, serviceRepo: ServiceLoader): Promise<(serviceTime: { serviceId?: string | null }) => string | undefined> {
    const gateway = getMembershipModuleGateway();
    const [church, campusZones, services] = await Promise.all([gateway.loadChurch(churchId), gateway.loadCampusTimeZones(churchId), serviceRepo.loadAll(churchId)]);
    const serviceCampus: Record<string, string> = {};
    services.forEach((s) => { if (s.campusId) serviceCampus[s.id] = s.campusId; });
    const fallback = church?.timeZone || (await gateway.loadCampusTimeZone(churchId)) || undefined;
    return (serviceTime) => campusZones[serviceCampus[serviceTime.serviceId ?? ""]] || fallback;
  }
}
