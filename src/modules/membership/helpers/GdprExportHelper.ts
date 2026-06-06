import { Repos as MembershipRepos } from "../repositories/index.js";
import {
  getGivingModuleGateway,
  getAttendanceModuleGateway,
  getMessagingModuleGateway,
  getDoingModuleGateway,
  getContentModuleGateway
} from "../../../shared/modules/index.js";

export class GdprExportHelper {

  public static async exportPersonData(churchId: string, personId: string, membershipRepos: MembershipRepos) {
    const giving = getGivingModuleGateway();
    const attendance = getAttendanceModuleGateway();
    const messaging = getMessagingModuleGateway();
    const doing = getDoingModuleGateway();
    const content = getContentModuleGateway();

    const [
      person,
      groups,
      visibilityPreferences,
      donations,
      customers,
      visits,
      devices,
      notifications,
      notificationPreferences,
      privateMessages,
      assignments,
      blockoutDates,
      registrations
    ] = await Promise.all([
      membershipRepos.person.load(churchId, personId),
      membershipRepos.groupMember.loadForPerson(churchId, personId),
      membershipRepos.visibilityPreference.loadForPerson(churchId, personId),
      giving.loadDonationsByPerson(churchId, personId),
      giving.loadCustomersByPerson(churchId, personId),
      attendance.loadVisitsByPerson(churchId, personId),
      messaging.loadDevicesByPerson(churchId, personId),
      messaging.loadNotificationsByPerson(churchId, personId),
      messaging.loadNotificationPreferencesByPerson(churchId, personId),
      messaging.loadPrivateMessagesByPerson(churchId, personId),
      doing.loadAssignmentsByPerson(churchId, personId),
      doing.loadBlockoutDatesByPerson(churchId, personId),
      content.loadRegistrationsByPerson(churchId, personId)
    ]);

    // Load household if person has one
    let household = null;
    if (person?.householdId) {
      household = await membershipRepos.household.load(churchId, person.householdId);
    }

    return {
      exportedAt: new Date().toISOString(),
      person,
      household,
      groups,
      visibilityPreferences,
      donations,
      customers,
      visits,
      devices,
      notifications,
      notificationPreferences,
      privateMessages,
      assignments,
      blockoutDates,
      registrations
    };
  }

}
