import { sql } from "kysely";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { KyselyPool } from "./KyselyPool.js";
import { Notification } from "../../modules/messaging/models/Notification.js";

const getUnconfirmedAssignments = async (): Promise<any[]> => {
  const query =
    "SELECT a.*, pl.serviceDate, pl.name as planName, p.planId" +
    " FROM assignments a" +
    " INNER JOIN positions p ON p.id = a.positionId" +
    " INNER JOIN plans pl ON pl.id = p.planId" +
    " WHERE a.status = 'Unconfirmed'" +
    " AND pl.serviceDate >= DATE_ADD(CURDATE(), INTERVAL 2 DAY)" +
    " AND pl.serviceDate < DATE_ADD(CURDATE(), INTERVAL 3 DAY)";
  const db = KyselyPool.getDb("doing");
  const result = await sql.raw(query).execute(db);
  return result.rows as any[];
};

const getChurchSubDomain = async (churchId: string, cache: { [key: string]: string }): Promise<string> => {
  if (!cache[churchId]) {
    const db = KyselyPool.getDb("membership");
    const result = await sql`SELECT subDomain FROM churches WHERE id = ${churchId}`.execute(db);
    const row = (result.rows as any[])[0];
    cache[churchId] = row?.subDomain || "app";
  }
  return cache[churchId];
};

const buildReminderNotification = (assignment: any, subDomain: string): Notification => {
  const serviceDateStr = new Date(assignment.serviceDate).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  return {
    id: UniqueIdHelper.shortId(),
    churchId: assignment.churchId,
    personId: assignment.personId,
    contentType: "assignment",
    contentId: assignment.id,
    timeSent: new Date(),
    isNew: true,
    message: `Reminder: Please confirm your volunteer request for ${assignment.planName} on ${serviceDateStr}`,
    link: `https://${subDomain}.b1.church/mobile/plans?id=${assignment.planId}`
  };
};

const buildAssignmentNotifications = async (assignments: any[]): Promise<Notification[]> => {
  const notifications: Notification[] = [];
  const processedPeople = new Set<string>();
  const subdomainCache: { [key: string]: string } = {};

  for (const assignment of assignments) {
    const personKey = `${assignment.churchId}-${assignment.personId}`;
    if (!processedPeople.has(personKey)) {
      processedPeople.add(personKey);
      const subDomain = await getChurchSubDomain(assignment.churchId, subdomainCache);
      notifications.push(buildReminderNotification(assignment, subDomain));
    }
  }
  return notifications;
};

const saveNotifications = async (notifications: Notification[]): Promise<void> => {
  const db = KyselyPool.getDb("messaging");
  for (const n of notifications) {
    await sql`INSERT INTO notifications (id, churchId, personId, contentType, contentId, timeSent, isNew, message, link) VALUES (${n.id}, ${n.churchId}, ${n.personId}, ${n.contentType}, ${n.contentId}, ${n.timeSent}, ${n.isNew ? 1 : 0}, ${n.message}, ${n.link})`.execute(db);
  }
};

export const processServiceRequestReminders = async (): Promise<void> => {
  const assignments = await getUnconfirmedAssignments();
  console.warn(`[scheduled-tasks] Found ${assignments.length} unconfirmed assignments`);
  const notifications = await buildAssignmentNotifications(assignments);
  await saveNotifications(notifications);
  console.warn(`[scheduled-tasks] Created ${notifications.length} reminder notifications`);
};
