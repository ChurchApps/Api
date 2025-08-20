import { ScheduledEvent, Context } from "aws-lambda";

import { Environment } from "../shared/helpers/Environment";
import { MultiDatabasePool, DB } from "../shared/infrastructure/DB";

import { NotificationHelper } from "../modules/messaging/helpers/NotificationHelper";
import { MessagingRepositories } from "../modules/messaging/repositories";

const initEnv = async () => {
  if (!Environment.currentEnvironment) {
    await Environment.init(process.env.ENVIRONMENT || "dev");

    // Initialize database pools
    await MultiDatabasePool.initializeAllPools();

    // Initialize messaging helpers within the messaging module context
    await DB.runWithContext("messaging", async () => {
      const repositories = new MessagingRepositories();
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
