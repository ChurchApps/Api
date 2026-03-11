import { pgTable, pgEnum, char, varchar, timestamp, boolean, integer, real, text, smallint, index, uniqueIndex } from "drizzle-orm/pg-core";

export const accessLogs = pgTable("accessLogs", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  userId: char("userId", { length: 11 }),
  churchId: char("churchId", { length: 11 }),
  appName: varchar("appName", { length: 45 }),
  loginTime: timestamp("loginTime")
});

export const answers = pgTable("answers", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  formSubmissionId: char("formSubmissionId", { length: 11 }),
  questionId: char("questionId", { length: 11 }),
  value: varchar("value", { length: 4000 })
}, (t) => [
  index("mem_answers_churchId").on(t.churchId),
  index("mem_answers_formSubmissionId").on(t.formSubmissionId),
  index("mem_answers_questionId").on(t.questionId)
]);

export const auditLogs = pgTable("auditLogs", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }).notNull(),
  userId: char("userId", { length: 11 }),
  category: varchar("category", { length: 50 }).notNull(),
  action: varchar("action", { length: 100 }).notNull(),
  entityType: varchar("entityType", { length: 100 }),
  entityId: char("entityId", { length: 11 }),
  details: text("details"),
  ipAddress: varchar("ipAddress", { length: 45 }),
  created: timestamp("created").notNull()
}, (t) => [
  index("mem_ix_auditLogs_church_created").on(t.churchId, t.created),
  index("mem_ix_auditLogs_church_category").on(t.churchId, t.category),
  index("mem_ix_auditLogs_church_userId").on(t.churchId, t.userId),
  index("mem_ix_auditLogs_church_entity").on(t.churchId, t.entityType, t.entityId)
]);

export const churches = pgTable("churches", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  name: varchar("name", { length: 255 }),
  subDomain: varchar("subDomain", { length: 45 }),
  registrationDate: timestamp("registrationDate"),
  address1: varchar("address1", { length: 255 }),
  address2: varchar("address2", { length: 255 }),
  city: varchar("city", { length: 255 }),
  state: varchar("state", { length: 45 }),
  zip: varchar("zip", { length: 45 }),
  country: varchar("country", { length: 45 }),
  archivedDate: timestamp("archivedDate"),
  latitude: real("latitude"),
  longitude: real("longitude")
});

export const clientErrors = pgTable("clientErrors", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  application: varchar("application", { length: 45 }),
  errorTime: timestamp("errorTime"),
  userId: char("userId", { length: 11 }),
  churchId: char("churchId", { length: 11 }),
  originUrl: varchar("originUrl", { length: 255 }),
  errorType: varchar("errorType", { length: 45 }),
  message: varchar("message", { length: 255 }),
  details: text("details")
});

export const domains = pgTable("domains", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  domainName: varchar("domainName", { length: 255 }),
  lastChecked: timestamp("lastChecked"),
  isStale: smallint("isStale").default(0)
});

export const forms = pgTable("forms", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  name: varchar("name", { length: 255 }),
  contentType: varchar("contentType", { length: 50 }),
  createdTime: timestamp("createdTime"),
  modifiedTime: timestamp("modifiedTime"),
  accessStartTime: timestamp("accessStartTime"),
  accessEndTime: timestamp("accessEndTime"),
  restricted: boolean("restricted"),
  archived: boolean("archived"),
  removed: boolean("removed"),
  thankYouMessage: text("thankYouMessage")
}, (t) => [
  index("mem_forms_churchId").on(t.churchId),
  index("mem_forms_churchId_removed_archived").on(t.churchId, t.removed, t.archived),
  index("mem_forms_churchId_id").on(t.churchId, t.id)
]);

