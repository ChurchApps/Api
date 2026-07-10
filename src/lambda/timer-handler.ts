import { ScheduledEvent, Context } from "aws-lambda";

import { Environment } from "../shared/helpers/Environment.js";
import { JobRunHelper } from "../shared/helpers/JobRunHelper.js";

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
  await initEnv();

  await JobRunHelper.run("escalateDelivery", () => NotificationHelper.escalateDelivery());
  await JobRunHelper.run("individualEmails", () => NotificationHelper.sendEmailNotifications("individual"));

  await JobRunHelper.run("approvalDigests", async () => {
    const { ApprovalHelper } = await import("../modules/content/helpers/ApprovalHelper.js");
    return ApprovalHelper.sendApprovalDigests();
  });

  await JobRunHelper.run("automationRetries", async () => {
    const { ExecutionHelper } = await import("../modules/doing/helpers/ExecutionHelper.js");
    const doingRepos = await RepoManager.getRepos<any>("doing");
    return ExecutionHelper.processDue(doingRepos);
  });

  await JobRunHelper.run("scanReminders", async () => {
    const { scanReminders } = await import("../modules/messaging/helpers/ReminderBootstrap.js");
    const messagingRepos = await RepoManager.getRepos<any>("messaging");
    return scanReminders(messagingRepos);
  });

  await JobRunHelper.run("reapStaleConnections", async () => {
    const { SocketHelper } = await import("../modules/messaging/helpers/SocketHelper.js");
    const messagingRepos = await RepoManager.getRepos<any>("messaging");
    return SocketHelper.reapStaleConnections(messagingRepos);
  });

  console.log("[handle30MinTimer] ========== TIMER COMPLETE ==========");
  console.log("[handle30MinTimer] Total execution time:", Date.now() - startTime, "ms");
};

export const handleMidnightTimer = async (_event: ScheduledEvent, _context: Context): Promise<void> => {
  const startTime = Date.now();
  console.log("[handleMidnightTimer] ========== TIMER START ==========");
  console.log("[handleMidnightTimer] Timestamp:", new Date().toISOString());
  await initEnv();

  await JobRunHelper.run("remindGroupAttendance", () => AutomationHelper.remindGroupAttendance());

  await JobRunHelper.run("advanceRecurringServices", async () => {
    const contentRepos = await RepoManager.getRepos<any>("content");
    return contentRepos.streamingService.advanceRecurringServices();
  });

  // Re-evaluate auto-refresh Lists (saved filters) and run their attached actions.
  await JobRunHelper.run("refreshAutoLists", async () => {
    const { ListRefreshHelper } = await import("../modules/membership/helpers/ListRefreshHelper.js");
    return ListRefreshHelper.refreshAutoLists();
  });

  // Annual grade promotion for churches that opted in via the gradePromotionDate setting.
  await JobRunHelper.run("gradePromotions", async () => {
    const { GradePromotionHelper } = await import("../modules/membership/helpers/GradePromotionHelper.js");
    return GradePromotionHelper.checkPromotions();
  });

  // Automation execution history retention (>= 32 days required; we keep 90).
  await JobRunHelper.run("purgeAutomationExecutions", async () => {
    const doingRepos = await RepoManager.getRepos<any>("doing");
    return doingRepos.automationExecution.purgeOld();
  });

  await JobRunHelper.run("expandReminders", async () => {
    const { expandReminders } = await import("../modules/messaging/helpers/ReminderBootstrap.js");
    const messagingRepos = await RepoManager.getRepos<any>("messaging");
    return expandReminders(messagingRepos);
  });

  // Audit log retention (365 days) — must stay above any future undo window.
  await JobRunHelper.run("purgeAuditLogs", async () => {
    const membershipRepos = await RepoManager.getRepos<any>("membership");
    return membershipRepos.auditLog.deleteOld(365);
  });

  await JobRunHelper.run("purgeJobRuns", async () => {
    const membershipRepos = await RepoManager.getRepos<any>("membership");
    return membershipRepos.jobRun.deleteOld(30);
  });

  await JobRunHelper.run("dailyEmails", () => NotificationHelper.sendEmailNotifications("daily"));

  console.log("[handleMidnightTimer] ========== TIMER COMPLETE ==========");
  console.log("[handleMidnightTimer] Total execution time:", Date.now() - startTime, "ms");
};

export const handleWebhookTimer = async (_event: ScheduledEvent, _context: Context): Promise<void> => {
  await initEnv();
  await JobRunHelper.run("webhookDeliveries", async () => {
    const { WebhookDeliveryWorker } = await import("../shared/webhooks/index.js");
    const repos = await RepoManager.getRepos<any>("membership");
    return WebhookDeliveryWorker.process(repos);
  });
};

export const handleScheduledTasks = async (_event: ScheduledEvent, _context: Context): Promise<void> => {
  await initEnv();
  console.log("Scheduled tasks timer triggered");

  const doingRepos = await RepoManager.getRepos<any>("doing");

  // Workflow card maintenance: overdue reminders + un-snooze sweep.
  await JobRunHelper.run("workflowOverdue", async () => {
    const { WorkflowHelper } = await import("../modules/doing/helpers/WorkflowHelper.js");
    return WorkflowHelper.processOverdue(doingRepos);
  });
  await JobRunHelper.run("workflowSnoozed", async () => {
    const { WorkflowHelper } = await import("../modules/doing/helpers/WorkflowHelper.js");
    return WorkflowHelper.processSnoozed(doingRepos);
  });

  // Recurring scheduled rules (pull path of the unified RuleEngine).
  await JobRunHelper.run("scheduledRules", async () => {
    const { RuleEngine } = await import("../modules/doing/helpers/RuleEngine.js");
    return RuleEngine.runScheduled(doingRepos);
  });

  console.log("Scheduled tasks completed");
};
