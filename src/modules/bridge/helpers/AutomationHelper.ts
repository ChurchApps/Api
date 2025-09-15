import { Repositories as DoingRepositories } from "../../doing/repositories/Repositories";
import { Repositories as MessagingRepositories } from "../../messaging/repositories/Repositories";
import { Repositories as MemembershipRepositories } from "../../membership/repositories/Repositories";
import { Notification } from "../../messaging/models/Notification";
import { Position } from "../../doing";
import { DB } from "../../../shared/infrastructure/DB";

export class AutomationHelper {
  private static subdomainCache: { [key: string]: string } = {};

  public static async remindServiceRequests(): Promise<void> {
    // Load assignments and create notifications all within proper contexts
    const notifications: Notification[] = [];
    const processedPeople = new Set<string>();

    // Load assignments and positions within doing context
    await DB.runWithContext("doing", async () => {
      const doingRepos = DoingRepositories.getCurrent();
      const unconfirmedAssignments = (await doingRepos.assignment.loadUnconfirmedByServiceDateRange()) as any[];

      for (const assignment of unconfirmedAssignments) {
        const personKey = `${assignment.churchId}-${assignment.personId}`;

        if (!processedPeople.has(personKey)) {
          processedPeople.add(personKey);

          // Get position within the doing context
          const position: Position = await doingRepos.position.load(assignment.churchId, assignment.positionId);

          // Get church subdomain within membership context
          let subDomain = this.subdomainCache[assignment.churchId];
          if (!subDomain) {
            const church = await DB.runWithContext("membership", async () => {
              return await MemembershipRepositories.getCurrent().church.loadById(assignment.churchId);
            });
            subDomain = church.subDomain;
            this.subdomainCache[assignment.churchId] = subDomain;
          }

          // Create notification object
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
            link: `https://${subDomain}.b1.church/my/plans/${position.planId}`
          };

          notifications.push(notification);
        }
      }
    });

    // Save notifications within messaging context
    if (notifications.length > 0) {
      await DB.runWithContext("messaging", async () => {
        const messagingRepos = MessagingRepositories.getCurrent();
        const promises: Promise<Notification>[] = [];
        for (const notification of notifications) {
          promises.push(messagingRepos.notification.save(notification));
        }
        await Promise.all(promises);
      });
    }

    console.log(`Sent ${notifications.length} service request reminder notifications`);
  }
}
