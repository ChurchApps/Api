import { pgTable, char, varchar, timestamp, date, boolean, integer, real, text, index } from "drizzle-orm/pg-core";

export const actions = pgTable("actions", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  automationId: char("automationId", { length: 11 }),
  actionType: varchar("actionType", { length: 45 }),
  actionData: text("actionData")
});

export const assignments = pgTable("assignments", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  positionId: char("positionId", { length: 11 }),
  personId: char("personId", { length: 11 }),
  status: varchar("status", { length: 45 }),
  notified: timestamp("notified")
}, (t) => [
  index("do_idx_church_person").on(t.churchId, t.personId),
  index("do_idx_position").on(t.positionId)
]);

export const automations = pgTable("automations", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  title: varchar("title", { length: 45 }),
  recurs: varchar("recurs", { length: 45 }),
  active: boolean("active")
});

export const blockoutDates = pgTable("blockoutDates", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  personId: char("personId", { length: 11 }),
  startDate: date("startDate"),
  endDate: date("endDate")
});

export const conditions = pgTable("conditions", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  conjunctionId: char("conjunctionId", { length: 11 }),
  field: varchar("field", { length: 45 }),
  fieldData: text("fieldData"),
  operator: varchar("operator", { length: 45 }),
  value: varchar("value", { length: 45 }),
  label: varchar("label", { length: 255 })
});

export const conjunctions = pgTable("conjunctions", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  automationId: char("automationId", { length: 11 }),
  parentId: char("parentId", { length: 11 }),
  groupType: varchar("groupType", { length: 45 })
});

export const contentProviderAuths = pgTable("contentProviderAuths", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  ministryId: char("ministryId", { length: 11 }),
  providerId: varchar("providerId", { length: 50 }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  tokenType: varchar("tokenType", { length: 50 }),
  expiresAt: timestamp("expiresAt"),
  scope: varchar("scope", { length: 255 })
}, (t) => [index("do_idx_ministry_provider").on(t.churchId, t.ministryId, t.providerId)]);

export const notes = pgTable("notes", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  contentType: varchar("contentType", { length: 50 }),
  contentId: char("contentId", { length: 11 }),
  noteType: varchar("noteType", { length: 50 }),
  addedBy: char("addedBy", { length: 11 }),
  createdAt: timestamp("createdAt"),
  updatedAt: timestamp("updatedAt"),
  contents: text("contents")
}, (t) => [index("do_notes_churchId").on(t.churchId)]);

export const planItems = pgTable("planItems", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  planId: char("planId", { length: 11 }),
  parentId: char("parentId", { length: 11 }),
  sort: real("sort"),
  itemType: varchar("itemType", { length: 45 }),
  relatedId: char("relatedId", { length: 11 }),
  label: varchar("label", { length: 100 }),
  description: varchar("description", { length: 1000 }),
  seconds: integer("seconds"),
  link: varchar("link", { length: 1000 }),
  providerId: varchar("providerId", { length: 50 }),
  providerPath: varchar("providerPath", { length: 500 }),
  providerContentPath: varchar("providerContentPath", { length: 50 }),
  thumbnailUrl: varchar("thumbnailUrl", { length: 1024 })
}, (t) => [
  index("do_idx_church_plan").on(t.churchId, t.planId),
  index("do_idx_parent").on(t.parentId)
]);

export const plans = pgTable("plans", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  ministryId: char("ministryId", { length: 11 }),
  planTypeId: char("planTypeId", { length: 11 }),
  name: varchar("name", { length: 45 }),
  serviceDate: date("serviceDate"),
  notes: text("notes"),
  serviceOrder: boolean("serviceOrder"),
  contentType: varchar("contentType", { length: 50 }),
  contentId: char("contentId", { length: 11 }),
  providerId: varchar("providerId", { length: 50 }),
  providerPlanId: varchar("providerPlanId", { length: 100 }),
  providerPlanName: varchar("providerPlanName", { length: 255 }),
  signupDeadlineHours: integer("signupDeadlineHours"),
  showVolunteerNames: boolean("showVolunteerNames")
});

export const planTypes = pgTable("planTypes", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  ministryId: char("ministryId", { length: 11 }),
  name: varchar("name", { length: 255 })
});

export const positions = pgTable("positions", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  planId: char("planId", { length: 11 }),
  categoryName: varchar("categoryName", { length: 45 }),
  name: varchar("name", { length: 45 }),
  count: integer("count"),
  groupId: char("groupId", { length: 11 }),
  allowSelfSignup: boolean("allowSelfSignup"),
  description: text("description")
}, (t) => [
  index("do_idx_pos_church_plan").on(t.churchId, t.planId),
  index("do_idx_group").on(t.groupId)
]);

export const tasks = pgTable("tasks", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  taskNumber: integer("taskNumber"),
  taskType: varchar("taskType", { length: 45 }),
  dateCreated: timestamp("dateCreated"),
  dateClosed: timestamp("dateClosed"),
  associatedWithType: varchar("associatedWithType", { length: 45 }),
  associatedWithId: char("associatedWithId", { length: 11 }),
  associatedWithLabel: varchar("associatedWithLabel", { length: 45 }),
  createdByType: varchar("createdByType", { length: 45 }),
  createdById: char("createdById", { length: 11 }),
  createdByLabel: varchar("createdByLabel", { length: 45 }),
  assignedToType: varchar("assignedToType", { length: 45 }),
  assignedToId: char("assignedToId", { length: 11 }),
  assignedToLabel: varchar("assignedToLabel", { length: 45 }),
  title: varchar("title", { length: 255 }),
  status: varchar("status", { length: 45 }),
  automationId: char("automationId", { length: 11 }),
  conversationId: char("conversationId", { length: 11 }),
  data: text("data")
}, (t) => [
  index("do_idx_church_status").on(t.churchId, t.status),
  index("do_idx_automation").on(t.churchId, t.automationId),
  index("do_idx_assigned").on(t.churchId, t.assignedToType, t.assignedToId),
  index("do_idx_created").on(t.churchId, t.createdByType, t.createdById)
]);

export const times = pgTable("times", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  planId: char("planId", { length: 11 }),
  displayName: varchar("displayName", { length: 45 }),
  startTime: timestamp("startTime"),
  endTime: timestamp("endTime"),
  teams: varchar("teams", { length: 1000 })
});
