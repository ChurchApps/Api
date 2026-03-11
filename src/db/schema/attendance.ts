import { mysqlTable, char, varchar, datetime, boolean, index } from "drizzle-orm/mysql-core";

export const campuses = mysqlTable("campuses", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  name: varchar("name", { length: 255 }),
  address1: varchar("address1", { length: 50 }),
  address2: varchar("address2", { length: 50 }),
  city: varchar("city", { length: 50 }),
  state: varchar("state", { length: 10 }),
  zip: varchar("zip", { length: 10 }),
  removed: boolean("removed")
}, (t) => [index("churchId").on(t.churchId)]);

export const services = mysqlTable("services", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  campusId: char("campusId", { length: 11 }),
  name: varchar("name", { length: 50 }),
  removed: boolean("removed")
}, (t) => [
  index("churchId").on(t.churchId),
  index("campusId").on(t.campusId)
]);

export const serviceTimes = mysqlTable("serviceTimes", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  serviceId: char("serviceId", { length: 11 }),
  name: varchar("name", { length: 50 }),
  removed: boolean("removed")
}, (t) => [
  index("churchId").on(t.churchId),
  index("serviceId").on(t.serviceId),
  index("idx_church_service_removed").on(t.churchId, t.serviceId, t.removed)
]);

export const sessions = mysqlTable("sessions", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  groupId: char("groupId", { length: 11 }),
  serviceTimeId: char("serviceTimeId", { length: 11 }),
  sessionDate: datetime("sessionDate")
}, (t) => [
  index("churchId").on(t.churchId),
  index("groupId").on(t.groupId),
  index("serviceTimeId").on(t.serviceTimeId),
  index("idx_church_session_date").on(t.churchId, t.sessionDate),
  index("idx_church_group_service").on(t.churchId, t.groupId, t.serviceTimeId)
]);

export const visits = mysqlTable("visits", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  personId: char("personId", { length: 11 }),
  serviceId: char("serviceId", { length: 11 }),
  groupId: char("groupId", { length: 11 }),
  visitDate: datetime("visitDate"),
  checkinTime: datetime("checkinTime"),
  addedBy: char("addedBy", { length: 11 })
}, (t) => [
  index("churchId").on(t.churchId),
  index("personId").on(t.personId),
  index("serviceId").on(t.serviceId),
  index("groupId").on(t.groupId),
  index("idx_church_visit_date").on(t.churchId, t.visitDate),
  index("idx_church_person").on(t.churchId, t.personId)
]);

export const visitSessions = mysqlTable("visitSessions", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  visitId: char("visitId", { length: 11 }),
  sessionId: char("sessionId", { length: 11 })
}, (t) => [
  index("churchId").on(t.churchId),
  index("visitId").on(t.visitId),
  index("sessionId").on(t.sessionId)
]);

export const groupServiceTimes = mysqlTable("groupServiceTimes", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  groupId: char("groupId", { length: 11 }),
  serviceTimeId: char("serviceTimeId", { length: 11 })
}, (t) => [
  index("churchId").on(t.churchId),
  index("groupId").on(t.groupId),
  index("serviceTimeId").on(t.serviceTimeId)
]);

export const attendanceSettings = mysqlTable("settings", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  keyName: varchar("keyName", { length: 255 }),
  value: varchar("value", { length: 255 })
}, (t) => [index("churchId").on(t.churchId)]);
