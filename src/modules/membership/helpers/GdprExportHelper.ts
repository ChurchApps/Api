import { RepoManager } from "../../../shared/infrastructure/index.js";
import { Repos as MembershipRepos } from "../repositories/index.js";

export class GdprExportHelper {

  public static async exportPersonData(churchId: string, personId: string, membershipRepos: MembershipRepos) {
    const [givingRepos, attendanceRepos, messagingRepos, doingRepos, contentRepos] = await Promise.all([
      RepoManager.getRepos<any>("giving"),
      RepoManager.getRepos<any>("attendance"),
      RepoManager.getRepos<any>("messaging"),
      RepoManager.getRepos<any>("doing"),
      RepoManager.getRepos<any>("content")
    ]);

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
      givingRepos.donation.loadByPersonId(churchId, personId),
      givingRepos.customer.loadByPersonId(churchId, personId),
      attendanceRepos.visit.loadForPerson(churchId, personId),
      messagingRepos.device.loadByPersonId(churchId, personId),
      messagingRepos.notification.loadByPersonId(churchId, personId),
      messagingRepos.notificationPreference.loadByPersonId(churchId, personId),
      messagingRepos.privateMessage.loadByPersonId(churchId, personId),
      doingRepos.assignment.loadByByPersonId(churchId, personId),
      doingRepos.blockoutDate.loadForPerson(churchId, personId),
      contentRepos.registration.loadForPerson(churchId, personId)
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
