import { RepoManager } from "./RepoManager.js";

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
  const repos = await RepoManager.getRepos<any>("messaging");
  NotificationHelper.init(repos);
  await NotificationHelper.escalateDelivery();
  await NotificationHelper.sendEmailNotifications("individual");
  await scanReminders(repos); // reminder dispatcher — Pattern A, no new timer
};

const runMidnight = async (): Promise<void> => {
  const { NotificationHelper } = await import("../../modules/messaging/helpers/NotificationHelper.js");
  const messagingRepos = await RepoManager.getRepos<any>("messaging");
  NotificationHelper.init(messagingRepos);
  const contentRepos = await RepoManager.getRepos<any>("content");
  await contentRepos.streamingService.advanceRecurringServices();
  const { expandReminders } = await import("../../modules/messaging/helpers/ReminderBootstrap.js");
  await expandReminders(messagingRepos); // reminder expander — Pattern A
  await NotificationHelper.sendEmailNotifications("daily");
};

const runWebhookDeliveries = async (): Promise<void> => {
  const { WebhookDeliveryWorker } = await import("../webhooks/index.js");
  const repos = await RepoManager.getRepos<any>("membership");
  await WebhookDeliveryWorker.process(repos);
};

export const startRailwayCron = (): void => {
  if (!process.env.RAILWAY_ENVIRONMENT) return;

  console.warn("[cron] Railway in-process scheduler starting");

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