export const formSubmissions = pgTable("formSubmissions", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  formId: char("formId", { length: 11 }),
  contentType: varchar("contentType", { length: 50 }),
  contentId: char("contentId", { length: 11 }),
  submissionDate: timestamp("submissionDate"),
  submittedBy: char("submittedBy", { length: 11 }),
  revisionDate: timestamp("revisionDate"),
  revisedBy: char("revisedBy", { length: 11 })
}, (t) => [
  index("mem_formSubmissions_churchId").on(t.churchId),
  index("mem_formSubmissions_formId").on(t.formId)
]);

export const groupMembers = pgTable("groupMembers", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  groupId: char("groupId", { length: 11 }),
  personId: char("personId", { length: 11 }),
  joinDate: timestamp("joinDate"),
  leader: boolean("leader")
}, (t) => [
  index("mem_groupMembers_churchId").on(t.churchId),
  index("mem_groupMembers_groupId").on(t.groupId),
  index("mem_groupMembers_personId").on(t.personId),
  index("mem_groupMembers_churchId_groupId_personId").on(t.churchId, t.groupId, t.personId),
  index("mem_groupMembers_personId_churchId").on(t.personId, t.churchId)
]);

export const groups = pgTable("groups", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  categoryName: varchar("categoryName", { length: 50 }),
  name: varchar("name", { length: 50 }),
  trackAttendance: boolean("trackAttendance"),
  parentPickup: boolean("parentPickup"),
  printNametag: boolean("printNametag"),
  about: text("about"),
  photoUrl: varchar("photoUrl", { length: 255 }),
  removed: boolean("removed"),
  tags: varchar("tags", { length: 45 }),
  meetingTime: varchar("meetingTime", { length: 45 }),
  meetingLocation: varchar("meetingLocation", { length: 45 }),
  labels: varchar("labels", { length: 500 }),
  slug: varchar("slug", { length: 45 })
}, (t) => [
  index("mem_groups_churchId").on(t.churchId),
  index("mem_groups_churchId_removed_tags").on(t.churchId, t.removed, t.tags),
  index("mem_groups_churchId_removed_labels").on(t.churchId, t.removed, t.labels)
]);

export const households = pgTable("households", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  name: varchar("name", { length: 50 })
}, (t) => [index("mem_households_churchId").on(t.churchId)]);

export const memberPermissions = pgTable("memberPermissions", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  memberId: char("memberId", { length: 11 }),
  contentType: varchar("contentType", { length: 45 }),
  contentId: char("contentId", { length: 11 }),
  action: varchar("action", { length: 45 }),
  emailNotification: boolean("emailNotification")
}, (t) => [index("mem_memberPermissions_churchId_contentId_memberId").on(t.churchId, t.contentId, t.memberId)]);

export const membershipNotes = pgTable("notes", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  contentType: varchar("contentType", { length: 50 }),
  contentId: char("contentId", { length: 11 }),
  noteType: varchar("noteType", { length: 50 }),
  addedBy: char("addedBy", { length: 11 }),
  createdAt: timestamp("createdAt"),
  contents: text("contents"),
  updatedAt: timestamp("updatedAt")
}, (t) => [index("mem_notes_churchId").on(t.churchId)]);

export const oAuthClients = pgTable("oAuthClients", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  name: varchar("name", { length: 45 }),
  clientId: varchar("clientId", { length: 45 }),
  clientSecret: varchar("clientSecret", { length: 45 }),
  redirectUris: varchar("redirectUris", { length: 255 }),
  scopes: varchar("scopes", { length: 255 }),
  createdAt: timestamp("createdAt")
});

export const oAuthCodes = pgTable("oAuthCodes", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  userChurchId: char("userChurchId", { length: 11 }),
  clientId: char("clientId", { length: 11 }),
  code: varchar("code", { length: 45 }),
  redirectUri: varchar("redirectUri", { length: 255 }),
  scopes: varchar("scopes", { length: 255 }),
  expiresAt: timestamp("expiresAt"),
  createdAt: timestamp("createdAt")
});

export const oAuthDeviceCodesStatusEnum = pgEnum("oAuthDeviceCodesStatus", ["pending", "approved", "denied", "expired"]);

