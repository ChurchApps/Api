CREATE TABLE "blockedIps" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"churchId" char(11),
	"conversationId" char(11),
	"serviceId" char(11),
	"ipAddress" varchar(45)
);
--> statement-breakpoint
CREATE TABLE "connections" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"churchId" char(11),
	"conversationId" char(11),
	"personId" char(11),
	"displayName" varchar(45),
	"timeJoined" timestamp,
	"socketId" varchar(45),
	"ipAddress" varchar(45)
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"churchId" char(11),
	"contentType" varchar(45),
	"contentId" varchar(255),
	"title" varchar(255),
	"dateCreated" timestamp,
	"groupId" char(11),
	"visibility" varchar(45),
	"firstPostId" char(11),
	"lastPostId" char(11),
	"postCount" integer,
	"allowAnonymousPosts" boolean
);
--> statement-breakpoint
CREATE TABLE "deliveryLogs" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"churchId" char(11),
	"personId" char(11),
	"contentType" varchar(20),
	"contentId" char(11),
	"deliveryMethod" varchar(10),
	"success" boolean,
	"errorMessage" varchar(500),
	"deliveryAddress" varchar(255),
	"attemptTime" timestamp
);
--> statement-breakpoint
CREATE TABLE "deviceContents" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"churchId" char(11),
	"deviceId" char(11),
	"contentType" varchar(45),
	"contentId" char(11)
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"appName" varchar(20),
	"deviceId" varchar(45),
	"churchId" char(11),
	"personId" char(11),
	"fcmToken" varchar(255),
	"label" varchar(45),
	"registrationDate" timestamp,
	"lastActiveDate" timestamp,
	"deviceInfo" text,
	"admId" varchar(255),
	"pairingCode" varchar(45),
	"ipAddress" varchar(45),
	"contentType" varchar(45),
	"contentId" char(11)
);
--> statement-breakpoint
CREATE TABLE "emailTemplates" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"churchId" char(11) NOT NULL,
	"name" varchar(255) NOT NULL,
	"subject" varchar(500) NOT NULL,
	"htmlContent" text NOT NULL,
	"category" varchar(100),
	"dateCreated" timestamp,
	"dateModified" timestamp
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"churchId" char(11),
	"conversationId" char(11),
	"displayName" varchar(45),
	"timeSent" timestamp,
	"messageType" varchar(45),
	"content" text,
	"personId" char(11),
	"timeUpdated" timestamp
);
--> statement-breakpoint
CREATE TABLE "notificationPreferences" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"churchId" char(11),
	"personId" char(11),
	"allowPush" boolean,
	"emailFrequency" varchar(10)
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"churchId" char(11),
	"personId" char(11),
	"contentType" varchar(45),
	"contentId" char(11),
	"timeSent" timestamp,
	"isNew" boolean,
	"message" text,
	"link" varchar(100),
	"deliveryMethod" varchar(10),
	"triggeredByPersonId" char(11)
);
--> statement-breakpoint
CREATE TABLE "privateMessages" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"churchId" char(11),
	"fromPersonId" char(11),
	"toPersonId" char(11),
	"conversationId" char(11),
	"notifyPersonId" char(11),
	"deliveryMethod" varchar(10)
);
--> statement-breakpoint
CREATE TABLE "sentTexts" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"churchId" char(11) NOT NULL,
	"groupId" char(11),
	"recipientPersonId" char(11),
	"senderPersonId" char(11),
	"message" varchar(1600),
	"recipientCount" integer DEFAULT 0,
	"successCount" integer DEFAULT 0,
	"failCount" integer DEFAULT 0,
	"timeSent" timestamp
);
--> statement-breakpoint
CREATE TABLE "textingProviders" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"churchId" char(11) NOT NULL,
	"provider" varchar(50) NOT NULL,
	"apiKey" varchar(500),
	"apiSecret" varchar(500),
	"fromNumber" varchar(20),
	"enabled" boolean
);
--> statement-breakpoint
CREATE INDEX "msg_ix_churchId" ON "connections" USING btree ("churchId","conversationId");--> statement-breakpoint
CREATE INDEX "msg_conv_ix_churchId" ON "conversations" USING btree ("churchId","contentType","contentId");--> statement-breakpoint
CREATE INDEX "msg_ix_content" ON "deliveryLogs" USING btree ("contentType","contentId");--> statement-breakpoint
CREATE INDEX "msg_ix_personId" ON "deliveryLogs" USING btree ("personId","attemptTime");--> statement-breakpoint
CREATE INDEX "msg_ix_churchId_time" ON "deliveryLogs" USING btree ("churchId","attemptTime");--> statement-breakpoint
CREATE INDEX "msg_appName_deviceId" ON "devices" USING btree ("appName","deviceId");--> statement-breakpoint
CREATE INDEX "msg_personId_lastActiveDate" ON "devices" USING btree ("personId","lastActiveDate");--> statement-breakpoint
CREATE INDEX "msg_fcmToken" ON "devices" USING btree ("fcmToken");--> statement-breakpoint
CREATE INDEX "msg_pairingCode" ON "devices" USING btree ("pairingCode");--> statement-breakpoint
CREATE INDEX "msg_emailTemplates_ix_churchId" ON "emailTemplates" USING btree ("churchId");--> statement-breakpoint
CREATE INDEX "msg_messages_ix_churchId" ON "messages" USING btree ("churchId","conversationId");--> statement-breakpoint
CREATE INDEX "msg_ix_timeSent" ON "messages" USING btree ("timeSent");--> statement-breakpoint
CREATE INDEX "msg_ix_msg_personId" ON "messages" USING btree ("personId");--> statement-breakpoint
CREATE INDEX "msg_churchId_personId_timeSent" ON "notifications" USING btree ("churchId","personId","timeSent");--> statement-breakpoint
CREATE INDEX "msg_isNew" ON "notifications" USING btree ("isNew");--> statement-breakpoint
CREATE INDEX "msg_IX_churchFrom" ON "privateMessages" USING btree ("churchId","fromPersonId");--> statement-breakpoint
CREATE INDEX "msg_IX_churchTo" ON "privateMessages" USING btree ("churchId","toPersonId");--> statement-breakpoint
CREATE INDEX "msg_IX_notifyPersonId" ON "privateMessages" USING btree ("churchId","notifyPersonId");--> statement-breakpoint
CREATE INDEX "msg_IX_conversationId" ON "privateMessages" USING btree ("conversationId");--> statement-breakpoint
CREATE INDEX "msg_sentTexts_ix_churchId" ON "sentTexts" USING btree ("churchId","timeSent");--> statement-breakpoint
CREATE INDEX "msg_textingProviders_ix_churchId" ON "textingProviders" USING btree ("churchId");