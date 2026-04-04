import type { BlockedIp, Connection, Conversation, DeliveryLog, Device, DeviceContent, EmailTemplate, Message, Notification, NotificationPreference, PrivateMessage, SentText, TextingProvider } from "../models/index.js";

export interface MessagingDatabase {
  blockedIps: BlockedIp;
  connections: Connection;
  conversations: Omit<Conversation, "messages">;
  deliveryLogs: DeliveryLog;
  devices: Device;
  deviceContent: DeviceContent;
  emailTemplates: EmailTemplate;
  messages: Message;
  notifications: Notification;
  notificationPreferences: NotificationPreference;
  privateMessages: Omit<PrivateMessage, "conversation">;
  sentTexts: SentText;
  textingProviders: TextingProvider;
}
