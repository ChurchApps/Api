const ONE_MINUTE_MS = 60 * 1000;
const THIRTY_MINUTES_MS = 30 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const msUntilNext5amUtc = (): number => {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 5, 0, 0, 0));
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next.getTime() - now.getTime();
};

const running = new Set<string>();

const safe = async (label: string, fn: () => Promise<unknown>): Promise<void> => {
  if (running.has(label)) {
    console.warn(`[cron] ${label} still running, skipping`);
    return;
  }
  running.add(label);
  try {
    console.warn(`[cron] ${label} starting`);
    await fn();
    console.warn(`[cron] ${label} done`);
  } catch (error: unknown) {
    console.error(`[cron] ${label} failed:`, error);
  } finally {
    running.delete(label);
  }
};

// Runs the same handlers as the Lambda timers so both schedulers stay in sync.
const timers = () => import("../../lambda/timer-handler.js");
const runThirtyMinute = async () => (await timers()).handle30MinTimer(null as any, null as any);
const runMidnight = async () => (await timers()).handleMidnightTimer(null as any, null as any);
const runScheduledTasks = async () => (await timers()).handleScheduledTasks(null as any, null as any);
const runWebhookDeliveries = async () => (await timers()).handleWebhookTimer(null as any, null as any);

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
  scheduleDaily("scheduled tasks", runScheduledTasks);
};
