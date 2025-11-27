import { ScheduledEvent, Context } from "aws-lambda";

import { Environment } from "../shared/helpers/Environment";
import { TypedDB } from "../shared/infrastructure/TypedDB";

import { NotificationHelper } from "../modules/messaging/helpers/NotificationHelper";
import { RepoManager } from "../shared/infrastructure/RepoManager";
import { AutomationHelper } from "../modules/bridge/helpers/AutomationHelper";

const initEnv = async () => {
  if (!Environment.currentEnvironment) {
    await Environment.init(process.env.ENVIRONMENT || "dev");
  }

  // Always initialize messaging helpers (repos may be undefined on warm starts)
  await TypedDB.runWithContext("messaging", async () => {
    const repos = await RepoManager.getRepos<any>("messaging");
    NotificationHelper.init(repos);
  });
};

export const handle15MinTimer = async (_event: ScheduledEvent, _context: Context): Promise<void> => {
  try {
    await initEnv();

    console.log("15-minute timer triggered - processing individual email notifications");

    // Run within messaging module context
    await TypedDB.runWithContext("messaging", async () => {
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

    await AutomationHelper.remindServiceRequests();

    // Advance recurring streaming services
    await TypedDB.runWithContext("content", async () => {
      const repos = await RepoManager.getRepos<any>("content");
      await repos.streamingService.advanceRecurringServices();
    });

    // Run within messaging module context
    await TypedDB.runWithContext("messaging", async () => {
      const result = await NotificationHelper.sendEmailNotifications("daily");
      console.log("Midnight timer completed", result);
    });
  } catch (error) {
    console.error("Error in midnight timer:", error);
    throw error;
  }
};
