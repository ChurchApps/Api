import "reflect-metadata";
import { Environment } from "../src/shared/helpers/Environment";
import { MultiDatabasePool } from "../src/shared/infrastructure/MultiDatabasePool";
import { TypedDB } from "../src/shared/infrastructure/TypedDB";
import { Notification } from "../src/modules/messaging/models/Notification";
import { UniqueIdHelper } from "@churchapps/apihelper";

// Direct database access version for standalone execution
async function runScheduledTasks() {
  try {
    console.log("Initializing environment...");
    await Environment.init(process.env.ENVIRONMENT || "dev");
    
    console.log("Running scheduled tasks locally...");
    console.log("========================================");
    
    console.log("Processing service request reminders...");
    
    // Query assignments directly using queryModule
    const assignmentsSql = 
      "SELECT a.*, pl.serviceDate, pl.name as planName, p.planId" +
      " FROM assignments a" +
      " INNER JOIN positions p ON p.id = a.positionId" +
      " INNER JOIN plans pl ON pl.id = p.planId" +
      " WHERE a.status = 'Unconfirmed'" +
      " AND pl.serviceDate >= DATE_ADD(CURDATE(), INTERVAL 2 DAY)" +
      " AND pl.serviceDate < DATE_ADD(CURDATE(), INTERVAL 3 DAY)";
    
    const unconfirmedAssignments = await TypedDB.queryModule("doing", assignmentsSql, []);
    console.log(`Found ${unconfirmedAssignments.length} unconfirmed assignments`);
    
    const notifications: Notification[] = [];
    const processedPeople = new Set<string>();
    const subdomainCache: { [key: string]: string } = {};
    
    for (const assignment of unconfirmedAssignments) {
      const personKey = `${assignment.churchId}-${assignment.personId}`;
      
      if (!processedPeople.has(personKey)) {
        processedPeople.add(personKey);
        
        // Get church subdomain if not cached
        let subDomain = subdomainCache[assignment.churchId];
        if (!subDomain) {
          const churchResult = await TypedDB.queryOneModule(
            "membership", 
            "SELECT subDomain FROM churches WHERE id = ?", 
            [assignment.churchId]
          );
          subDomain = churchResult?.subDomain || "app";
          subdomainCache[assignment.churchId] = subDomain;
        }
        
        // Create notification
        const serviceDateStr = new Date(assignment.serviceDate).toLocaleDateString("en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric"
        });
        
        const notification: Notification = {
          id: UniqueIdHelper.shortId(),
          churchId: assignment.churchId,
          personId: assignment.personId,
          contentType: "assignment",
          contentId: assignment.id,
          timeSent: new Date(),
          isNew: true,
          message: `Reminder: Please confirm your volunteer request for ${assignment.planName} on ${serviceDateStr}`,
          link: `https://${subDomain}.b1.church/my/plans/${assignment.planId}`
        };
        
        notifications.push(notification);
      }
    }
    
    // Save notifications directly
    if (notifications.length > 0) {
      for (const notification of notifications) {
        const sql = "INSERT INTO notifications (id, churchId, personId, contentType, contentId, timeSent, isNew, message, link) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)";
        const params = [
          notification.id,
          notification.churchId,
          notification.personId,
          notification.contentType,
          notification.contentId,
          notification.timeSent,
          notification.isNew ? 1 : 0,
          notification.message,
          notification.link
        ];
        await TypedDB.queryModule("messaging", sql, params);
      }
    }
    
    console.log(`Created ${notifications.length} service request reminder notifications`);
    
    console.log("========================================");
    console.log("Scheduled tasks completed successfully!");
    
    // Close database connections
    await MultiDatabasePool.closeAll();
    
    process.exit(0);
  } catch (error) {
    console.error("Error running scheduled tasks:", error);
    console.error("Stack trace:", error.stack);
    process.exit(1);
  }
}

runScheduledTasks();