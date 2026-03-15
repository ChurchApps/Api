CREATE TABLE "actions" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"churchId" char(11),
	"automationId" char(11),
	"actionType" varchar(45),
	"actionData" text
);
--> statement-breakpoint
CREATE TABLE "assignments" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"churchId" char(11),
	"positionId" char(11),
	"personId" char(11),
	"status" varchar(45),
	"notified" timestamp
);
--> statement-breakpoint
CREATE TABLE "automations" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"churchId" char(11),
	"title" varchar(45),
	"recurs" varchar(45),
	"active" boolean
);
--> statement-breakpoint
CREATE TABLE "blockoutDates" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"churchId" char(11),
	"personId" char(11),
	"startDate" date,
	"endDate" date
);
--> statement-breakpoint
CREATE TABLE "conditions" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"churchId" char(11),
	"conjunctionId" char(11),
	"field" varchar(45),
	"fieldData" text,
	"operator" varchar(45),
	"value" varchar(45),
	"label" varchar(255)
);
--> statement-breakpoint
CREATE TABLE "conjunctions" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"churchId" char(11),
	"automationId" char(11),
	"parentId" char(11),
	"groupType" varchar(45)
);
--> statement-breakpoint
CREATE TABLE "contentProviderAuths" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"churchId" char(11),
	"ministryId" char(11),
	"providerId" varchar(50),
	"accessToken" text,
	"refreshToken" text,
	"tokenType" varchar(50),
	"expiresAt" timestamp,
	"scope" varchar(255)
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
	"updatedAt" timestamp,
	"contents" text
);
--> statement-breakpoint
CREATE TABLE "planItems" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"churchId" char(11),
	"planId" char(11),
	"parentId" char(11),
	"sort" real,
	"itemType" varchar(45),
	"relatedId" char(11),
	"label" varchar(100),
	"description" varchar(1000),
	"seconds" integer,
	"link" varchar(1000),
	"providerId" varchar(50),
	"providerPath" varchar(500),
	"providerContentPath" varchar(50),
	"thumbnailUrl" varchar(1024)
);
--> statement-breakpoint
CREATE TABLE "planTypes" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"churchId" char(11),
	"ministryId" char(11),
	"name" varchar(255)
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"churchId" char(11),
	"ministryId" char(11),
	"planTypeId" char(11),
	"name" varchar(45),
	"serviceDate" date,
	"notes" text,
	"serviceOrder" boolean,
	"contentType" varchar(50),
	"contentId" char(11),
	"providerId" varchar(50),
	"providerPlanId" varchar(100),
	"providerPlanName" varchar(255),
	"signupDeadlineHours" integer,
	"showVolunteerNames" boolean
);
--> statement-breakpoint
CREATE TABLE "positions" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"churchId" char(11),
	"planId" char(11),
	"categoryName" varchar(45),
	"name" varchar(45),
	"count" integer,
	"groupId" char(11),
	"allowSelfSignup" boolean,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"churchId" char(11),
	"taskNumber" integer,
	"taskType" varchar(45),
	"dateCreated" timestamp,
	"dateClosed" timestamp,
	"associatedWithType" varchar(45),
	"associatedWithId" char(11),
	"associatedWithLabel" varchar(45),
	"createdByType" varchar(45),
	"createdById" char(11),
	"createdByLabel" varchar(45),
	"assignedToType" varchar(45),
	"assignedToId" char(11),
	"assignedToLabel" varchar(45),
	"title" varchar(255),
	"status" varchar(45),
	"automationId" char(11),
	"conversationId" char(11),
	"data" text
);
--> statement-breakpoint
CREATE TABLE "times" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"churchId" char(11),
	"planId" char(11),
	"displayName" varchar(45),
	"startTime" timestamp,
	"endTime" timestamp,
	"teams" varchar(1000)
);
--> statement-breakpoint
CREATE INDEX "do_idx_church_person" ON "assignments" USING btree ("churchId","personId");--> statement-breakpoint
CREATE INDEX "do_idx_position" ON "assignments" USING btree ("positionId");--> statement-breakpoint
CREATE INDEX "do_idx_ministry_provider" ON "contentProviderAuths" USING btree ("churchId","ministryId","providerId");--> statement-breakpoint
CREATE INDEX "do_notes_churchId" ON "notes" USING btree ("churchId");--> statement-breakpoint
CREATE INDEX "do_idx_church_plan" ON "planItems" USING btree ("churchId","planId");--> statement-breakpoint
CREATE INDEX "do_idx_parent" ON "planItems" USING btree ("parentId");--> statement-breakpoint
CREATE INDEX "do_idx_pos_church_plan" ON "positions" USING btree ("churchId","planId");--> statement-breakpoint
CREATE INDEX "do_idx_group" ON "positions" USING btree ("groupId");--> statement-breakpoint
CREATE INDEX "do_idx_church_status" ON "tasks" USING btree ("churchId","status");--> statement-breakpoint
CREATE INDEX "do_idx_automation" ON "tasks" USING btree ("churchId","automationId");--> statement-breakpoint
CREATE INDEX "do_idx_assigned" ON "tasks" USING btree ("churchId","assignedToType","assignedToId");--> statement-breakpoint
CREATE INDEX "do_idx_created" ON "tasks" USING btree ("churchId","createdByType","createdById");