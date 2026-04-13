import { RepoManager } from "../../../shared/infrastructure/index.js";
import { Repos as MembershipRepos } from "../repositories/index.js";
import { Repos as GivingRepos } from "../../giving/repositories/Repos.js";
import { Repos as AttendanceRepos } from "../../attendance/repositories/Repos.js";
import { Repos as MessagingRepos } from "../../messaging/repositories/Repos.js";
import { Repos as DoingRepos } from "../../doing/repositories/Repos.js";
import { Repos as ContentRepos } from "../../content/repositories/Repos.js";

export class GdprExportHelper {

  public static async exportPersonData(churchId: string, personId: string, membershipRepos: MembershipRepos) {
    const [givingRepos, attendanceRepos, messagingRepos, doingRepos, contentRepos] = await Promise.all([
      RepoManager.getRepos<GivingRepos>("giving"),
      RepoManager.getRepos<AttendanceRepos>("attendance"),
      RepoManager.getRepos<MessagingRepos>("messaging"),
      RepoManager.getRepos<DoingRepos>("doing"),
      RepoManager.getRepos<ContentRepos>("content")
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
