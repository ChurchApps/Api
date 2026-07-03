import type { BlockedIp, Connection, Conversation, DeliveryLog, Device, DeviceContent, EmailTemplate, Message, MessageReaction, Notification, NotificationPreference, NotificationPreferenceOverride, NotificationEntityMute, ReminderDefinition, ReminderOccurrence, ReminderSentLog, PrivateMessage, SentText, TextingProvider } from "../models/index.js";

export interface MessagingDatabase {
  blockedIps: BlockedIp;
  connections: Connection;
  conversations: Omit<Conversation, "messages">;
  deliveryLogs: DeliveryLog;
  devices: Device;
  deviceContent: DeviceContent;
  emailTemplates: EmailTemplate;
  messages: Message;
  messageReactions: MessageReaction;
  notifications: Notification;
  notificationPreferences: NotificationPreference;
  notificationPreferenceOverrides: NotificationPreferenceOverride;
  notificationEntityMutes: NotificationEntityMute;
  reminderDefinitions: ReminderDefinition;
  reminderOccurrences: ReminderOccurrence;
  reminderSentLog: ReminderSentLog;
  privateMessages: Omit<PrivateMessage, "conversation">;
  sentTexts: SentText;
  textingProviders: TextingProvider;
}
