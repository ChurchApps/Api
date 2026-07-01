import { NotificationPreferenceOverride } from "../models/index.js";

export type NotificationChannel = "push" | "email" | "in_app" | "sms";

export interface NotificationCategory {
  categoryKey: string;
  displayName: string;
  tier: 0 | 1 | 2; // 0 locked, 1 default-on opt-out, 2 default-off opt-in
  mandatory: boolean; // tier 0 only
  transactional: boolean; // bypasses quiet hours + frequency caps (architecture §4.4)
  defaultChannels: NotificationChannel[];
  allowedChannels: NotificationChannel[];
  sortOrder: number;
}

const CATEGORIES: NotificationCategory[] = [
  { categoryKey: "direct_messages", displayName: "Direct Messages", tier: 1, mandatory: false, transactional: true, defaultChannels: ["push", "email", "in_app"], allowedChannels: ["push", "email", "in_app"], sortOrder: 0 },
  { categoryKey: "event_reminders", displayName: "Event Reminders", tier: 1, mandatory: false, transactional: true, defaultChannels: ["push", "email", "in_app"], allowedChannels: ["push", "email", "in_app", "sms"], sortOrder: 1 },
  { categoryKey: "serving_schedule", displayName: "Serving & Schedule", tier: 1, mandatory: false, transactional: true, defaultChannels: ["push", "email", "in_app"], allowedChannels: ["push", "email", "in_app", "sms"], sortOrder: 2 },
  { categoryKey: "tasks", displayName: "Tasks & Follow-Ups", tier: 1, mandatory: false, transactional: true, defaultChannels: ["push", "email", "in_app"], allowedChannels: ["push", "email", "in_app"], sortOrder: 3 },
  { categoryKey: "group_messages", displayName: "Group Chat", tier: 1, mandatory: false, transactional: false, defaultChannels: ["push", "email", "in_app"], allowedChannels: ["push", "email", "in_app"], sortOrder: 4 },
  { categoryKey: "announcements", displayName: "Church Announcements", tier: 1, mandatory: false, transactional: false, defaultChannels: ["push", "email", "in_app"], allowedChannels: ["push", "email", "in_app", "sms"], sortOrder: 5 },
  { categoryKey: "group_activity", displayName: "Group Activity", tier: 1, mandatory: false, transactional: false, defaultChannels: ["push", "email", "in_app"], allowedChannels: ["push", "email", "in_app"], sortOrder: 6 }
];

const BY_KEY = new Map(CATEGORIES.map((c) => [c.categoryKey, c]));

// contentType / innerType -> category (architecture §4.3). A miss never resolves
// to a locked category — the fallback is the opt-out-able group_messages.
const TYPE_MAP: Record<string, string> = {
  privateMessage: "direct_messages",
  assignment: "serving_schedule",
  task: "tasks",
  groupPushNotification: "announcements",
  groupJoinRequest: "group_activity",
  event: "event_reminders",
  group: "group_messages",
  notification: "group_messages"
};

const FALLBACK_CATEGORY = "group_messages";

export class NotificationCategoryHelper {
  static all(): NotificationCategory[] {
    return [...CATEGORIES].sort((a, b) => a.sortOrder - b.sortOrder);
  }

  static get(categoryKey: string): NotificationCategory | undefined {
    return BY_KEY.get(categoryKey);
  }

  static categoryFor(contentType?: string, innerType?: string): string {
    if (!contentType) return FALLBACK_CATEGORY;
    // Generic in-app notifications carry the real type in innerType (navData).
    if (contentType === "notification" && innerType) return this.categoryFor(innerType);
    return TYPE_MAP[contentType] ?? FALLBACK_CATEGORY;
  }

  static isLocked(categoryKey: string): boolean {
    return this.get(categoryKey)?.tier === 0;
  }

  static isTransactional(categoryKey: string): boolean {
    return this.get(categoryKey)?.transactional ?? false;
  }

  // absence-means-default (architecture §4.2): locked -> always on; otherwise an
  // override row wins, else the category's default channel set.
  static effectiveOptIn(categoryKey: string, channel: string, overrides?: NotificationPreferenceOverride[]): boolean {
    const cat = this.get(categoryKey) ?? this.get(FALLBACK_CATEGORY)!;
    if (cat.tier === 0) return true;
    const override = (overrides || []).find((o) => o.categoryKey === categoryKey && o.channel === channel);
    if (override) return !!override.optedIn;
    return cat.defaultChannels.includes(channel as NotificationChannel);
  }
}
