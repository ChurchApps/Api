import { pgTable, char, varchar, timestamp, boolean, integer, text, index } from "drizzle-orm/pg-core";

export const blockedIps = pgTable("blockedIps", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  conversationId: char("conversationId", { length: 11 }),
  serviceId: char("serviceId", { length: 11 }),
  ipAddress: varchar("ipAddress", { length: 45 })
});

export const connections = pgTable("connections", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  conversationId: char("conversationId", { length: 11 }),
  personId: char("personId", { length: 11 }),
  displayName: varchar("displayName", { length: 45 }),
  timeJoined: timestamp("timeJoined"),
  socketId: varchar("socketId", { length: 45 }),
  ipAddress: varchar("ipAddress", { length: 45 })
}, (t) => [index("msg_ix_churchId").on(t.churchId, t.conversationId)]);

export const conversations = pgTable("conversations", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  contentType: varchar("contentType", { length: 45 }),
  contentId: varchar("contentId", { length: 255 }),
  title: varchar("title", { length: 255 }),
  dateCreated: timestamp("dateCreated"),
  groupId: char("groupId", { length: 11 }),
  visibility: varchar("visibility", { length: 45 }),
  firstPostId: char("firstPostId", { length: 11 }),
  lastPostId: char("lastPostId", { length: 11 }),
  postCount: integer("postCount"),
  allowAnonymousPosts: boolean("allowAnonymousPosts")
}, (t) => [index("msg_conv_ix_churchId").on(t.churchId, t.contentType, t.contentId)]);

export const deliveryLogs = pgTable("deliveryLogs", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  personId: char("personId", { length: 11 }),
  contentType: varchar("contentType", { length: 20 }),
  contentId: char("contentId", { length: 11 }),
  deliveryMethod: varchar("deliveryMethod", { length: 10 }),
  success: boolean("success"),
  errorMessage: varchar("errorMessage", { length: 500 }),
  deliveryAddress: varchar("deliveryAddress", { length: 255 }),
  attemptTime: timestamp("attemptTime")
}, (t) => [
  index("msg_ix_content").on(t.contentType, t.contentId),
  index("msg_ix_personId").on(t.personId, t.attemptTime),
  index("msg_ix_churchId_time").on(t.churchId, t.attemptTime)
]);

export const deviceContents = pgTable("deviceContents", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  deviceId: char("deviceId", { length: 11 }),
  contentType: varchar("contentType", { length: 45 }),
  contentId: char("contentId", { length: 11 })
});

export const devices = pgTable("devices", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  appName: varchar("appName", { length: 20 }),
  deviceId: varchar("deviceId", { length: 45 }),
  churchId: char("churchId", { length: 11 }),
  personId: char("personId", { length: 11 }),
  fcmToken: varchar("fcmToken", { length: 255 }),
  label: varchar("label", { length: 45 }),
  registrationDate: timestamp("registrationDate"),
  lastActiveDate: timestamp("lastActiveDate"),
  deviceInfo: text("deviceInfo"),
  admId: varchar("admId", { length: 255 }),
  pairingCode: varchar("pairingCode", { length: 45 }),
  ipAddress: varchar("ipAddress", { length: 45 }),
  contentType: varchar("contentType", { length: 45 }),
  contentId: char("contentId", { length: 11 })
}, (t) => [
  index("msg_appName_deviceId").on(t.appName, t.deviceId),
  index("msg_personId_lastActiveDate").on(t.personId, t.lastActiveDate),
  index("msg_fcmToken").on(t.fcmToken),
  index("msg_pairingCode").on(t.pairingCode)
]);

export const emailTemplates = pgTable("emailTemplates", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  subject: varchar("subject", { length: 500 }).notNull(),
  htmlContent: text("htmlContent").notNull(),
  category: varchar("category", { length: 100 }),
  dateCreated: timestamp("dateCreated"),
  dateModified: timestamp("dateModified")
}, (t) => [index("msg_emailTemplates_ix_churchId").on(t.churchId)]);

export const messages = pgTable("messages", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  conversationId: char("conversationId", { length: 11 }),
  displayName: varchar("displayName", { length: 45 }),
  timeSent: timestamp("timeSent"),
  messageType: varchar("messageType", { length: 45 }),
  content: text("content"),
  personId: char("personId", { length: 11 }),
  timeUpdated: timestamp("timeUpdated")
}, (t) => [
  index("msg_messages_ix_churchId").on(t.churchId, t.conversationId),
  index("msg_ix_timeSent").on(t.timeSent),
  index("msg_ix_msg_personId").on(t.personId)
]);

export const notificationPreferences = pgTable("notificationPreferences", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  personId: char("personId", { length: 11 }),
  allowPush: boolean("allowPush"),
  emailFrequency: varchar("emailFrequency", { length: 10 })
});

export const notifications = pgTable("notifications", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  personId: char("personId", { length: 11 }),
  contentType: varchar("contentType", { length: 45 }),
  contentId: char("contentId", { length: 11 }),
  timeSent: timestamp("timeSent"),
  isNew: boolean("isNew"),
  message: text("message"),
  link: varchar("link", { length: 100 }),
  deliveryMethod: varchar("deliveryMethod", { length: 10 }),
  triggeredByPersonId: char("triggeredByPersonId", { length: 11 })
}, (t) => [
  index("msg_churchId_personId_timeSent").on(t.churchId, t.personId, t.timeSent),
  index("msg_isNew").on(t.isNew)
]);

export const privateMessages = pgTable("privateMessages", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  fromPersonId: char("fromPersonId", { length: 11 }),
  toPersonId: char("toPersonId", { length: 11 }),
  conversationId: char("conversationId", { length: 11 }),
  notifyPersonId: char("notifyPersonId", { length: 11 }),
  deliveryMethod: varchar("deliveryMethod", { length: 10 })
}, (t) => [
  index("msg_IX_churchFrom").on(t.churchId, t.fromPersonId),
  index("msg_IX_churchTo").on(t.churchId, t.toPersonId),
  index("msg_IX_notifyPersonId").on(t.churchId, t.notifyPersonId),
  index("msg_IX_conversationId").on(t.conversationId)
]);

export const sentTexts = pgTable("sentTexts", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }).notNull(),
  groupId: char("groupId", { length: 11 }),
  recipientPersonId: char("recipientPersonId", { length: 11 }),
  senderPersonId: char("senderPersonId", { length: 11 }),
  message: varchar("message", { length: 1600 }),
  recipientCount: integer("recipientCount").default(0),
  successCount: integer("successCount").default(0),
  failCount: integer("failCount").default(0),
  timeSent: timestamp("timeSent")
}, (t) => [index("msg_sentTexts_ix_churchId").on(t.churchId, t.timeSent)]);

export const textingProviders = pgTable("textingProviders", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }).notNull(),
  provider: varchar("provider", { length: 50 }).notNull(),
  apiKey: varchar("apiKey", { length: 500 }),
  apiSecret: varchar("apiSecret", { length: 500 }),
  fromNumber: varchar("fromNumber", { length: 20 }),
  enabled: boolean("enabled")
}, (t) => [index("msg_textingProviders_ix_churchId").on(t.churchId)]);
