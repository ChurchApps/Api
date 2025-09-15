import { ScheduledEvent, Context } from "aws-lambda";

import { Environment } from "../shared/helpers/Environment";
import { DB } from "../shared/infrastructure/DB";

import { NotificationHelper } from "../modules/messaging/helpers/NotificationHelper";
import { RepositoryManager } from "../shared/infrastructure/RepositoryManager";
import { AutomationHelper } from "../modules/bridge/helpers/AutomationHelper";

const initEnv = async () => {
  if (!Environment.currentEnvironment) {
    await Environment.init(process.env.ENVIRONMENT || "dev");

    // Pools now auto-initialize on first use

    // Initialize messaging helpers within the messaging module context
    await DB.runWithContext("messaging", async () => {
      const repositories = await RepositoryManager.getRepositories<any>("messaging");
      NotificationHelper.init(repositories);
    });
  }
};

export const handle15MinTimer = async (_event: ScheduledEvent, _context: Context): Promise<void> => {
  try {
    await initEnv();

    console.log("15-minute timer triggered - processing individual email notifications");

    // Run within messaging module context
    await DB.runWithContext("messaging", async () => {
      const result = await NotificationHelper.sendEmailNotifications("individual");
      console.log("15-minute timer completed", result);
    });
  } catch (error) {
    console.error("Error in 15-minute timer:", error);
    throw error;
  }
};

export const handleMidnightTimer = async (_event: ScheduledEvent, _context: Context): Promise<void> => {
  try {
    await initEnv();

    console.log("Midnight timer triggered - processing daily digest email notifications");

    // Run within messaging module context
    await DB.runWithContext("messaging", async () => {
      const result = await NotificationHelper.sendEmailNotifications("daily");
      console.log("Midnight timer completed", result);
    });
  } catch (error) {
    console.error("Error in midnight timer:", error);
    throw error;
  }
};

export const handleScheduledTasks = async (_event: ScheduledEvent, _context: Context): Promise<void> => {
  try {
    await initEnv();

    console.log("Scheduled tasks timer triggered - processing service request reminders");

    // Run the service request reminders
    // This doesn't need a specific DB context since AutomationHelper manages its own contexts
    await AutomationHelper.remindServiceRequests();
    
    console.log("Scheduled tasks timer completed");
  } catch (error) {
    console.error("Error in scheduled tasks timer:", error);
    throw error;
  }
};
