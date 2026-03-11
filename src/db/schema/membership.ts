import { mysqlTable, char, varchar, datetime, date, boolean, int, float, text, mediumtext, tinyint, mysqlEnum, index, uniqueIndex } from "drizzle-orm/mysql-core";

export const accessLogs = mysqlTable("accessLogs", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  userId: char("userId", { length: 11 }),
  churchId: char("churchId", { length: 11 }),
  appName: varchar("appName", { length: 45 }),
  loginTime: datetime("loginTime"),
});

export const answers = mysqlTable("answers", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  formSubmissionId: char("formSubmissionId", { length: 11 }),
  questionId: char("questionId", { length: 11 }),
  value: varchar("value", { length: 4000 }),
}, (t) => [
  index("churchId").on(t.churchId),
  index("formSubmissionId").on(t.formSubmissionId),
  index("questionId").on(t.questionId),
]);

export const auditLogs = mysqlTable("auditLogs", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }).notNull(),
  userId: char("userId", { length: 11 }),
  category: varchar("category", { length: 50 }).notNull(),
  action: varchar("action", { length: 100 }).notNull(),
  entityType: varchar("entityType", { length: 100 }),
  entityId: char("entityId", { length: 11 }),
  details: text("details"),
  ipAddress: varchar("ipAddress", { length: 45 }),
  created: datetime("created").notNull(),
}, (t) => [
  index("ix_auditLogs_church_created").on(t.churchId, t.created),
  index("ix_auditLogs_church_category").on(t.churchId, t.category),
  index("ix_auditLogs_church_userId").on(t.churchId, t.userId),
  index("ix_auditLogs_church_entity").on(t.churchId, t.entityType, t.entityId),
]);

export const churches = mysqlTable("churches", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  name: varchar("name", { length: 255 }),
  subDomain: varchar("subDomain", { length: 45 }),
  registrationDate: datetime("registrationDate"),
  address1: varchar("address1", { length: 255 }),
  address2: varchar("address2", { length: 255 }),
  city: varchar("city", { length: 255 }),
  state: varchar("state", { length: 45 }),
  zip: varchar("zip", { length: 45 }),
  country: varchar("country", { length: 45 }),
  archivedDate: datetime("archivedDate"),
  latitude: float("latitude"),
  longitude: float("longitude"),
});

export const clientErrors = mysqlTable("clientErrors", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  application: varchar("application", { length: 45 }),
  errorTime: datetime("errorTime"),
  userId: char("userId", { length: 11 }),
  churchId: char("churchId", { length: 11 }),
  originUrl: varchar("originUrl", { length: 255 }),
  errorType: varchar("errorType", { length: 45 }),
  message: varchar("message", { length: 255 }),
  details: text("details"),
});

export const domains = mysqlTable("domains", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  domainName: varchar("domainName", { length: 255 }),
  lastChecked: datetime("lastChecked"),
  isStale: tinyint("isStale").default(0),
});

export const forms = mysqlTable("forms", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  name: varchar("name", { length: 255 }),
  contentType: varchar("contentType", { length: 50 }),
  createdTime: datetime("createdTime"),
  modifiedTime: datetime("modifiedTime"),
  accessStartTime: datetime("accessStartTime"),
  accessEndTime: datetime("accessEndTime"),
  restricted: boolean("restricted"),
  archived: boolean("archived"),
  removed: boolean("removed"),
  thankYouMessage: text("thankYouMessage"),
}, (t) => [
  index("churchId").on(t.churchId),
  index("churchId_removed_archived").on(t.churchId, t.removed, t.archived),
  index("churchId_id").on(t.churchId, t.id),
]);

export const formSubmissions = mysqlTable("formSubmissions", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  formId: char("formId", { length: 11 }),
  contentType: varchar("contentType", { length: 50 }),
  contentId: char("contentId", { length: 11 }),
  submissionDate: datetime("submissionDate"),
  submittedBy: char("submittedBy", { length: 11 }),
  revisionDate: datetime("revisionDate"),
  revisedBy: char("revisedBy", { length: 11 }),
}, (t) => [
  index("churchId").on(t.churchId),
  index("formId").on(t.formId),
]);

export const groupMembers = mysqlTable("groupMembers", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  groupId: char("groupId", { length: 11 }),
  personId: char("personId", { length: 11 }),
  joinDate: datetime("joinDate"),
  leader: boolean("leader"),
}, (t) => [
  index("churchId").on(t.churchId),
  index("groupId").on(t.groupId),
  index("personId").on(t.personId),
  index("churchId_groupId_personId").on(t.churchId, t.groupId, t.personId),
  index("personId_churchId").on(t.personId, t.churchId),
]);