export const oAuthDeviceCodes = pgTable("oAuthDeviceCodes", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  deviceCode: varchar("deviceCode", { length: 64 }).notNull(),
  userCode: varchar("userCode", { length: 16 }).notNull(),
  clientId: varchar("clientId", { length: 45 }).notNull(),
  scopes: varchar("scopes", { length: 255 }),
  expiresAt: timestamp("expiresAt").notNull(),
  pollInterval: integer("pollInterval").default(5),
  status: oAuthDeviceCodesStatusEnum("status").default("pending"),
  approvedByUserId: char("approvedByUserId", { length: 11 }),
  userChurchId: char("userChurchId", { length: 11 }),
  churchId: char("churchId", { length: 11 }),
  createdAt: timestamp("createdAt")
}, (t) => [
  uniqueIndex("mem_oAuthDeviceCodes_deviceCode").on(t.deviceCode),
  index("mem_oAuthDeviceCodes_userCode_status").on(t.userCode, t.status),
  index("mem_oAuthDeviceCodes_status_expiresAt").on(t.status, t.expiresAt)
]);

export const oAuthRelaySessionsStatusEnum = pgEnum("oAuthRelaySessionsStatus", ["pending", "completed", "expired"]);

export const oAuthRelaySessions = pgTable("oAuthRelaySessions", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  sessionCode: varchar("sessionCode", { length: 16 }).notNull(),
  provider: varchar("provider", { length: 45 }).notNull(),
  authCode: varchar("authCode", { length: 512 }),
  redirectUri: varchar("redirectUri", { length: 512 }).notNull(),
  status: oAuthRelaySessionsStatusEnum("status").default("pending"),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt")
}, (t) => [
  uniqueIndex("mem_oAuthRelaySessions_sessionCode").on(t.sessionCode),
  index("mem_oAuthRelaySessions_status_expiresAt").on(t.status, t.expiresAt)
]);

export const oAuthTokens = pgTable("oAuthTokens", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  clientId: char("clientId", { length: 11 }),
  userChurchId: char("userChurchId", { length: 11 }),
  accessToken: varchar("accessToken", { length: 1000 }),
  refreshToken: varchar("refreshToken", { length: 45 }),
  scopes: varchar("scopes", { length: 45 }),
  expiresAt: timestamp("expiresAt"),
  createdAt: timestamp("createdAt")
});

export const people = pgTable("people", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  userId: char("userId", { length: 11 }),
  displayName: varchar("displayName", { length: 100 }),
  firstName: varchar("firstName", { length: 50 }),
  middleName: varchar("middleName", { length: 50 }),
  lastName: varchar("lastName", { length: 50 }),
  nickName: varchar("nickName", { length: 50 }),
  prefix: varchar("prefix", { length: 10 }),
  suffix: varchar("suffix", { length: 10 }),
  birthDate: timestamp("birthDate"),
  gender: varchar("gender", { length: 11 }),
  maritalStatus: varchar("maritalStatus", { length: 10 }),
  anniversary: timestamp("anniversary"),
  membershipStatus: varchar("membershipStatus", { length: 50 }),
  homePhone: varchar("homePhone", { length: 21 }),
  mobilePhone: varchar("mobilePhone", { length: 21 }),
  workPhone: varchar("workPhone", { length: 21 }),
  email: varchar("email", { length: 100 }),
  address1: varchar("address1", { length: 50 }),
  address2: varchar("address2", { length: 50 }),
  city: varchar("city", { length: 30 }),
  state: varchar("state", { length: 10 }),
  zip: varchar("zip", { length: 10 }),
  photoUpdated: timestamp("photoUpdated"),
  householdId: char("householdId", { length: 11 }),
  householdRole: varchar("householdRole", { length: 10 }),
  removed: boolean("removed"),
  conversationId: char("conversationId", { length: 11 }),
  optedOut: boolean("optedOut"),
  nametagNotes: varchar("nametagNotes", { length: 20 }),
  donorNumber: varchar("donorNumber", { length: 20 })
}, (t) => [
  index("mem_people_churchId").on(t.churchId),
  index("mem_people_userId").on(t.userId),
  index("mem_people_householdId").on(t.householdId)
]);

