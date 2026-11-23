import type { Repos } from "../repositories/index.js";
import {
  getGivingModuleGateway,
  getAttendanceModuleGateway,
  getMessagingModuleGateway,
  getDoingModuleGateway,
  getContentModuleGateway
} from "../../../shared/modules/index.js";

export interface GdprExportOptions {
  includeConfidentialNotes?: boolean;
}

// The membership repo methods the export reads; the full Repos satisfies it.
interface MembershipRepos {
  person: Pick<Repos["person"], "load">;
  household: Pick<Repos["household"], "load">;
  groupMember: Pick<Repos["groupMember"], "loadForPerson">;
  groupJoinRequest: Pick<Repos["groupJoinRequest"], "loadForPerson">;
  visibilityPreference: Pick<Repos["visibilityPreference"], "loadForPerson">;
  personFieldValue: Pick<Repos["personFieldValue"], "loadForPerson">;
  memberPermission: Pick<Repos["memberPermission"], "loadFormsByPerson">;
  formSubmission: Pick<Repos["formSubmission"], "loadForContent">;
  answer: Pick<Repos["answer"], "loadForFormSubmission">;
}

export class GdprExportHelper {

  public static async exportPersonData(churchId: string, personId: string, membershipRepos: MembershipRepos, options: GdprExportOptions = {}) {
    const giving = getGivingModuleGateway();
    const attendance = getAttendanceModuleGateway();
    const messaging = getMessagingModuleGateway();
    const doing = getDoingModuleGateway();
    const content = getContentModuleGateway();

    const noteTypes = options.includeConfidentialNotes ? ["person", "personConfidential"] : ["person"];

    const [
      person,
      groups,
      groupJoinRequests,
      visibilityPreferences,
      customFieldValues,
      memberPermissions,
      formSubmissions,
      donations,
      customers,
      subscriptions,
      paymentMethods,
      visits,
      devices,
      connections,
      deliveryLogs,
      notifications,
      notificationPreferences,
      privateMessages,
      notes,
      assignments,
      blockoutDates,
      tasks,
      registrations,
      registrationMembers,
      eventRsvps,
      eventBookings,
      documents
    ] = await Promise.all([
      membershipRepos.person.load(churchId, personId),
      membershipRepos.groupMember.loadForPerson(churchId, personId),
      membershipRepos.groupJoinRequest.loadForPerson(churchId, personId),
      membershipRepos.visibilityPreference.loadForPerson(churchId, personId),
      membershipRepos.personFieldValue.loadForPerson(churchId, personId),
      membershipRepos.memberPermission.loadFormsByPerson(churchId, personId),
      this.loadFormSubmissions(churchId, personId, membershipRepos),
      giving.loadDonationsByPerson(churchId, personId),
      giving.loadCustomersByPerson(churchId, personId),
      giving.loadSubscriptionsByPerson(churchId, personId),
      giving.loadPaymentMethodsByPerson(churchId, personId),
      attendance.loadVisitsByPerson(churchId, personId),
      messaging.loadDevicesByPerson(churchId, personId),
      messaging.loadConnectionsByPerson(churchId, personId),
      messaging.loadDeliveryLogsByPerson(churchId, personId),
      messaging.loadNotificationsByPerson(churchId, personId),
      messaging.loadNotificationPreferencesByPerson(churchId, personId),
      messaging.loadPrivateMessagesByPerson(churchId, personId),
      messaging.loadPersonNotes(churchId, personId, noteTypes),
      doing.loadAssignmentsByPerson(churchId, personId),
      doing.loadBlockoutDatesByPerson(churchId, personId),
      doing.loadTasksByPerson(churchId, personId),
      content.loadRegistrationsByPerson(churchId, personId),
      content.loadRegistrationMembersByPerson(churchId, personId),
      content.loadEventRsvpsByPerson(churchId, personId),
      content.loadEventBookingsByPerson(churchId, personId),
      content.loadPersonDocuments(churchId, personId)
    ]);

    // Load household if person has one
    let household = null;
    if (person?.householdId) {
      household = await membershipRepos.household.load(churchId, person.householdId);
    }

    return {
      exportedAt: new Date().toISOString(),
      confidentialNotesIncluded: !!options.includeConfidentialNotes,
      person,
      household,
      groups,
      groupJoinRequests,
      visibilityPreferences,
      customFieldValues,
      memberPermissions,
      formSubmissions,
      donations,
      customers,
      subscriptions,
      paymentMethods,
      visits,
      devices,
      connections,
      deliveryLogs,
      notifications,
      notificationPreferences,
      privateMessages,
      notes,
      assignments,
      blockoutDates,
      tasks,
      registrations,
      registrationMembers,
      eventRsvps,
      eventBookings,
      documents
    };
  }

  private static async loadFormSubmissions(churchId: string, personId: string, membershipRepos: MembershipRepos) {
    const submissions = await membershipRepos.formSubmission.loadForContent(churchId, "person", personId);
    return Promise.all((submissions || []).map(async (submission) => ({
      ...submission,
      answers: await membershipRepos.answer.loadForFormSubmission(churchId, submission.id)
    })));
  }

}
