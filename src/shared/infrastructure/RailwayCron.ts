import { RepoManager } from "./RepoManager.js";
import { JobRunHelper } from "../helpers/JobRunHelper.js";

const ONE_MINUTE_MS = 60 * 1000;
const THIRTY_MINUTES_MS = 30 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const msUntilNext5amUtc = (): number => {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 5, 0, 0, 0));
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next.getTime() - now.getTime();
};

const safe = async (label: string, fn: () => Promise<unknown>): Promise<void> => {
  try {
    console.warn(`[cron] ${label} starting`);
    await fn();
    console.warn(`[cron] ${label} done`);
  } catch (error: unknown) {
    console.error(`[cron] ${label} failed:`, error);
  }
};

const runThirtyMinute = async (): Promise<void> => {
  const { NotificationHelper } = await import("../../modules/messaging/helpers/NotificationHelper.js");
  const { scanReminders } = await import("../../modules/messaging/helpers/ReminderBootstrap.js");
  const { SocketHelper } = await import("../../modules/messaging/helpers/SocketHelper.js");
  const repos = await RepoManager.getRepos<any>("messaging");
  NotificationHelper.init(repos);
  await JobRunHelper.run("escalateDelivery", () => NotificationHelper.escalateDelivery());
  await JobRunHelper.run("individualEmails", () => NotificationHelper.sendEmailNotifications("individual"));
  await JobRunHelper.run("scanReminders", () => scanReminders(repos)); // reminder dispatcher — Pattern A, no new timer
  await JobRunHelper.run("reapStaleConnections", () => SocketHelper.reapStaleConnections(repos));
};

const runMidnight = async (): Promise<void> => {
  const { NotificationHelper } = await import("../../modules/messaging/helpers/NotificationHelper.js");
  const messagingRepos = await RepoManager.getRepos<any>("messaging");
  NotificationHelper.init(messagingRepos);
  const contentRepos = await RepoManager.getRepos<any>("content");
  await JobRunHelper.run("advanceRecurringServices", () => contentRepos.streamingService.advanceRecurringServices());
  const { expandReminders } = await import("../../modules/messaging/helpers/ReminderBootstrap.js");
  await JobRunHelper.run("expandReminders", () => expandReminders(messagingRepos)); // reminder expander — Pattern A
  const { GradePromotionHelper } = await import("../../modules/membership/helpers/GradePromotionHelper.js");
  await JobRunHelper.run("gradePromotions", () => GradePromotionHelper.checkPromotions());
  await JobRunHelper.run("purgeJobRuns", async () => {
    const membershipRepos = await RepoManager.getRepos<any>("membership");
    return membershipRepos.jobRun.deleteOld(30);
  });
  await JobRunHelper.run("dailyEmails", () => NotificationHelper.sendEmailNotifications("daily"));
};

const runWebhookDeliveries = async (): Promise<void> => {
  const { WebhookDeliveryWorker } = await import("../webhooks/index.js");
  const repos = await RepoManager.getRepos<any>("membership");
  await JobRunHelper.run("webhookDeliveries", () => WebhookDeliveryWorker.process(repos));
};

export const startRailwayCron = (): void => {
  if (!process.env.RAILWAY_ENVIRONMENT && !process.env.SELF_HOSTED) return;

  console.warn("[cron] in-process scheduler starting");

  setInterval(() => void safe("30-min timer", runThirtyMinute), THIRTY_MINUTES_MS);
  setInterval(() => void safe("webhook deliveries", runWebhookDeliveries), ONE_MINUTE_MS);

  const scheduleDaily = (label: string, fn: () => Promise<void>): void => {
    setTimeout(() => {
      void safe(label, fn);
      setInterval(() => void safe(label, fn), ONE_DAY_MS);
    }, msUntilNext5amUtc());
  };

  scheduleDaily("midnight timer", runMidnight);
};