export const questions = pgTable("questions", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  formId: char("formId", { length: 11 }),
  parentId: char("parentId", { length: 11 }),
  title: varchar("title", { length: 255 }),
  description: varchar("description", { length: 255 }),
  fieldType: varchar("fieldType", { length: 50 }),
  placeholder: varchar("placeholder", { length: 50 }),
  sort: integer("sort"),
  choices: text("choices"),
  removed: boolean("removed"),
  required: boolean("required")
}, (t) => [
  index("mem_questions_churchId").on(t.churchId),
  index("mem_questions_formId").on(t.formId)
]);

export const roleMembers = pgTable("roleMembers", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  roleId: char("roleId", { length: 11 }),
  userId: char("userId", { length: 11 }),
  dateAdded: timestamp("dateAdded"),
  addedBy: char("addedBy", { length: 11 })
}, (t) => [
  index("mem_roleMembers_userId").on(t.userId),
  index("mem_roleMembers_userId_churchId").on(t.userId, t.churchId),
  index("mem_roleMembers_roleId_churchId").on(t.roleId, t.churchId)
]);

export const rolePermissions = pgTable("rolePermissions", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  roleId: char("roleId", { length: 11 }),
  apiName: varchar("apiName", { length: 45 }),
  contentType: varchar("contentType", { length: 45 }),
  contentId: char("contentId", { length: 11 }),
  action: varchar("action", { length: 45 })
}, (t) => [index("mem_rolePermissions_roleId_churchId").on(t.roleId, t.churchId)]);

export const roles = pgTable("roles", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  name: varchar("name", { length: 255 })
});

export const membershipSettings = pgTable("settings", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  userId: char("userId", { length: 11 }),
  keyName: varchar("keyName", { length: 255 }),
  value: text("value"),
  public: boolean("public")
}, (t) => [index("mem_settings_churchId").on(t.churchId)]);

export const usageTrends = pgTable("usageTrends", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  year: integer("year"),
  week: integer("week"),
  b1Users: integer("b1Users"),
  b1Churches: integer("b1Churches"),
  b1Devices: integer("b1Devices"),
  chumsUsers: integer("chumsUsers"),
  chumsChurches: integer("chumsChurches"),
  lessonsUsers: integer("lessonsUsers"),
  lessonsChurches: integer("lessonsChurches"),
  lessonsDevices: integer("lessonsDevices"),
  freeShowDevices: integer("freeShowDevices")
}, (t) => [uniqueIndex("mem_usageTrends_year_week").on(t.year, t.week)]);

export const userChurches = pgTable("userChurches", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  userId: char("userId", { length: 11 }),
  churchId: char("churchId", { length: 11 }),
  personId: char("personId", { length: 11 }),
  lastAccessed: timestamp("lastAccessed")
}, (t) => [
  index("mem_userChurches_userId").on(t.userId),
  index("mem_userChurches_churchId").on(t.churchId)
]);

export const users = pgTable("users", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  email: varchar("email", { length: 191 }),
  password: varchar("password", { length: 255 }),
  authGuid: varchar("authGuid", { length: 255 }),
  displayName: varchar("displayName", { length: 255 }),
  registrationDate: timestamp("registrationDate"),
  lastLogin: timestamp("lastLogin"),
  firstName: varchar("firstName", { length: 45 }),
  lastName: varchar("lastName", { length: 45 })
}, (t) => [
  uniqueIndex("mem_users_email_UNIQUE").on(t.email),
  index("mem_users_authGuid").on(t.authGuid)
]);

export const visibilityPreferences = pgTable("visibilityPreferences", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  personId: char("personId", { length: 11 }),
  address: varchar("address", { length: 50 }),
  phoneNumber: varchar("phoneNumber", { length: 50 }),
  email: varchar("email", { length: 50 })
});
