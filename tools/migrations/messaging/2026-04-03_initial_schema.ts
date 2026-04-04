import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  // blockedIps
  await db.schema
    .createTable("blockedIps")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("conversationId", sql`char(11)`)
    .addColumn("serviceId", sql`char(11)`)
    .addColumn("ipAddress", sql`varchar(45)`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  // connections
  await db.schema
    .createTable("connections")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("conversationId", sql`char(11)`)
    .addColumn("personId", sql`char(11)`)
    .addColumn("displayName", sql`varchar(45)`)
    .addColumn("timeJoined", sql`datetime`)
    .addColumn("socketId", sql`varchar(45)`)
    .addColumn("ipAddress", sql`varchar(45)`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema.createIndex("idx_connections_churchId_conversationId").on("connections").columns(["churchId", "conversationId"]).execute();

  // conversations
  await db.schema
    .createTable("conversations")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("contentType", sql`varchar(45)`)
    .addColumn("contentId", sql`varchar(255)`)
    .addColumn("title", sql`varchar(255)`)
    .addColumn("dateCreated", sql`datetime`)
    .addColumn("groupId", sql`char(11)`)
    .addColumn("visibility", sql`varchar(45)`)
    .addColumn("firstPostId", sql`char(11)`)
    .addColumn("lastPostId", sql`char(11)`)
    .addColumn("postCount", sql`int`)
    .addColumn("allowAnonymousPosts", sql`bit(1)`)
    .modifyEnd(sql`ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
    .execute();

  await db.schema.createIndex("idx_conversations_churchId_contentType_contentId").on("conversations").columns(["churchId", "contentType", "contentId"]).execute();

  // deliveryLogs
  await db.schema
    .createTable("deliveryLogs")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("personId", sql`char(11)`)
    .addColumn("contentType", sql`varchar(20)`)
    .addColumn("contentId", sql`char(11)`)
    .addColumn("deliveryMethod", sql`varchar(10)`)
    .addColumn("success", sql`bit(1)`)
    .addColumn("errorMessage", sql`varchar(500)`)
    .addColumn("deliveryAddress", sql`varchar(255)`)
    .addColumn("attemptTime", sql`datetime`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema.createIndex("idx_deliveryLogs_contentType_contentId").on("deliveryLogs").columns(["contentType", "contentId"]).execute();
  await db.schema.createIndex("idx_deliveryLogs_personId_attemptTime").on("deliveryLogs").columns(["personId", "attemptTime"]).execute();
  await db.schema.createIndex("idx_deliveryLogs_churchId_attemptTime").on("deliveryLogs").columns(["churchId", "attemptTime"]).execute();

  // devices
  await db.schema
    .createTable("devices")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("appName", sql`varchar(20)`)
    .addColumn("deviceId", sql`varchar(45)`)
    .addColumn("churchId", sql`char(11)`)
    .addColumn("personId", sql`char(11)`)
    .addColumn("fcmToken", sql`varchar(255)`)
    .addColumn("label", sql`varchar(45)`)
    .addColumn("registrationDate", sql`datetime`)
    .addColumn("lastActiveDate", sql`datetime`)
    .addColumn("deviceInfo", sql`text`)
    .addColumn("admId", sql`varchar(255)`)
    .addColumn("pairingCode", sql`varchar(45)`)
    .addColumn("ipAddress", sql`varchar(45)`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema.createIndex("idx_devices_appName_deviceId").on("devices").columns(["appName", "deviceId"]).execute();
  await db.schema.createIndex("idx_devices_personId_lastActiveDate").on("devices").columns(["personId", "lastActiveDate"]).execute();
  await db.schema.createIndex("idx_devices_fcmToken").on("devices").columns(["fcmToken"]).execute();
  await db.schema.createIndex("idx_devices_pairingCode").on("devices").columns(["pairingCode"]).execute();

  // deviceContents
  await db.schema
    .createTable("deviceContents")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("deviceId", sql`char(11)`)
    .addColumn("contentType", sql`varchar(45)`)
    .addColumn("contentId", sql`char(11)`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  // emailTemplates
  await db.schema
    .createTable("emailTemplates")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`, (col) => col.notNull())
    .addColumn("name", sql`varchar(255)`, (col) => col.notNull())
    .addColumn("subject", sql`varchar(500)`, (col) => col.notNull())
    .addColumn("htmlContent", sql`text`, (col) => col.notNull())
    .addColumn("category", sql`varchar(100)`)
    .addColumn("dateCreated", sql`datetime`, (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn("dateModified", sql`datetime`, (col) => col.defaultTo(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`))
    .modifyEnd(sql`ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
    .execute();

  await db.schema.createIndex("idx_emailTemplates_churchId").on("emailTemplates").columns(["churchId"]).execute();

  // messages
  await db.schema
    .createTable("messages")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("conversationId", sql`char(11)`)
    .addColumn("displayName", sql`varchar(45)`)
    .addColumn("timeSent", sql`datetime`)
    .addColumn("messageType", sql`varchar(45)`)
    .addColumn("content", sql`text`)
    .addColumn("personId", sql`char(11)`)
    .addColumn("timeUpdated", sql`datetime`)
    .modifyEnd(sql`ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
    .execute();

  await db.schema.createIndex("idx_messages_churchId_conversationId").on("messages").columns(["churchId", "conversationId"]).execute();
  await db.schema.createIndex("idx_messages_timeSent").on("messages").columns(["timeSent"]).execute();
  await db.schema.createIndex("idx_messages_personId").on("messages").columns(["personId"]).execute();

  // notifications
  await db.schema
    .createTable("notifications")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("personId", sql`char(11)`)
    .addColumn("contentType", sql`varchar(45)`)
    .addColumn("contentId", sql`char(11)`)
    .addColumn("timeSent", sql`datetime`)
    .addColumn("isNew", sql`bit(1)`)
    .addColumn("message", sql`text`)
    .addColumn("link", sql`varchar(100)`)
    .addColumn("deliveryMethod", sql`varchar(10)`)
    .addColumn("triggeredByPersonId", sql`char(11)`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema.createIndex("idx_notifications_churchId_personId_timeSent").on("notifications").columns(["churchId", "personId", "timeSent"]).execute();
  await db.schema.createIndex("idx_notifications_isNew").on("notifications").columns(["isNew"]).execute();

  // notificationPreferences
  await db.schema
    .createTable("notificationPreferences")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("personId", sql`char(11)`)
    .addColumn("allowPush", sql`bit(1)`)
    .addColumn("emailFrequency", sql`varchar(10)`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  // privateMessages
  await db.schema
    .createTable("privateMessages")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("fromPersonId", sql`char(11)`)
    .addColumn("toPersonId", sql`char(11)`)
    .addColumn("conversationId", sql`char(11)`)
    .addColumn("notifyPersonId", sql`char(11)`)
    .addColumn("deliveryMethod", sql`varchar(10)`)
    .modifyEnd(sql`ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
    .execute();

  await db.schema.createIndex("idx_privateMessages_churchId_fromPersonId").on("privateMessages").columns(["churchId", "fromPersonId"]).execute();
  await db.schema.createIndex("idx_privateMessages_churchId_toPersonId").on("privateMessages").columns(["churchId", "toPersonId"]).execute();
  await db.schema.createIndex("idx_privateMessages_churchId_notifyPersonId").on("privateMessages").columns(["churchId", "notifyPersonId"]).execute();
  await db.schema.createIndex("idx_privateMessages_conversationId").on("privateMessages").columns(["conversationId"]).execute();

  // sentTexts
  await db.schema
    .createTable("sentTexts")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`, (col) => col.notNull())
    .addColumn("groupId", sql`char(11)`)
    .addColumn("recipientPersonId", sql`char(11)`)
    .addColumn("senderPersonId", sql`char(11)`)
    .addColumn("message", sql`varchar(1600)`)
    .addColumn("recipientCount", sql`int`, (col) => col.defaultTo(0))
    .addColumn("successCount", sql`int`, (col) => col.defaultTo(0))
    .addColumn("failCount", sql`int`, (col) => col.defaultTo(0))
    .addColumn("timeSent", sql`datetime`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema.createIndex("idx_sentTexts_churchId_timeSent").on("sentTexts").columns(["churchId", "timeSent"]).execute();

  // textingProviders
  await db.schema
    .createTable("textingProviders")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`, (col) => col.notNull())
    .addColumn("provider", sql`varchar(50)`, (col) => col.notNull())
    .addColumn("apiKey", sql`varchar(500)`)
    .addColumn("apiSecret", sql`varchar(500)`)
    .addColumn("fromNumber", sql`varchar(20)`)
    .addColumn("enabled", sql`bit(1)`, (col) => col.defaultTo(1))
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema.createIndex("idx_textingProviders_churchId").on("textingProviders").columns(["churchId"]).execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("textingProviders").ifExists().execute();
  await db.schema.dropTable("sentTexts").ifExists().execute();
  await db.schema.dropTable("privateMessages").ifExists().execute();
  await db.schema.dropTable("notificationPreferences").ifExists().execute();
  await db.schema.dropTable("notifications").ifExists().execute();
  await db.schema.dropTable("messages").ifExists().execute();
  await db.schema.dropTable("emailTemplates").ifExists().execute();
  await db.schema.dropTable("deviceContents").ifExists().execute();
  await db.schema.dropTable("devices").ifExists().execute();
  await db.schema.dropTable("deliveryLogs").ifExists().execute();
  await db.schema.dropTable("conversations").ifExists().execute();
  await db.schema.dropTable("connections").ifExists().execute();
  await db.schema.dropTable("blockedIps").ifExists().execute();
}