export const groups = mysqlTable("groups", {
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
  slug: varchar("slug", { length: 45 }),
}, (t) => [
  index("churchId").on(t.churchId),
  index("churchId_removed_tags").on(t.churchId, t.removed, t.tags),
  index("churchId_removed_labels").on(t.churchId, t.removed, t.labels),
]);

export const households = mysqlTable("households", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  name: varchar("name", { length: 50 }),
}, (t) => [
  index("churchId").on(t.churchId),
]);

export const memberPermissions = mysqlTable("memberPermissions", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  memberId: char("memberId", { length: 11 }),
  contentType: varchar("contentType", { length: 45 }),
  contentId: char("contentId", { length: 11 }),
  action: varchar("action", { length: 45 }),
  emailNotification: boolean("emailNotification"),
}, (t) => [
  index("churchId_contentId_memberId").on(t.churchId, t.contentId, t.memberId),
]);

export const membershipNotes = mysqlTable("notes", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  contentType: varchar("contentType", { length: 50 }),
  contentId: char("contentId", { length: 11 }),
  noteType: varchar("noteType", { length: 50 }),
  addedBy: char("addedBy", { length: 11 }),
  createdAt: datetime("createdAt"),
  contents: text("contents"),
  updatedAt: datetime("updatedAt"),
}, (t) => [
  index("churchId").on(t.churchId),
]);

export const oAuthClients = mysqlTable("oAuthClients", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  name: varchar("name", { length: 45 }),
  clientId: varchar("clientId", { length: 45 }),
  clientSecret: varchar("clientSecret", { length: 45 }),
  redirectUris: varchar("redirectUris", { length: 255 }),
  scopes: varchar("scopes", { length: 255 }),
  createdAt: datetime("createdAt"),
});

export const oAuthCodes = mysqlTable("oAuthCodes", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  userChurchId: char("userChurchId", { length: 11 }),
  clientId: char("clientId", { length: 11 }),
  code: varchar("code", { length: 45 }),
  redirectUri: varchar("redirectUri", { length: 255 }),
  scopes: varchar("scopes", { length: 255 }),
  expiresAt: datetime("expiresAt"),
  createdAt: datetime("createdAt"),
});

export const oAuthDeviceCodes = mysqlTable("oAuthDeviceCodes", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  deviceCode: varchar("deviceCode", { length: 64 }).notNull(),
  userCode: varchar("userCode", { length: 16 }).notNull(),
  clientId: varchar("clientId", { length: 45 }).notNull(),
  scopes: varchar("scopes", { length: 255 }),
  expiresAt: datetime("expiresAt").notNull(),
  pollInterval: int("pollInterval").default(5),
  status: mysqlEnum("status", ["pending", "approved", "denied", "expired"]).default("pending"),
  approvedByUserId: char("approvedByUserId", { length: 11 }),
  userChurchId: char("userChurchId", { length: 11 }),
  churchId: char("churchId", { length: 11 }),
  createdAt: datetime("createdAt"),
}, (t) => [
  uniqueIndex("deviceCode").on(t.deviceCode),
  index("userCode_status").on(t.userCode, t.status),
  index("status_expiresAt").on(t.status, t.expiresAt),
]);

export const oAuthRelaySessions = mysqlTable("oAuthRelaySessions", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  sessionCode: varchar("sessionCode", { length: 16 }).notNull(),
  provider: varchar("provider", { length: 45 }).notNull(),
  authCode: varchar("authCode", { length: 512 }),
  redirectUri: varchar("redirectUri", { length: 512 }).notNull(),
  status: mysqlEnum("status", ["pending", "completed", "expired"]).default("pending"),
  expiresAt: datetime("expiresAt").notNull(),
  createdAt: datetime("createdAt"),
}, (t) => [
  uniqueIndex("sessionCode").on(t.sessionCode),
  index("status_expiresAt").on(t.status, t.expiresAt),
]);

export const oAuthTokens = mysqlTable("oAuthTokens", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  clientId: char("clientId", { length: 11 }),
  userChurchId: char("userChurchId", { length: 11 }),
  accessToken: varchar("accessToken", { length: 1000 }),
  refreshToken: varchar("refreshToken", { length: 45 }),
  scopes: varchar("scopes", { length: 45 }),
  expiresAt: datetime("expiresAt"),
  createdAt: datetime("createdAt"),
});

