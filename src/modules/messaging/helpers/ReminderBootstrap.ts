import { Repos } from "../repositories/index.js";
import { ReminderEngine } from "./ReminderEngine.js";
import { ReminderAdapterRegistry } from "./ReminderAdapter.js";
import { EventReminderAdapter } from "./adapters/EventReminderAdapter.js";
import { PlanReminderAdapter } from "./adapters/PlanReminderAdapter.js";
import { TaskReminderAdapter } from "./adapters/TaskReminderAdapter.js";

let registered = false;

// Idempotent: the app bootstrap and each Lambda timer entry point are separate
// processes, so every path that runs the engine must ensure it's ready.
export function ensureRemindersReady(repos: Repos): void {
  ReminderEngine.init(repos);
  if (registered) return;
  ReminderAdapterRegistry.register(EventReminderAdapter);
  ReminderAdapterRegistry.register(PlanReminderAdapter);
  ReminderAdapterRegistry.register(TaskReminderAdapter);
  registered = true;
}

export async function scanReminders(repos: Repos) {
  ensureRemindersReady(repos);
  return ReminderEngine.scan();
}

export async function expandReminders(repos: Repos) {
  ensureRemindersReady(repos);
  return ReminderEngine.expandAll();
}
