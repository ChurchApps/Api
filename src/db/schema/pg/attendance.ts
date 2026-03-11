import { pgTable, char, varchar, timestamp, boolean, index } from "drizzle-orm/pg-core";

export const campuses = pgTable("campuses", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  name: varchar("name", { length: 255 }),
  address1: varchar("address1", { length: 50 }),
  address2: varchar("address2", { length: 50 }),
  city: varchar("city", { length: 50 }),
  state: varchar("state", { length: 10 }),
  zip: varchar("zip", { length: 10 }),
  removed: boolean("removed")
}, (t) => [index("att_campuses_churchId").on(t.churchId)]);

export const services = pgTable("services", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  campusId: char("campusId", { length: 11 }),
  name: varchar("name", { length: 50 }),
  removed: boolean("removed")
}, (t) => [
  index("att_services_churchId").on(t.churchId),
  index("att_services_campusId").on(t.campusId)
]);

export const serviceTimes = pgTable("serviceTimes", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  serviceId: char("serviceId", { length: 11 }),
  name: varchar("name", { length: 50 }),
  removed: boolean("removed")
}, (t) => [
  index("att_serviceTimes_churchId").on(t.churchId),
  index("att_serviceTimes_serviceId").on(t.serviceId),
  index("att_idx_church_service_removed").on(t.churchId, t.serviceId, t.removed)
]);

export const sessions = pgTable("sessions", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  groupId: char("groupId", { length: 11 }),
  serviceTimeId: char("serviceTimeId", { length: 11 }),
  sessionDate: timestamp("sessionDate")
}, (t) => [
  index("att_sessions_churchId").on(t.churchId),
  index("att_sessions_groupId").on(t.groupId),
  index("att_sessions_serviceTimeId").on(t.serviceTimeId),
  index("att_idx_church_session_date").on(t.churchId, t.sessionDate),
  index("att_idx_church_group_service").on(t.churchId, t.groupId, t.serviceTimeId)
]);

export const visits = pgTable("visits", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  personId: char("personId", { length: 11 }),
  serviceId: char("serviceId", { length: 11 }),
  groupId: char("groupId", { length: 11 }),
  visitDate: timestamp("visitDate"),
  checkinTime: timestamp("checkinTime"),
  addedBy: char("addedBy", { length: 11 })
}, (t) => [
  index("att_visits_churchId").on(t.churchId),
  index("att_visits_personId").on(t.personId),
  index("att_visits_serviceId").on(t.serviceId),
  index("att_visits_groupId").on(t.groupId),
  index("att_idx_church_visit_date").on(t.churchId, t.visitDate),
  index("att_idx_church_person").on(t.churchId, t.personId)
]);

export const visitSessions = pgTable("visitSessions", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  visitId: char("visitId", { length: 11 }),
  sessionId: char("sessionId", { length: 11 })
}, (t) => [
  index("att_visitSessions_churchId").on(t.churchId),
  index("att_visitSessions_visitId").on(t.visitId),
  index("att_visitSessions_sessionId").on(t.sessionId)
]);

export const groupServiceTimes = pgTable("groupServiceTimes", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  groupId: char("groupId", { length: 11 }),
  serviceTimeId: char("serviceTimeId", { length: 11 })
}, (t) => [
  index("att_groupServiceTimes_churchId").on(t.churchId),
  index("att_groupServiceTimes_groupId").on(t.groupId),
  index("att_groupServiceTimes_serviceTimeId").on(t.serviceTimeId)
]);

export const attendanceSettings = pgTable("settings", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  keyName: varchar("keyName", { length: 255 }),
  value: varchar("value", { length: 255 })
}, (t) => [index("att_settings_churchId").on(t.churchId)]);