export const people = mysqlTable("people", {
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
  birthDate: datetime("birthDate"),
  gender: varchar("gender", { length: 11 }),
  maritalStatus: varchar("maritalStatus", { length: 10 }),
  anniversary: datetime("anniversary"),
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
  photoUpdated: datetime("photoUpdated"),
  householdId: char("householdId", { length: 11 }),
  householdRole: varchar("householdRole", { length: 10 }),
  removed: boolean("removed"),
  conversationId: char("conversationId", { length: 11 }),
  optedOut: boolean("optedOut"),
  nametagNotes: varchar("nametagNotes", { length: 20 }),
  donorNumber: varchar("donorNumber", { length: 20 }),
}, (t) => [
  index("churchId").on(t.churchId),
  index("userId").on(t.userId),
  index("householdId").on(t.householdId),
]);

export const questions = mysqlTable("questions", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  formId: char("formId", { length: 11 }),
  parentId: char("parentId", { length: 11 }),
  title: varchar("title", { length: 255 }),
  description: varchar("description", { length: 255 }),
  fieldType: varchar("fieldType", { length: 50 }),
  placeholder: varchar("placeholder", { length: 50 }),
  sort: int("sort"),
  choices: text("choices"),
  removed: boolean("removed"),
  required: boolean("required"),
}, (t) => [
  index("churchId").on(t.churchId),
  index("formId").on(t.formId),
]);

export const roleMembers = mysqlTable("roleMembers", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  roleId: char("roleId", { length: 11 }),
  userId: char("userId", { length: 11 }),
  dateAdded: datetime("dateAdded"),
  addedBy: char("addedBy", { length: 11 }),
}, (t) => [
  index("userId_INDEX").on(t.userId),
  index("userId_churchId").on(t.userId, t.churchId),
  index("roleId_churchId").on(t.roleId, t.churchId),
]);

export const rolePermissions = mysqlTable("rolePermissions", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  roleId: char("roleId", { length: 11 }),
  apiName: varchar("apiName", { length: 45 }),
  contentType: varchar("contentType", { length: 45 }),
  contentId: char("contentId", { length: 11 }),
  action: varchar("action", { length: 45 }),
}, (t) => [
  index("roleId_churchId_INDEX").on(t.roleId, t.churchId),
]);

export const roles = mysqlTable("roles", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  name: varchar("name", { length: 255 }),
});

export const membershipSettings = mysqlTable("settings", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  userId: char("userId", { length: 11 }),
  keyName: varchar("keyName", { length: 255 }),
  value: mediumtext("value"),
  public: boolean("public"),
}, (t) => [
  index("churchId").on(t.churchId),
]);

export const usageTrends = mysqlTable("usageTrends", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  year: int("year"),
  week: int("week"),
  b1Users: int("b1Users"),
  b1Churches: int("b1Churches"),
  b1Devices: int("b1Devices"),
  chumsUsers: int("chumsUsers"),
  chumsChurches: int("chumsChurches"),
  lessonsUsers: int("lessonsUsers"),
  lessonsChurches: int("lessonsChurches"),
  lessonsDevices: int("lessonsDevices"),
  freeShowDevices: int("freeShowDevices"),
}, (t) => [
  uniqueIndex("year_week").on(t.year, t.week),
]);

export const userChurches = mysqlTable("userChurches", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  userId: char("userId", { length: 11 }),
  churchId: char("churchId", { length: 11 }),
  personId: char("personId", { length: 11 }),
  lastAccessed: datetime("lastAccessed"),
}, (t) => [
  index("userId").on(t.userId),
  index("churchId").on(t.churchId),
]);

export const users = mysqlTable("users", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  email: varchar("email", { length: 191 }),
  password: varchar("password", { length: 255 }),
  authGuid: varchar("authGuid", { length: 255 }),
  displayName: varchar("displayName", { length: 255 }),
  registrationDate: datetime("registrationDate"),
  lastLogin: datetime("lastLogin"),
  firstName: varchar("firstName", { length: 45 }),
  lastName: varchar("lastName", { length: 45 }),
}, (t) => [
  uniqueIndex("email_UNIQUE").on(t.email),
  index("authGuid_INDEX").on(t.authGuid),
]);

export const visibilityPreferences = mysqlTable("visibilityPreferences", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  personId: char("personId", { length: 11 }),
  address: varchar("address", { length: 50 }),
  phoneNumber: varchar("phoneNumber", { length: 50 }),
  email: varchar("email", { length: 50 }),
});
