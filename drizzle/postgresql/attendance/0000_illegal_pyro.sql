CREATE TABLE "settings" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"churchId" char(11),
	"keyName" varchar(255),
	"value" varchar(255)
);
--> statement-breakpoint
CREATE TABLE "campuses" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"churchId" char(11),
	"name" varchar(255),
	"address1" varchar(50),
	"address2" varchar(50),
	"city" varchar(50),
	"state" varchar(10),
	"zip" varchar(10),
	"removed" boolean
);
--> statement-breakpoint
CREATE TABLE "groupServiceTimes" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"churchId" char(11),
	"groupId" char(11),
	"serviceTimeId" char(11)
);
--> statement-breakpoint
CREATE TABLE "serviceTimes" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"churchId" char(11),
	"serviceId" char(11),
	"name" varchar(50),
	"removed" boolean
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"churchId" char(11),
	"campusId" char(11),
	"name" varchar(50),
	"removed" boolean
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"churchId" char(11),
	"groupId" char(11),
	"serviceTimeId" char(11),
	"sessionDate" timestamp
);
--> statement-breakpoint
CREATE TABLE "visitSessions" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"churchId" char(11),
	"visitId" char(11),
	"sessionId" char(11)
);
--> statement-breakpoint
CREATE TABLE "visits" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"churchId" char(11),
	"personId" char(11),
	"serviceId" char(11),
	"groupId" char(11),
	"visitDate" timestamp,
	"checkinTime" timestamp,
	"addedBy" char(11)
);
--> statement-breakpoint
CREATE INDEX "att_settings_churchId" ON "settings" USING btree ("churchId");--> statement-breakpoint
CREATE INDEX "att_campuses_churchId" ON "campuses" USING btree ("churchId");--> statement-breakpoint
CREATE INDEX "att_groupServiceTimes_churchId" ON "groupServiceTimes" USING btree ("churchId");--> statement-breakpoint
CREATE INDEX "att_groupServiceTimes_groupId" ON "groupServiceTimes" USING btree ("groupId");--> statement-breakpoint
CREATE INDEX "att_groupServiceTimes_serviceTimeId" ON "groupServiceTimes" USING btree ("serviceTimeId");--> statement-breakpoint
CREATE INDEX "att_serviceTimes_churchId" ON "serviceTimes" USING btree ("churchId");--> statement-breakpoint
CREATE INDEX "att_serviceTimes_serviceId" ON "serviceTimes" USING btree ("serviceId");--> statement-breakpoint
CREATE INDEX "att_idx_church_service_removed" ON "serviceTimes" USING btree ("churchId","serviceId","removed");--> statement-breakpoint
CREATE INDEX "att_services_churchId" ON "services" USING btree ("churchId");--> statement-breakpoint
CREATE INDEX "att_services_campusId" ON "services" USING btree ("campusId");--> statement-breakpoint
CREATE INDEX "att_sessions_churchId" ON "sessions" USING btree ("churchId");--> statement-breakpoint
CREATE INDEX "att_sessions_groupId" ON "sessions" USING btree ("groupId");--> statement-breakpoint
CREATE INDEX "att_sessions_serviceTimeId" ON "sessions" USING btree ("serviceTimeId");--> statement-breakpoint
CREATE INDEX "att_idx_church_session_date" ON "sessions" USING btree ("churchId","sessionDate");--> statement-breakpoint
CREATE INDEX "att_idx_church_group_service" ON "sessions" USING btree ("churchId","groupId","serviceTimeId");--> statement-breakpoint
CREATE INDEX "att_visitSessions_churchId" ON "visitSessions" USING btree ("churchId");--> statement-breakpoint
CREATE INDEX "att_visitSessions_visitId" ON "visitSessions" USING btree ("visitId");--> statement-breakpoint
CREATE INDEX "att_visitSessions_sessionId" ON "visitSessions" USING btree ("sessionId");--> statement-breakpoint
CREATE INDEX "att_visits_churchId" ON "visits" USING btree ("churchId");--> statement-breakpoint
CREATE INDEX "att_visits_personId" ON "visits" USING btree ("personId");--> statement-breakpoint
CREATE INDEX "att_visits_serviceId" ON "visits" USING btree ("serviceId");--> statement-breakpoint
CREATE INDEX "att_visits_groupId" ON "visits" USING btree ("groupId");--> statement-breakpoint
CREATE INDEX "att_idx_church_visit_date" ON "visits" USING btree ("churchId","visitDate");--> statement-breakpoint
CREATE INDEX "att_idx_church_person" ON "visits" USING btree ("churchId","personId");