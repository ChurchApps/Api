import { Repos as DoingRepos } from "../../doing/repositories/Repos.js";
import { Repos as MessagingRepos } from "../../messaging/repositories/Repos.js";
import { Repos as MembershipRepos } from "../../membership/repositories/Repos.js";
import { Notification } from "../../messaging/models/Notification.js";
import { Position } from "../../doing/index.js";

export class AutomationHelper {
  private static subdomainCache: { [key: string]: string } = {};

  public static async remindServiceRequests(): Promise<void> {
    const notifications: Notification[] = [];
    const processedPeople = new Set<string>();

    const doingRepos = DoingRepos.getCurrent();
    const unconfirmedAssignments = (await doingRepos.assignment.loadUnconfirmedByServiceDateRange()) as any[];

    for (const assignment of unconfirmedAssignments) {
      const personKey = `${assignment.churchId}-${assignment.personId}`;

      if (!processedPeople.has(personKey)) {
        processedPeople.add(personKey);

        const position: Position = await doingRepos.position.load(assignment.churchId, assignment.positionId);

        let subDomain = this.subdomainCache[assignment.churchId];
        if (!subDomain) {
          const church = await MembershipRepos.getCurrent().church.loadById(assignment.churchId);
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
      const messagingRepos = MessagingRepos.getCurrent();
      const promises: Promise<Notification>[] = [];
      for (const notification of notifications) {
        promises.push(messagingRepos.notification.save(notification));
      }
      await Promise.all(promises);
    }

    console.log(`Sent ${notifications.length} service request reminder notifications`);
  }
}
