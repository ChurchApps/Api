import "reflect-metadata";
import { Environment } from "../src/shared/helpers/Environment";
import { KyselyPool } from "../src/shared/infrastructure/KyselyPool";
import { sql } from "kysely";
import { Notification } from "../src/modules/messaging/models/Notification";
import { UniqueIdHelper } from "@churchapps/apihelper";

async function getUnconfirmedAssignments() {
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
}

async function getChurchSubDomain(churchId: string, cache: { [key: string]: string }) {
  if (!cache[churchId]) {
    const db = KyselyPool.getDb("membership");
    const result = await sql`SELECT subDomain FROM churches WHERE id = ${churchId}`.execute(db);
    const row = (result.rows as any[])[0];
    cache[churchId] = row?.subDomain || "app";
  }
  return cache[churchId];
}

function buildReminderNotification(assignment: any, subDomain: string): Notification {
  const serviceDateStr = new Date(assignment.serviceDate).toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric"
  });
  return {
    id: UniqueIdHelper.shortId(),
    churchId: assignment.churchId,
    personId: assignment.personId,
    contentType: "assignment",
    contentId: assignment.id,
    timeSent: new Date(),
    isNew: true,
    message: `Reminder: Please confirm your volunteer request for ${assignment.planName} on ${serviceDateStr}`,
    link: `https://${subDomain}.b1.church/my/plans?id=${assignment.planId}`
  };
}

async function buildAssignmentNotifications(assignments: any[]): Promise<Notification[]> {
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
}

async function saveNotifications(notifications: Notification[]) {
  const db = KyselyPool.getDb("messaging");
  for (const n of notifications) {
    await sql`INSERT INTO notifications (id, churchId, personId, contentType, contentId, timeSent, isNew, message, link) VALUES (${n.id}, ${n.churchId}, ${n.personId}, ${n.contentType}, ${n.contentId}, ${n.timeSent}, ${n.isNew ? 1 : 0}, ${n.message}, ${n.link})`.execute(db);
  }
}

async function processServiceRequestReminders() {
  console.log("Processing service request reminders...");
  const assignments = await getUnconfirmedAssignments();
  console.log(`Found ${assignments.length} unconfirmed assignments`);
  const notifications = await buildAssignmentNotifications(assignments);
  await saveNotifications(notifications);
  console.log(`Created ${notifications.length} service request reminder notifications`);
}

async function runScheduledTasks() {
  try {
    console.log("Initializing environment...");
    await Environment.init(process.env.ENVIRONMENT || "dev");

    console.log("Running scheduled tasks locally...");
    console.log("========================================");

    await processServiceRequestReminders();

    console.log("========================================");
    console.log("Scheduled tasks completed successfully!");

    await KyselyPool.destroyAll();
    process.exit(0);
  } catch (error: any) {
    console.error("Error running scheduled tasks:", error);
    console.error("Stack trace:", error.stack);
    process.exit(1);
  }
}

runScheduledTasks();
