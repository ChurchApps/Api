import { mysqlTable, char, varchar, datetime, date, boolean, int, float, text, mediumtext, index } from "drizzle-orm/mysql-core";

export const actions = mysqlTable("actions", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  automationId: char("automationId", { length: 11 }),
  actionType: varchar("actionType", { length: 45 }),
  actionData: mediumtext("actionData")
});

export const assignments = mysqlTable("assignments", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  positionId: char("positionId", { length: 11 }),
  personId: char("personId", { length: 11 }),
  status: varchar("status", { length: 45 }),
  notified: datetime("notified")
}, (t) => [
  index("idx_church_person").on(t.churchId, t.personId),
  index("idx_position").on(t.positionId)
]);

export const automations = mysqlTable("automations", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  title: varchar("title", { length: 45 }),
  recurs: varchar("recurs", { length: 45 }),
  active: boolean("active")
});

export const blockoutDates = mysqlTable("blockoutDates", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  personId: char("personId", { length: 11 }),
  startDate: date("startDate"),
  endDate: date("endDate")
});

export const conditions = mysqlTable("conditions", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  conjunctionId: char("conjunctionId", { length: 11 }),
  field: varchar("field", { length: 45 }),
  fieldData: mediumtext("fieldData"),
  operator: varchar("operator", { length: 45 }),
  value: varchar("value", { length: 45 }),
  label: varchar("label", { length: 255 })
});

export const conjunctions = mysqlTable("conjunctions", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  automationId: char("automationId", { length: 11 }),
  parentId: char("parentId", { length: 11 }),
  groupType: varchar("groupType", { length: 45 })
});

export const contentProviderAuths = mysqlTable("contentProviderAuths", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  ministryId: char("ministryId", { length: 11 }),
  providerId: varchar("providerId", { length: 50 }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  tokenType: varchar("tokenType", { length: 50 }),
  expiresAt: datetime("expiresAt"),
  scope: varchar("scope", { length: 255 })
}, (t) => [index("idx_ministry_provider").on(t.churchId, t.ministryId, t.providerId)]);

export const notes = mysqlTable("notes", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  contentType: varchar("contentType", { length: 50 }),
  contentId: char("contentId", { length: 11 }),
  noteType: varchar("noteType", { length: 50 }),
  addedBy: char("addedBy", { length: 11 }),
  createdAt: datetime("createdAt"),
  updatedAt: datetime("updatedAt"),
  contents: text("contents")
}, (t) => [index("churchId").on(t.churchId)]);

export const planItems = mysqlTable("planItems", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  planId: char("planId", { length: 11 }),
  parentId: char("parentId", { length: 11 }),
  sort: float("sort"),
  itemType: varchar("itemType", { length: 45 }),
  relatedId: char("relatedId", { length: 11 }),
  label: varchar("label", { length: 100 }),
  description: varchar("description", { length: 1000 }),
  seconds: int("seconds"),
  link: varchar("link", { length: 1000 }),
  providerId: varchar("providerId", { length: 50 }),
  providerPath: varchar("providerPath", { length: 500 }),
  providerContentPath: varchar("providerContentPath", { length: 50 }),
  thumbnailUrl: varchar("thumbnailUrl", { length: 1024 })
}, (t) => [
  index("idx_church_plan").on(t.churchId, t.planId),
  index("idx_parent").on(t.parentId)
]);

export const plans = mysqlTable("plans", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  ministryId: char("ministryId", { length: 11 }),
  planTypeId: char("planTypeId", { length: 11 }),
  name: varchar("name", { length: 45 }),
  serviceDate: date("serviceDate"),
  notes: mediumtext("notes"),
  serviceOrder: boolean("serviceOrder"),
  contentType: varchar("contentType", { length: 50 }),
  contentId: char("contentId", { length: 11 }),
  providerId: varchar("providerId", { length: 50 }),
  providerPlanId: varchar("providerPlanId", { length: 100 }),
  providerPlanName: varchar("providerPlanName", { length: 255 }),
  signupDeadlineHours: int("signupDeadlineHours"),
  showVolunteerNames: boolean("showVolunteerNames")
});

export const planTypes = mysqlTable("planTypes", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  ministryId: char("ministryId", { length: 11 }),
  name: varchar("name", { length: 255 })
});

export const positions = mysqlTable("positions", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  planId: char("planId", { length: 11 }),
  categoryName: varchar("categoryName", { length: 45 }),
  name: varchar("name", { length: 45 }),
  count: int("count"),
  groupId: char("groupId", { length: 11 }),
  allowSelfSignup: boolean("allowSelfSignup"),
  description: text("description")
}, (t) => [
  index("idx_church_plan").on(t.churchId, t.planId),
  index("idx_group").on(t.groupId)
]);

export const tasks = mysqlTable("tasks", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  taskNumber: int("taskNumber"),
  taskType: varchar("taskType", { length: 45 }),
  dateCreated: datetime("dateCreated"),
  dateClosed: datetime("dateClosed"),
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
  index("idx_church_status").on(t.churchId, t.status),
  index("idx_automation").on(t.churchId, t.automationId),
  index("idx_assigned").on(t.churchId, t.assignedToType, t.assignedToId),
  index("idx_created").on(t.churchId, t.createdByType, t.createdById)
]);

export const times = mysqlTable("times", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  planId: char("planId", { length: 11 }),
  displayName: varchar("displayName", { length: 45 }),
  startTime: datetime("startTime"),
  endTime: datetime("endTime"),
  teams: varchar("teams", { length: 1000 })
});
