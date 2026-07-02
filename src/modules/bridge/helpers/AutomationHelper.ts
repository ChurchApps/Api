import { Notification } from "../../messaging/models/Notification.js";
import { getMembershipModuleGateway, getMessagingModuleGateway } from "../../../shared/modules/index.js";
import { RepoManager } from "../../../shared/infrastructure/RepoManager.js";
import { KyselyPool } from "../../../shared/infrastructure/KyselyPool.js";
import { CalendarHelper } from "../../content/helpers/CalendarHelper.js";
import { RecurrenceHelper } from "../../content/helpers/RecurrenceHelper.js";
import { HolidayHelper } from "../../content/helpers/HolidayHelper.js";

export class AutomationHelper {
  private static subdomainCache: { [key: string]: string } = {};

  private static async getSubDomain(churchId: string): Promise<string | undefined> {
    let subDomain = this.subdomainCache[churchId];
    if (!subDomain) {
      const church = await getMembershipModuleGateway().loadChurch(churchId);
      subDomain = church?.subDomain;
      if (subDomain) this.subdomainCache[churchId] = subDomain;
    }
    return subDomain;
  }

  // Midnight job: for groups with attendanceReminders on, if a group event
  // occurred yesterday but no attendance session was recorded, nudge the leaders.
  public static async remindGroupAttendance(): Promise<number> {
    const membershipRepos = await RepoManager.getRepos<any>("membership");
    const contentRepos = await RepoManager.getRepos<any>("content");
    const attendanceDb = KyselyPool.getDb("attendance") as any;

    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    dayStart.setDate(dayStart.getDate() - 1);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const groups = (await membershipRepos.group.loadAttendanceReminderGroups()) as any[];
    const notifications: Notification[] = [];

    for (const group of groups) {
      try {
        const events = (await contentRepos.event.loadForGroup(group.churchId, group.id)) as any[];
        if (!events?.length) continue;
        await CalendarHelper.addExceptionDates(events, contentRepos);
        const metYesterday = events.some((ev) => {
          const exceptions = (ev.exceptionDates || []).map((d: any) => HolidayHelper.toKey(new Date(d)));
          return RecurrenceHelper.getOccurrences(ev, dayStart, dayEnd, 5).some((o) => !exceptions.includes(HolidayHelper.toKey(o.start)));
        });
        if (!metYesterday) continue;

        const sessions = await attendanceDb.selectFrom("sessions").select("id")
          .where("churchId", "=", group.churchId)
          .where("groupId", "=", group.id)
          .where("sessionDate", ">=", dayStart)
          .where("sessionDate", "<", dayEnd)
          .execute();
        if (sessions.length > 0) continue;

        const leaders = (await membershipRepos.groupMember.loadLeadersForGroup(group.churchId, group.id)) as any[];
        const leaderIds = leaders.map((l) => l.personId).filter(Boolean);
        if (!leaderIds.length) continue;

        const subDomain = await this.getSubDomain(group.churchId);
        const dateStr = dayStart.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
        for (const personId of leaderIds) {
          notifications.push({
            churchId: group.churchId,
            personId,
            contentType: "group",
            contentId: group.id,
            timeSent: new Date(),
            isNew: true,
            message: `Reminder: attendance hasn't been recorded for ${group.name} (${dateStr})`,
            link: subDomain ? `https://${subDomain}.b1.church/mobile/groups/${group.id}` : undefined
          });
        }
      } catch (e) {
        console.error(`[remindGroupAttendance] Failed for group ${group.id}:`, e);
      }
    }

    if (notifications.length > 0) await getMessagingModuleGateway().createNotifications(notifications);
    console.log(`Sent ${notifications.length} group attendance reminder notifications`);
    return notifications.length;
  }
}
