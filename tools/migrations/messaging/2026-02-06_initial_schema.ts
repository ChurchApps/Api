import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("connections")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("conversationId", sql`char(11)`)
    .addColumn("personId", sql`char(11)`)
    .addColumn("displayName", sql`varchar(45)`)
    .addColumn("timeJoined", "datetime")
    .addColumn("socketId", sql`varchar(45)`)
    .addColumn("ipAddress", sql`varchar(45)`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema
    .createIndex("connections_ix_churchId")
    .on("connections")
    .columns(["churchId", "conversationId"])
    .execute();

  await db.schema
    .createTable("conversations")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("contentType", sql`varchar(45)`)
    .addColumn("contentId", sql`varchar(255)`)
    .addColumn("title", sql`varchar(255)`)
    .addColumn("dateCreated", "datetime")
    .addColumn("groupId", sql`char(11)`)
    .addColumn("visibility", sql`varchar(45)`)
    .addColumn("firstPostId", sql`char(11)`)
    .addColumn("lastPostId", sql`char(11)`)
    .addColumn("postCount", sql`int(11)`)
    .addColumn("allowAnonymousPosts", sql`bit(1)`)
    .modifyEnd(sql`ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
    .execute();

  await db.schema
    .createIndex("conversations_ix_churchId")
    .on("conversations")
    .columns(["churchId", "contentType", "contentId"])
    .execute();

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
    .addColumn("registrationDate", "datetime")
    .addColumn("lastActiveDate", "datetime")
    .addColumn("deviceInfo", "text")
    .addColumn("admId", sql`varchar(255)`)
    .addColumn("pairingCode", sql`varchar(45)`)
    .addColumn("ipAddress", sql`varchar(45)`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema
    .createIndex("devices_appName_deviceId")
    .on("devices")
    .columns(["appName", "deviceId"])
    .execute();

  await db.schema
    .createIndex("devices_personId_lastActiveDate")
    .on("devices")
    .columns(["personId", "lastActiveDate"])
    .execute();

  await db.schema
    .createIndex("devices_fcmToken")
    .on("devices")
    .column("fcmToken")
    .execute();

  await db.schema
    .createIndex("devices_pairingCode")
    .on("devices")
    .column("pairingCode")
    .execute();

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

  await db.schema
    .createTable("messages")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("conversationId", sql`char(11)`)
    .addColumn("displayName", sql`varchar(45)`)
    .addColumn("timeSent", "datetime")
    .addColumn("messageType", sql`varchar(45)`)
    .addColumn("content", "text")
    .addColumn("personId", sql`char(11)`)
    .addColumn("timeUpdated", "datetime")
    .modifyEnd(sql`ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
    .execute();

  await db.schema
    .createIndex("messages_ix_churchId")
    .on("messages")
    .columns(["churchId", "conversationId"])
    .execute();

  await db.schema
    .createIndex("messages_ix_timeSent")
    .on("messages")
    .column("timeSent")
    .execute();

  await db.schema
    .createIndex("messages_ix_personId")
    .on("messages")
    .column("personId")
    .execute();

  await db.schema
    .createTable("notifications")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("personId", sql`char(11)`)
    .addColumn("contentType", sql`varchar(45)`)
    .addColumn("contentId", sql`char(11)`)
    .addColumn("timeSent", "datetime")
    .addColumn("isNew", sql`bit(1)`)
    .addColumn("message", "text")
    .addColumn("link", sql`varchar(100)`)
    .addColumn("deliveryMethod", sql`varchar(10)`)
    .addColumn("triggeredByPersonId", sql`char(11)`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema
    .createIndex("notifications_churchId_personId_timeSent")
    .on("notifications")
    .columns(["churchId", "personId", "timeSent"])
    .execute();

  await db.schema
    .createIndex("notifications_isNew")
    .on("notifications")
    .column("isNew")
    .execute();

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

  await db.schema
    .createIndex("privateMessages_IX_churchFrom")
    .on("privateMessages")
    .columns(["churchId", "fromPersonId"])
    .execute();

  await db.schema
    .createIndex("privateMessages_IX_churchTo")
    .on("privateMessages")
    .columns(["churchId", "toPersonId"])
    .execute();

  await db.schema
    .createIndex("privateMessages_IX_notifyPersonId")
    .on("privateMessages")
    .columns(["churchId", "notifyPersonId"])
    .execute();

  await db.schema
    .createIndex("privateMessages_IX_conversationId")
    .on("privateMessages")
    .column("conversationId")
    .execute();

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
    .addColumn("attemptTime", "datetime")
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema
    .createIndex("deliveryLogs_ix_content")
    .on("deliveryLogs")
    .columns(["contentType", "contentId"])
    .execute();

  await db.schema
    .createIndex("deliveryLogs_ix_personId")
    .on("deliveryLogs")
    .columns(["personId", "attemptTime"])
    .execute();

  await db.schema
    .createIndex("deliveryLogs_ix_churchId_time")
    .on("deliveryLogs")
    .columns(["churchId", "attemptTime"])
    .execute();

  // === Stored Procedures ===

  await sql`DROP PROCEDURE IF EXISTS \`cleanup\``.execute(db);
  await sql`
    CREATE PROCEDURE \`cleanup\`()
    BEGIN
      DELETE FROM conversations WHERE allowAnonymousPosts=1 AND dateCreated<DATE_ADD(now(), INTERVAL -7 DAY);
      DELETE FROM connections WHERE timeJoined < DATE_ADD(now(), INTERVAL -1 DAY);
      DELETE FROM messages WHERE conversationId NOT IN (SELECT id FROM conversations);
    END
  `.execute(db);

  await sql`DROP PROCEDURE IF EXISTS \`updateConversationStats\``.execute(db);
  await sql`
    CREATE PROCEDURE \`updateConversationStats\`(convId char(11))
    BEGIN
      UPDATE conversations
      SET postCount=(SELECT COUNT(*) FROM messages WHERE churchId=conversations.churchId AND conversationId=conversations.id),
      firstPostId=(SELECT id FROM messages WHERE churchId=conversations.churchId AND conversationId=conversations.id ORDER BY timeSent LIMIT 1),
      lastPostId=(SELECT id FROM messages WHERE churchId=conversations.churchId AND conversationId=conversations.id ORDER BY timeSent DESC LIMIT 1)
      WHERE id=convId;
    END
  `.execute(db);

  await sql`DROP PROCEDURE IF EXISTS \`deleteForChurch\``.execute(db);
  await sql`
    CREATE PROCEDURE \`deleteForChurch\`(IN pChurchId char(11))
    BEGIN
      DELETE FROM connections WHERE churchId=pChurchId;
      DELETE FROM conversations WHERE churchId=pChurchId;
      DELETE FROM devices WHERE churchId=pChurchId;
      DELETE FROM messages WHERE churchId=pChurchId;
      DELETE FROM notificationPreferences WHERE churchId=pChurchId;
      DELETE FROM notifications WHERE churchId=pChurchId;
      DELETE FROM privateMessages WHERE churchId=pChurchId;
    END
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  // Drop stored procedures first
  await sql`DROP PROCEDURE IF EXISTS \`deleteForChurch\``.execute(db);
  await sql`DROP PROCEDURE IF EXISTS \`updateConversationStats\``.execute(db);
  await sql`DROP PROCEDURE IF EXISTS \`cleanup\``.execute(db);

  const tables = [
    "deliveryLogs",
    "blockedIps",
    "privateMessages",
    "notificationPreferences",
    "notifications",
    "messages",
    "deviceContents",
    "devices",
    "conversations",
    "connections",
  ];

  for (const table of tables) {
    await db.schema.dropTable(table).ifExists().execute();
  }
}
