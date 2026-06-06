import { Notification } from "../../messaging/models/Notification.js";
import { getDoingModuleGateway, getMembershipModuleGateway, getMessagingModuleGateway } from "../../../shared/modules/index.js";

export class AutomationHelper {
  private static subdomainCache: { [key: string]: string } = {};

  public static async remindServiceRequests(): Promise<void> {
    const notifications: Notification[] = [];
    const processedPeople = new Set<string>();

    const doing = getDoingModuleGateway();
    const unconfirmedAssignments = (await doing.loadUnconfirmedAssignments()) as any[];

    for (const assignment of unconfirmedAssignments) {
      const personKey = `${assignment.churchId}-${assignment.personId}`;

      if (!processedPeople.has(personKey)) {
        processedPeople.add(personKey);

        const position: any = await doing.loadPosition(assignment.churchId, assignment.positionId);

        let subDomain = this.subdomainCache[assignment.churchId];
        if (!subDomain) {
          const church = await getMembershipModuleGateway().loadChurch(assignment.churchId);
          subDomain = church.subDomain;
          this.subdomainCache[assignment.churchId] = subDomain;
        }

        const serviceDateStr = new Date(assignment.serviceDate).toLocaleDateString("en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric"
        });

        const notification: Notification = {
          churchId: assignment.churchId,
          personId: assignment.personId,
          contentType: "assignment",
          contentId: assignment.id,
          timeSent: new Date(),
          isNew: true,
          message: `Reminder: Please confirm your volunteer request on ${serviceDateStr}`,
          link: `https://${subDomain}.b1.church/my/plans?id=${position.planId}`
        };

        notifications.push(notification);
      }
    }

    if (notifications.length > 0) {
      await getMessagingModuleGateway().createNotifications(notifications);
    }

    console.log(`Sent ${notifications.length} service request reminder notifications`);
  }
}
