import { ScheduledEvent, Context } from "aws-lambda";

import { Environment } from "../shared/helpers/Environment.js";
import { TypedDB } from "../shared/infrastructure/TypedDB.js";

import { NotificationHelper } from "../modules/messaging/helpers/NotificationHelper.js";
import { RepoManager } from "../shared/infrastructure/RepoManager.js";
import { AutomationHelper } from "../modules/bridge/helpers/AutomationHelper.js";

const initEnv = async () => {
  console.log("[initEnv] Starting environment initialization...");
  if (!Environment.currentEnvironment) {
    console.log("[initEnv] Environment not initialized, calling Environment.init...");
    await Environment.init(process.env.ENVIRONMENT || "dev");
    console.log("[initEnv] Environment initialized");
  } else {
    console.log("[initEnv] Environment already initialized (warm start)");
  }

  // Always initialize messaging helpers (repos may be undefined on warm starts)
  console.log("[initEnv] Initializing messaging repos...");
  await TypedDB.runWithContext("messaging", async () => {
    const repos = await RepoManager.getRepos<any>("messaging");
    NotificationHelper.init(repos);
    console.log("[initEnv] NotificationHelper initialized with repos");
  });
  console.log("[initEnv] Environment initialization complete");
};

export const handle15MinTimer = async (_event: ScheduledEvent, _context: Context): Promise<void> => {
  const startTime = Date.now();
  console.log("[handle15MinTimer] ========== TIMER START ==========");
  console.log("[handle15MinTimer] Timestamp:", new Date().toISOString());
  try {
    console.log("[handle15MinTimer] Calling initEnv...");
    await initEnv();
    console.log("[handle15MinTimer] initEnv completed in", Date.now() - startTime, "ms");

    // Run within messaging module context
    await TypedDB.runWithContext("messaging", async () => {
      // Step 1: Escalate notifications that haven't been read
      console.log("[handle15MinTimer] Escalating unread notifications...");
      const escalationResult = await NotificationHelper.escalateDelivery();
      console.log("[handle15MinTimer] escalateDelivery result:", JSON.stringify(escalationResult));

      // Step 2: Process individual email notifications (for users with "individual" email frequency)
      console.log("[handle15MinTimer] Processing individual email notifications...");
      const emailResult = await NotificationHelper.sendEmailNotifications("individual");
      console.log("[handle15MinTimer] sendEmailNotifications result:", JSON.stringify(emailResult));
    });
    console.log("[handle15MinTimer] ========== TIMER COMPLETE ==========");
    console.log("[handle15MinTimer] Total execution time:", Date.now() - startTime, "ms");
  } catch (error) {
    console.error("[handle15MinTimer] ========== TIMER ERROR ==========");
    console.error("[handle15MinTimer] Error after", Date.now() - startTime, "ms");
    console.error("[handle15MinTimer] Error:", error);
    console.error("[handle15MinTimer] Stack:", (error as Error).stack);
    throw error;
  }
};

export const handleMidnightTimer = async (_event: ScheduledEvent, _context: Context): Promise<void> => {
  const startTime = Date.now();
  console.log("[handleMidnightTimer] ========== TIMER START ==========");
  console.log("[handleMidnightTimer] Timestamp:", new Date().toISOString());
  try {
    console.log("[handleMidnightTimer] Calling initEnv...");
    await initEnv();
    console.log("[handleMidnightTimer] initEnv completed in", Date.now() - startTime, "ms");

    console.log("[handleMidnightTimer] Calling AutomationHelper.remindServiceRequests...");
    await AutomationHelper.remindServiceRequests();
    console.log("[handleMidnightTimer] remindServiceRequests completed in", Date.now() - startTime, "ms");

    // Advance recurring streaming services
    console.log("[handleMidnightTimer] Advancing recurring streaming services...");
    await TypedDB.runWithContext("content", async () => {
      const repos = await RepoManager.getRepos<any>("content");
      await repos.streamingService.advanceRecurringServices();
    });
    console.log("[handleMidnightTimer] advanceRecurringServices completed in", Date.now() - startTime, "ms");

    // Run within messaging module context
    console.log("[handleMidnightTimer] Processing daily email notifications...");
    await TypedDB.runWithContext("messaging", async () => {
      console.log("[handleMidnightTimer] Inside messaging context, calling sendEmailNotifications('daily')...");
      const result = await NotificationHelper.sendEmailNotifications("daily");
      console.log("[handleMidnightTimer] sendEmailNotifications result:", JSON.stringify(result));
    });
    console.log("[handleMidnightTimer] ========== TIMER COMPLETE ==========");
    console.log("[handleMidnightTimer] Total execution time:", Date.now() - startTime, "ms");
  } catch (error) {
    console.error("[handleMidnightTimer] ========== TIMER ERROR ==========");
    console.error("[handleMidnightTimer] Error after", Date.now() - startTime, "ms");
    console.error("[handleMidnightTimer] Error:", error);
    console.error("[handleMidnightTimer] Stack:", (error as Error).stack);
    throw error;
  }
};

export const handleScheduledTasks = async (_event: ScheduledEvent, _context: Context): Promise<void> => {
  try {
    await initEnv();

    console.log("Scheduled tasks timer triggered");

    // Add scheduled task processing logic here
    // This is a placeholder for future scheduled task implementations

    console.log("Scheduled tasks completed");
  } catch (error) {
    console.error("Error in scheduled tasks:", error);
    throw error;
  }
};
