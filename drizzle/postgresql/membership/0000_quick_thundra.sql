CREATE TYPE "public"."oAuthDeviceCodesStatus" AS ENUM('pending', 'approved', 'denied', 'expired');--> statement-breakpoint
CREATE TYPE "public"."oAuthRelaySessionsStatus" AS ENUM('pending', 'completed', 'expired');--> statement-breakpoint
CREATE TABLE "accessLogs" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"userId" char(11),
	"churchId" char(11),
	"appName" varchar(45),
	"loginTime" timestamp
);
--> statement-breakpoint
CREATE TABLE "answers" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"churchId" char(11),
	"formSubmissionId" char(11),
	"questionId" char(11),
	"value" varchar(4000)
);
--> statement-breakpoint
CREATE TABLE "auditLogs" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"churchId" char(11) NOT NULL,
	"userId" char(11),
	"category" varchar(50) NOT NULL,
	"action" varchar(100) NOT NULL,
	"entityType" varchar(100),
	"entityId" char(11),
	"details" text,
	"ipAddress" varchar(45),
	"created" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "churches" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"name" varchar(255),
	"subDomain" varchar(45),
	"registrationDate" timestamp,
	"address1" varchar(255),
	"address2" varchar(255),
	"city" varchar(255),
	"state" varchar(45),
	"zip" varchar(45),
	"country" varchar(45),
	"archivedDate" timestamp,
	"latitude" real,
	"longitude" real
);
--> statement-breakpoint
CREATE TABLE "clientErrors" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"application" varchar(45),
	"errorTime" timestamp,
	"userId" char(11),
	"churchId" char(11),
	"originUrl" varchar(255),
	"errorType" varchar(45),
	"message" varchar(255),
	"details" text
);
--> statement-breakpoint
CREATE TABLE "domains" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"churchId" char(11),
	"domainName" varchar(255),
	"lastChecked" timestamp,
	"isStale" smallint DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "formSubmissions" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"churchId" char(11),
	"formId" char(11),
	"contentType" varchar(50),
	"contentId" char(11),
	"submissionDate" timestamp,
	"submittedBy" char(11),
	"revisionDate" timestamp,
	"revisedBy" char(11)
);
--> statement-breakpoint
CREATE TABLE "forms" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"churchId" char(11),
	"name" varchar(255),
	"contentType" varchar(50),
	"createdTime" timestamp,
	"modifiedTime" timestamp,
	"accessStartTime" timestamp,
	"accessEndTime" timestamp,
	"restricted" boolean,
	"archived" boolean,
	"removed" boolean,
	"thankYouMessage" text
);
--> statement-breakpoint
CREATE TABLE "groupMembers" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"churchId" char(11),
	"groupId" char(11),
	"personId" char(11),
	"joinDate" timestamp,
	"leader" boolean
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"churchId" char(11),
	"categoryName" varchar(50),
	"name" varchar(50),
	"trackAttendance" boolean,
	"parentPickup" boolean,
	"printNametag" boolean,
	"about" text,
	"photoUrl" varchar(255),
	"removed" boolean,
	"tags" varchar(45),
	"meetingTime" varchar(45),
	"meetingLocation" varchar(45),
	"labels" varchar(500),
	"slug" varchar(45)
);
--> statement-breakpoint
CREATE TABLE "households" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"churchId" char(11),
	"name" varchar(50)
);
--> statement-breakpoint
CREATE TABLE "memberPermissions" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"churchId" char(11),
	"memberId" char(11),
	"contentType" varchar(45),
	"contentId" char(11),
	"action" varchar(45),
	"emailNotification" boolean
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"churchId" char(11),
	"contentType" varchar(50),
	"contentId" char(11),
	"noteType" varchar(50),
	"addedBy" char(11),
	"createdAt" timestamp,
	"contents" text,
	"updatedAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"churchId" char(11),
	"userId" char(11),
	"keyName" varchar(255),
	"value" text,
	"public" boolean
);
--> statement-breakpoint
CREATE TABLE "oAuthClients" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"name" varchar(45),
	"clientId" varchar(45),
	"clientSecret" varchar(45),
	"redirectUris" varchar(255),
	"scopes" varchar(255),
	"createdAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "oAuthCodes" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"userChurchId" char(11),
	"clientId" char(11),
	"code" varchar(45),
	"redirectUri" varchar(255),
	"scopes" varchar(255),
	"expiresAt" timestamp,
	"createdAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "oAuthDeviceCodes" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"deviceCode" varchar(64) NOT NULL,
	"userCode" varchar(16) NOT NULL,
	"clientId" varchar(45) NOT NULL,
	"scopes" varchar(255),
	"expiresAt" timestamp NOT NULL,
	"pollInterval" integer DEFAULT 5,
	"status" "oAuthDeviceCodesStatus" DEFAULT 'pending',
	"approvedByUserId" char(11),
	"userChurchId" char(11),
	"churchId" char(11),
	"createdAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "oAuthRelaySessions" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"sessionCode" varchar(16) NOT NULL,
	"provider" varchar(45) NOT NULL,
	"authCode" varchar(512),
	"redirectUri" varchar(512) NOT NULL,
	"status" "oAuthRelaySessionsStatus" DEFAULT 'pending',
	"expiresAt" timestamp NOT NULL,
	"createdAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "oAuthTokens" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"clientId" char(11),
	"userChurchId" char(11),
	"accessToken" varchar(1000),
	"refreshToken" varchar(45),
	"scopes" varchar(45),
	"expiresAt" timestamp,
	"createdAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"churchId" char(11),
	"userId" char(11),
	"displayName" varchar(100),
	"firstName" varchar(50),
	"middleName" varchar(50),
	"lastName" varchar(50),
	"nickName" varchar(50),
	"prefix" varchar(10),
	"suffix" varchar(10),
	"birthDate" timestamp,
	"gender" varchar(11),
	"maritalStatus" varchar(10),
	"anniversary" timestamp,
	"membershipStatus" varchar(50),
	"homePhone" varchar(21),
	"mobilePhone" varchar(21),
	"workPhone" varchar(21),
	"email" varchar(100),
	"address1" varchar(50),
	"address2" varchar(50),
	"city" varchar(30),
	"state" varchar(10),
	"zip" varchar(10),
	"photoUpdated" timestamp,
	"householdId" char(11),
	"householdRole" varchar(10),
	"removed" boolean,
	"conversationId" char(11),
	"optedOut" boolean,
	"nametagNotes" varchar(20),
	"donorNumber" varchar(20)
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"churchId" char(11),
	"formId" char(11),
	"parentId" char(11),
	"title" varchar(255),
	"description" varchar(255),
	"fieldType" varchar(50),
	"placeholder" varchar(50),
	"sort" integer,
	"choices" text,
	"removed" boolean,
	"required" boolean
);
--> statement-breakpoint
CREATE TABLE "roleMembers" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"churchId" char(11),
	"roleId" char(11),
	"userId" char(11),
	"dateAdded" timestamp,
	"addedBy" char(11)
);
--> statement-breakpoint
CREATE TABLE "rolePermissions" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"churchId" char(11),
	"roleId" char(11),
	"apiName" varchar(45),
	"contentType" varchar(45),
	"contentId" char(11),
	"action" varchar(45)
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"churchId" char(11),
	"name" varchar(255)
);
--> statement-breakpoint
CREATE TABLE "usageTrends" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"year" integer,
	"week" integer,
	"b1Users" integer,
	"b1Churches" integer,
	"b1Devices" integer,
	"chumsUsers" integer,
	"chumsChurches" integer,
	"lessonsUsers" integer,
	"lessonsChurches" integer,
	"lessonsDevices" integer,
	"freeShowDevices" integer
);
--> statement-breakpoint
CREATE TABLE "userChurches" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"userId" char(11),
	"churchId" char(11),
	"personId" char(11),
	"lastAccessed" timestamp
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"email" varchar(191),
	"password" varchar(255),
	"authGuid" varchar(255),
	"displayName" varchar(255),
	"registrationDate" timestamp,
	"lastLogin" timestamp,
	"firstName" varchar(45),
	"lastName" varchar(45)
);
--> statement-breakpoint
CREATE TABLE "visibilityPreferences" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"churchId" char(11),
	"personId" char(11),
	"address" varchar(50),
	"phoneNumber" varchar(50),
	"email" varchar(50)
);
--> statement-breakpoint
CREATE INDEX "mem_answers_churchId" ON "answers" USING btree ("churchId");--> statement-breakpoint
CREATE INDEX "mem_answers_formSubmissionId" ON "answers" USING btree ("formSubmissionId");--> statement-breakpoint
CREATE INDEX "mem_answers_questionId" ON "answers" USING btree ("questionId");--> statement-breakpoint
CREATE INDEX "mem_ix_auditLogs_church_created" ON "auditLogs" USING btree ("churchId","created");--> statement-breakpoint
CREATE INDEX "mem_ix_auditLogs_church_category" ON "auditLogs" USING btree ("churchId","category");--> statement-breakpoint
CREATE INDEX "mem_ix_auditLogs_church_userId" ON "auditLogs" USING btree ("churchId","userId");--> statement-breakpoint
CREATE INDEX "mem_ix_auditLogs_church_entity" ON "auditLogs" USING btree ("churchId","entityType","entityId");--> statement-breakpoint
CREATE INDEX "mem_formSubmissions_churchId" ON "formSubmissions" USING btree ("churchId");--> statement-breakpoint
CREATE INDEX "mem_formSubmissions_formId" ON "formSubmissions" USING btree ("formId");--> statement-breakpoint
CREATE INDEX "mem_forms_churchId" ON "forms" USING btree ("churchId");--> statement-breakpoint
CREATE INDEX "mem_forms_churchId_removed_archived" ON "forms" USING btree ("churchId","removed","archived");--> statement-breakpoint
CREATE INDEX "mem_forms_churchId_id" ON "forms" USING btree ("churchId","id");--> statement-breakpoint
CREATE INDEX "mem_groupMembers_churchId" ON "groupMembers" USING btree ("churchId");--> statement-breakpoint
CREATE INDEX "mem_groupMembers_groupId" ON "groupMembers" USING btree ("groupId");--> statement-breakpoint
CREATE INDEX "mem_groupMembers_personId" ON "groupMembers" USING btree ("personId");--> statement-breakpoint
CREATE INDEX "mem_groupMembers_churchId_groupId_personId" ON "groupMembers" USING btree ("churchId","groupId","personId");--> statement-breakpoint
CREATE INDEX "mem_groupMembers_personId_churchId" ON "groupMembers" USING btree ("personId","churchId");--> statement-breakpoint
CREATE INDEX "mem_groups_churchId" ON "groups" USING btree ("churchId");--> statement-breakpoint
CREATE INDEX "mem_groups_churchId_removed_tags" ON "groups" USING btree ("churchId","removed","tags");--> statement-breakpoint
CREATE INDEX "mem_groups_churchId_removed_labels" ON "groups" USING btree ("churchId","removed","labels");--> statement-breakpoint
CREATE INDEX "mem_households_churchId" ON "households" USING btree ("churchId");--> statement-breakpoint
CREATE INDEX "mem_memberPermissions_churchId_contentId_memberId" ON "memberPermissions" USING btree ("churchId","contentId","memberId");--> statement-breakpoint
CREATE INDEX "mem_notes_churchId" ON "notes" USING btree ("churchId");--> statement-breakpoint
CREATE INDEX "mem_settings_churchId" ON "settings" USING btree ("churchId");--> statement-breakpoint
CREATE UNIQUE INDEX "mem_oAuthDeviceCodes_deviceCode" ON "oAuthDeviceCodes" USING btree ("deviceCode");--> statement-breakpoint
CREATE INDEX "mem_oAuthDeviceCodes_userCode_status" ON "oAuthDeviceCodes" USING btree ("userCode","status");--> statement-breakpoint
CREATE INDEX "mem_oAuthDeviceCodes_status_expiresAt" ON "oAuthDeviceCodes" USING btree ("status","expiresAt");--> statement-breakpoint
CREATE UNIQUE INDEX "mem_oAuthRelaySessions_sessionCode" ON "oAuthRelaySessions" USING btree ("sessionCode");--> statement-breakpoint
CREATE INDEX "mem_oAuthRelaySessions_status_expiresAt" ON "oAuthRelaySessions" USING btree ("status","expiresAt");--> statement-breakpoint
CREATE INDEX "mem_people_churchId" ON "people" USING btree ("churchId");--> statement-breakpoint
CREATE INDEX "mem_people_userId" ON "people" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "mem_people_householdId" ON "people" USING btree ("householdId");--> statement-breakpoint
CREATE INDEX "mem_questions_churchId" ON "questions" USING btree ("churchId");--> statement-breakpoint
CREATE INDEX "mem_questions_formId" ON "questions" USING btree ("formId");--> statement-breakpoint
CREATE INDEX "mem_roleMembers_userId" ON "roleMembers" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "mem_roleMembers_userId_churchId" ON "roleMembers" USING btree ("userId","churchId");--> statement-breakpoint
CREATE INDEX "mem_roleMembers_roleId_churchId" ON "roleMembers" USING btree ("roleId","churchId");--> statement-breakpoint
CREATE INDEX "mem_rolePermissions_roleId_churchId" ON "rolePermissions" USING btree ("roleId","churchId");--> statement-breakpoint
CREATE UNIQUE INDEX "mem_usageTrends_year_week" ON "usageTrends" USING btree ("year","week");--> statement-breakpoint
CREATE INDEX "mem_userChurches_userId" ON "userChurches" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "mem_userChurches_churchId" ON "userChurches" USING btree ("churchId");--> statement-breakpoint
CREATE UNIQUE INDEX "mem_users_email_UNIQUE" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "mem_users_authGuid" ON "users" USING btree ("authGuid");