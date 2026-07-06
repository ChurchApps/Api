import { ScheduledEvent, Context } from "aws-lambda";

import { Environment } from "../shared/helpers/Environment.js";

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
  const repos = await RepoManager.getRepos<any>("messaging");
  NotificationHelper.init(repos);
  console.log("[initEnv] NotificationHelper initialized with repos");
  console.log("[initEnv] Environment initialization complete");
};

export const handle30MinTimer = async (_event: ScheduledEvent, _context: Context): Promise<void> => {
  const startTime = Date.now();
  console.log("[handle30MinTimer] ========== TIMER START ==========");
  console.log("[handle30MinTimer] Timestamp:", new Date().toISOString());
  try {
    console.log("[handle30MinTimer] Calling initEnv...");
    await initEnv();
    console.log("[handle30MinTimer] initEnv completed in", Date.now() - startTime, "ms");

    // Step 1: Escalate notifications that haven't been read
    console.log("[handle30MinTimer] Escalating unread notifications...");
    const escalationResult = await NotificationHelper.escalateDelivery();
    console.log("[handle30MinTimer] escalateDelivery result:", JSON.stringify(escalationResult));

    // Step 2: Process individual email notifications (for users with "individual" email frequency)
    console.log("[handle30MinTimer] Processing individual email notifications...");
    const emailResult = await NotificationHelper.sendEmailNotifications("individual");
    console.log("[handle30MinTimer] sendEmailNotifications result:", JSON.stringify(emailResult));

    console.log("[handle30MinTimer] Sending approval digest emails...");
    const { ApprovalHelper } = await import("../modules/content/helpers/ApprovalHelper.js");
    const digestResult = await ApprovalHelper.sendApprovalDigests();
    console.log("[handle30MinTimer] sendApprovalDigests result:", JSON.stringify(digestResult));

    console.log("[handle30MinTimer] Processing due automation executions...");
    const { ExecutionHelper } = await import("../modules/doing/helpers/ExecutionHelper.js");
    const doingRepos = await RepoManager.getRepos<any>("doing");
    const retried = await ExecutionHelper.processDue(doingRepos);
    console.log(`[handle30MinTimer] executionRetries=${retried}`);

    console.log("[handle30MinTimer] Dispatching due reminders...");
    const { scanReminders } = await import("../modules/messaging/helpers/ReminderBootstrap.js");
    const messagingRepos = await RepoManager.getRepos<any>("messaging");
    const reminderResult = await scanReminders(messagingRepos);
    console.log("[handle30MinTimer] scanReminders result:", JSON.stringify(reminderResult));

    console.log("[handle30MinTimer] Reaping stale connection rows...");
    const { SocketHelper } = await import("../modules/messaging/helpers/SocketHelper.js");
    await SocketHelper.reapStaleConnections(messagingRepos);

    console.log("[handle30MinTimer] ========== TIMER COMPLETE ==========");
    console.log("[handle30MinTimer] Total execution time:", Date.now() - startTime, "ms");
  } catch (error) {
    console.error("[handle30MinTimer] ========== TIMER ERROR ==========");
    console.error("[handle30MinTimer] Error after", Date.now() - startTime, "ms");
    console.error("[handle30MinTimer] Error:", error);
    console.error("[handle30MinTimer] Stack:", (error as Error).stack);
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

    console.log("[handleMidnightTimer] Calling AutomationHelper.remindGroupAttendance...");
    await AutomationHelper.remindGroupAttendance();
    console.log("[handleMidnightTimer] remindGroupAttendance completed in", Date.now() - startTime, "ms");

    // Advance recurring streaming services
    console.log("[handleMidnightTimer] Advancing recurring streaming services...");
    const contentRepos = await RepoManager.getRepos<any>("content");
    await contentRepos.streamingService.advanceRecurringServices();
    console.log("[handleMidnightTimer] advanceRecurringServices completed in", Date.now() - startTime, "ms");

    // Re-evaluate auto-refresh Lists (saved filters) and run their attached actions.
    console.log("[handleMidnightTimer] Refreshing auto-refresh lists...");
    const { ListRefreshHelper } = await import("../modules/membership/helpers/ListRefreshHelper.js");
    const listResult = await ListRefreshHelper.refreshAutoLists();
    console.log("[handleMidnightTimer] refreshAutoLists result:", JSON.stringify(listResult));

    // Annual grade promotion for churches that opted in via the gradePromotionDate setting.
    console.log("[handleMidnightTimer] Checking grade promotions...");
    const { GradePromotionHelper } = await import("../modules/membership/helpers/GradePromotionHelper.js");
    const gradeResult = await GradePromotionHelper.checkPromotions();
    console.log("[handleMidnightTimer] checkPromotions result:", JSON.stringify(gradeResult));

    // Automation execution history retention (>= 32 days required; we keep 90).
    console.log("[handleMidnightTimer] Purging old automation executions...");
    const doingRepos = await RepoManager.getRepos<any>("doing");
    await doingRepos.automationExecution.purgeOld();

    console.log("[handleMidnightTimer] Expanding reminder occurrences...");
    const { expandReminders } = await import("../modules/messaging/helpers/ReminderBootstrap.js");
    const messagingRepos = await RepoManager.getRepos<any>("messaging");
    const expandResult = await expandReminders(messagingRepos);
    console.log("[handleMidnightTimer] expandReminders count:", expandResult);

    // Audit log retention (365 days) — must stay above any future undo window.
    console.log("[handleMidnightTimer] Purging old audit logs...");
    const membershipRepos = await RepoManager.getRepos<any>("membership");
    await membershipRepos.auditLog.deleteOld(365);

    console.log("[handleMidnightTimer] Processing daily email notifications...");
    const result = await NotificationHelper.sendEmailNotifications("daily");
    console.log("[handleMidnightTimer] sendEmailNotifications result:", JSON.stringify(result));
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

export const handleWebhookTimer = async (_event: ScheduledEvent, _context: Context): Promise<void> => {
  try {
    await initEnv();
    const { WebhookDeliveryWorker } = await import("../shared/webhooks/index.js");
    const repos = await RepoManager.getRepos<any>("membership");
    const result = await WebhookDeliveryWorker.process(repos);
    console.log("[handleWebhookTimer] result:", JSON.stringify(result));
  } catch (error) {
    console.error("Error in webhook timer:", error);
    throw error;
  }
};

export const handleScheduledTasks = async (_event: ScheduledEvent, _context: Context): Promise<void> => {
  try {
    await initEnv();

    console.log("Scheduled tasks timer triggered");

    const doingRepos = await RepoManager.getRepos<any>("doing");

    // Workflow card maintenance: overdue reminders + un-snooze sweep.
    const { WorkflowHelper } = await import("../modules/doing/helpers/WorkflowHelper.js");
    const overdueCount = await WorkflowHelper.processOverdue(doingRepos);
    const unsnoozedCount = await WorkflowHelper.processSnoozed(doingRepos);
    console.log(`[handleScheduledTasks] overdue=${overdueCount} unsnoozed=${unsnoozedCount}`);

    // Recurring scheduled rules (pull path of the unified RuleEngine).
    const { RuleEngine } = await import("../modules/doing/helpers/RuleEngine.js");
    await RuleEngine.runScheduled(doingRepos);

    console.log("Scheduled tasks completed");
  } catch (error) {
    console.error("Error in scheduled tasks:", error);
    throw error;
  }
};
