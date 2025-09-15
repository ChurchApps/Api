import { Repositories as DoingRepositories } from "../../doing/repositories/Repositories";
import { Repositories as MessagingRepositories } from "../../messaging/repositories/Repositories";
import { Repositories as MemembershipRepositories } from "../../membership/repositories/Repositories";
import { Notification } from "../../messaging/models/Notification";
import { Assignment, Position } from "../../doing";

export class AutomationHelper {

  private static subdomainCache: { [key: string]: string } = {};


  public static async remindServiceRequests(): Promise<void> {
    const doingRepos = DoingRepositories.getCurrent();
    const messagingRepos = MessagingRepositories.getCurrent();
    const unconfirmedAssignments = await doingRepos.assignment.loadUnconfirmedByServiceDateRange() as any[];
    const notifications: Notification[] = [];
    const processedPeople = new Set<string>();

    for (const assignment of unconfirmedAssignments) {
      const personKey = `${assignment.churchId}-${assignment.personId}`;

      if (!processedPeople.has(personKey)) {
        processedPeople.add(personKey);
        const notification = await this.createReminder(assignment, assignment.serviceDate);
        notifications.push(notification);
      }
    }

    const promises: Promise<Notification>[] = [];
    for (const notification of notifications) promises.push(messagingRepos.notification.save(notification));
    await Promise.all(promises);

    console.log(`Sent ${notifications.length} service request reminder notifications`);
  }


  private static async createReminder(assignment: Assignment, serviceDate: Date) {
    let subDomain = this.subdomainCache[assignment.churchId];
    if (!subDomain) {
      const church = await MemembershipRepositories.getCurrent().church.loadById(assignment.churchId);
      subDomain = church.subDomain;
      this.subdomainCache[assignment.churchId] = subDomain;
    }

    const position: Position = await DoingRepositories.getCurrent().position.load(assignment.churchId, assignment.positionId);

    const serviceDateStr = new Date(serviceDate).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    const notification: Notification = {
      churchId: assignment.churchId,
      personId: assignment.personId,
      contentType: "assignment",
      contentId: assignment.id,
      timeSent: new Date(),
      isNew: true,
      message: `Reminder: Please confirm your volunteer request on ${serviceDateStr}`,
      link: "https://{key}.b1.church".replace("{key}", subDomain) + "/my/plans/" + position.planId
    };
    return notification;
  }

}