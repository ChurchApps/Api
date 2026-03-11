import { mysqlTable, char, varchar, datetime, boolean, int, text, index } from "drizzle-orm/mysql-core";

export const blockedIps = mysqlTable("blockedIps", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  conversationId: char("conversationId", { length: 11 }),
  serviceId: char("serviceId", { length: 11 }),
  ipAddress: varchar("ipAddress", { length: 45 }),
});

export const connections = mysqlTable("connections", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  conversationId: char("conversationId", { length: 11 }),
  personId: char("personId", { length: 11 }),
  displayName: varchar("displayName", { length: 45 }),
  timeJoined: datetime("timeJoined"),
  socketId: varchar("socketId", { length: 45 }),
  ipAddress: varchar("ipAddress", { length: 45 }),
}, (t) => [
  index("ix_churchId").on(t.churchId, t.conversationId),
]);

export const conversations = mysqlTable("conversations", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  contentType: varchar("contentType", { length: 45 }),
  contentId: varchar("contentId", { length: 255 }),
  title: varchar("title", { length: 255 }),
  dateCreated: datetime("dateCreated"),
  groupId: char("groupId", { length: 11 }),
  visibility: varchar("visibility", { length: 45 }),
  firstPostId: char("firstPostId", { length: 11 }),
  lastPostId: char("lastPostId", { length: 11 }),
  postCount: int("postCount"),
  allowAnonymousPosts: boolean("allowAnonymousPosts"),
}, (t) => [
  index("ix_churchId").on(t.churchId, t.contentType, t.contentId),
]);

export const deliveryLogs = mysqlTable("deliveryLogs", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  personId: char("personId", { length: 11 }),
  contentType: varchar("contentType", { length: 20 }),
  contentId: char("contentId", { length: 11 }),
  deliveryMethod: varchar("deliveryMethod", { length: 10 }),
  success: boolean("success"),
  errorMessage: varchar("errorMessage", { length: 500 }),
  deliveryAddress: varchar("deliveryAddress", { length: 255 }),
  attemptTime: datetime("attemptTime"),
}, (t) => [
  index("ix_content").on(t.contentType, t.contentId),
  index("ix_personId").on(t.personId, t.attemptTime),
  index("ix_churchId_time").on(t.churchId, t.attemptTime),
]);

export const deviceContents = mysqlTable("deviceContents", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  deviceId: char("deviceId", { length: 11 }),
  contentType: varchar("contentType", { length: 45 }),
  contentId: char("contentId", { length: 11 }),
});

export const devices = mysqlTable("devices", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  appName: varchar("appName", { length: 20 }),
  deviceId: varchar("deviceId", { length: 45 }),
  churchId: char("churchId", { length: 11 }),
  personId: char("personId", { length: 11 }),
  fcmToken: varchar("fcmToken", { length: 255 }),
  label: varchar("label", { length: 45 }),
  registrationDate: datetime("registrationDate"),
  lastActiveDate: datetime("lastActiveDate"),
  deviceInfo: text("deviceInfo"),
  admId: varchar("admId", { length: 255 }),
  pairingCode: varchar("pairingCode", { length: 45 }),
  ipAddress: varchar("ipAddress", { length: 45 }),
  contentType: varchar("contentType", { length: 45 }),
  contentId: char("contentId", { length: 11 }),
}, (t) => [
  index("appName_deviceId").on(t.appName, t.deviceId),
  index("personId_lastActiveDate").on(t.personId, t.lastActiveDate),
  index("fcmToken").on(t.fcmToken),
  index("pairingCode").on(t.pairingCode),
]);

export const emailTemplates = mysqlTable("emailTemplates", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  subject: varchar("subject", { length: 500 }).notNull(),
  htmlContent: text("htmlContent").notNull(),
  category: varchar("category", { length: 100 }),
  dateCreated: datetime("dateCreated"),
  dateModified: datetime("dateModified"),
}, (t) => [
  index("ix_churchId").on(t.churchId),
]);

export const messages = mysqlTable("messages", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  conversationId: char("conversationId", { length: 11 }),
  displayName: varchar("displayName", { length: 45 }),
  timeSent: datetime("timeSent"),
  messageType: varchar("messageType", { length: 45 }),
  content: text("content"),
  personId: char("personId", { length: 11 }),
  timeUpdated: datetime("timeUpdated"),
}, (t) => [
  index("ix_churchId").on(t.churchId, t.conversationId),
  index("ix_timeSent").on(t.timeSent),
  index("ix_personId").on(t.personId),
]);

export const notificationPreferences = mysqlTable("notificationPreferences", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  personId: char("personId", { length: 11 }),
  allowPush: boolean("allowPush"),
  emailFrequency: varchar("emailFrequency", { length: 10 }),
});

export const notifications = mysqlTable("notifications", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  personId: char("personId", { length: 11 }),
  contentType: varchar("contentType", { length: 45 }),
  contentId: char("contentId", { length: 11 }),
  timeSent: datetime("timeSent"),
  isNew: boolean("isNew"),
  message: text("message"),
  link: varchar("link", { length: 100 }),
  deliveryMethod: varchar("deliveryMethod", { length: 10 }),
  triggeredByPersonId: char("triggeredByPersonId", { length: 11 }),
}, (t) => [
  index("churchId_personId_timeSent").on(t.churchId, t.personId, t.timeSent),
  index("isNew").on(t.isNew),
]);

export const privateMessages = mysqlTable("privateMessages", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  fromPersonId: char("fromPersonId", { length: 11 }),
  toPersonId: char("toPersonId", { length: 11 }),
  conversationId: char("conversationId", { length: 11 }),
  notifyPersonId: char("notifyPersonId", { length: 11 }),
  deliveryMethod: varchar("deliveryMethod", { length: 10 }),
}, (t) => [
  index("IX_churchFrom").on(t.churchId, t.fromPersonId),
  index("IX_churchTo").on(t.churchId, t.toPersonId),
  index("IX_notifyPersonId").on(t.churchId, t.notifyPersonId),
  index("IX_conversationId").on(t.conversationId),
]);

export const sentTexts = mysqlTable("sentTexts", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }).notNull(),
  groupId: char("groupId", { length: 11 }),
  recipientPersonId: char("recipientPersonId", { length: 11 }),
  senderPersonId: char("senderPersonId", { length: 11 }),
  message: varchar("message", { length: 1600 }),
  recipientCount: int("recipientCount").default(0),
  successCount: int("successCount").default(0),
  failCount: int("failCount").default(0),
  timeSent: datetime("timeSent"),
}, (t) => [
  index("ix_churchId").on(t.churchId, t.timeSent),
]);

export const textingProviders = mysqlTable("textingProviders", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }).notNull(),
  provider: varchar("provider", { length: 50 }).notNull(),
  apiKey: varchar("apiKey", { length: 500 }),
  apiSecret: varchar("apiSecret", { length: 500 }),
  fromNumber: varchar("fromNumber", { length: 20 }),
  enabled: boolean("enabled"),
}, (t) => [
  index("ix_churchId").on(t.churchId),
]);
