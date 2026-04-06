import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  // 1. users
  await db.schema
    .createTable("users")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("email", sql`varchar(191)`)
    .addColumn("password", sql`varchar(255)`)
    .addColumn("authGuid", sql`varchar(255)`)
    .addColumn("displayName", sql`varchar(255)`)
    .addColumn("registrationDate", sql`datetime`, (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn("lastLogin", sql`datetime`)
    .addColumn("firstName", sql`varchar(45)`)
    .addColumn("lastName", sql`varchar(45)`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema.createIndex("idx_users_email").on("users").columns(["email"]).unique().execute();
  await db.schema.createIndex("idx_users_authGuid").on("users").columns(["authGuid"]).execute();

  // 2. churches
  await db.schema
    .createTable("churches")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("name", sql`varchar(255)`)
    .addColumn("subDomain", sql`varchar(45)`)
    .addColumn("registrationDate", sql`datetime`, (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn("address1", sql`varchar(255)`)
    .addColumn("address2", sql`varchar(255)`)
    .addColumn("city", sql`varchar(255)`)
    .addColumn("state", sql`varchar(45)`)
    .addColumn("zip", sql`varchar(45)`)
    .addColumn("country", sql`varchar(45)`)
    .addColumn("archivedDate", sql`datetime`)
    .addColumn("latitude", sql`float`)
    .addColumn("longitude", sql`float`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  // 3. userChurches
  await db.schema
    .createTable("userChurches")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("userId", sql`char(11)`)
    .addColumn("churchId", sql`char(11)`)
    .addColumn("personId", sql`char(11)`)
    .addColumn("lastAccessed", sql`datetime`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema.createIndex("idx_userChurches_userId").on("userChurches").columns(["userId"]).execute();
  await db.schema.createIndex("idx_userChurches_churchId").on("userChurches").columns(["churchId"]).execute();

  // 4. people
  await db.schema
    .createTable("people")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("userId", sql`char(11)`)
    .addColumn("displayName", sql`varchar(100)`)
    .addColumn("firstName", sql`varchar(50)`)
    .addColumn("middleName", sql`varchar(50)`)
    .addColumn("lastName", sql`varchar(50)`)
    .addColumn("nickName", sql`varchar(50)`)
    .addColumn("prefix", sql`varchar(10)`)
    .addColumn("suffix", sql`varchar(10)`)
    .addColumn("birthDate", sql`datetime`)
    .addColumn("gender", sql`varchar(11)`)
    .addColumn("maritalStatus", sql`varchar(10)`)
    .addColumn("anniversary", sql`datetime`)
    .addColumn("membershipStatus", sql`varchar(50)`)
    .addColumn("homePhone", sql`varchar(21)`)
    .addColumn("mobilePhone", sql`varchar(21)`)
    .addColumn("workPhone", sql`varchar(21)`)
    .addColumn("email", sql`varchar(100)`)
    .addColumn("address1", sql`varchar(50)`)
    .addColumn("address2", sql`varchar(50)`)
    .addColumn("city", sql`varchar(30)`)
    .addColumn("state", sql`varchar(10)`)
    .addColumn("zip", sql`varchar(10)`)
    .addColumn("photoUpdated", sql`datetime`)
    .addColumn("householdId", sql`char(11)`)
    .addColumn("householdRole", sql`varchar(10)`)
    .addColumn("removed", sql`bit(1)`)
    .addColumn("conversationId", sql`char(11)`)
    .addColumn("optedOut", sql`bit(1)`)
    .addColumn("nametagNotes", sql`varchar(20)`)
    .addColumn("donorNumber", sql`varchar(20)`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema.createIndex("idx_people_churchId").on("people").columns(["churchId"]).execute();
  await db.schema.createIndex("idx_people_userId").on("people").columns(["userId"]).execute();
  await db.schema.createIndex("idx_people_householdId").on("people").columns(["householdId"]).execute();

  // 5. households
  await db.schema
    .createTable("households")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("name", sql`varchar(50)`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema.createIndex("idx_households_churchId").on("households").columns(["churchId"]).execute();

  // 6. groups
  await db.schema
    .createTable("groups")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("categoryName", sql`varchar(50)`)
    .addColumn("name", sql`varchar(50)`)
    .addColumn("trackAttendance", sql`bit(1)`)
    .addColumn("parentPickup", sql`bit(1)`)
    .addColumn("printNametag", sql`bit(1)`)
    .addColumn("about", sql`text`)
    .addColumn("photoUrl", sql`varchar(255)`)
    .addColumn("removed", sql`bit(1)`)
    .addColumn("tags", sql`varchar(45)`)
    .addColumn("meetingTime", sql`varchar(45)`)
    .addColumn("meetingLocation", sql`varchar(45)`)
    .addColumn("labels", sql`varchar(500)`)
    .addColumn("slug", sql`varchar(45)`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema.createIndex("idx_groups_churchId").on("groups").columns(["churchId"]).execute();
  await db.schema.createIndex("idx_groups_churchId_removed_tags").on("groups").columns(["churchId", "removed", "tags"]).execute();
  await db.schema.createIndex("idx_groups_churchId_removed_labels").on("groups").columns(["churchId", "removed", "labels"]).execute();

  // 7. groupMembers
  await db.schema
    .createTable("groupMembers")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("groupId", sql`char(11)`)
    .addColumn("personId", sql`char(11)`)
    .addColumn("joinDate", sql`datetime`)
    .addColumn("leader", sql`bit(1)`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema.createIndex("idx_groupMembers_churchId").on("groupMembers").columns(["churchId"]).execute();
  await db.schema.createIndex("idx_groupMembers_groupId").on("groupMembers").columns(["groupId"]).execute();
  await db.schema.createIndex("idx_groupMembers_personId").on("groupMembers").columns(["personId"]).execute();
  await db.schema.createIndex("idx_groupMembers_churchId_groupId_personId").on("groupMembers").columns(["churchId", "groupId", "personId"]).execute();
  await db.schema.createIndex("idx_groupMembers_personId_churchId").on("groupMembers").columns(["personId", "churchId"]).execute();

  // 8. roles
  await db.schema
    .createTable("roles")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("name", sql`varchar(255)`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  // 9. roleMembers
  await db.schema
    .createTable("roleMembers")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("roleId", sql`char(11)`)
    .addColumn("userId", sql`char(11)`)
    .addColumn("dateAdded", sql`datetime`)
    .addColumn("addedBy", sql`char(11)`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema.createIndex("idx_roleMembers_userId").on("roleMembers").columns(["userId"]).execute();
  await db.schema.createIndex("idx_roleMembers_userId_churchId").on("roleMembers").columns(["userId", "churchId"]).execute();
  await db.schema.createIndex("idx_roleMembers_roleId_churchId").on("roleMembers").columns(["roleId", "churchId"]).execute();

  // 10. rolePermissions
  await db.schema
    .createTable("rolePermissions")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("roleId", sql`char(11)`)
    .addColumn("apiName", sql`varchar(45)`)
    .addColumn("contentType", sql`varchar(45)`)
    .addColumn("contentId", sql`char(11)`)
    .addColumn("action", sql`varchar(45)`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema.createIndex("idx_rolePermissions_roleId_churchId").on("rolePermissions").columns(["roleId", "churchId"]).execute();

  // 11. memberPermissions
  await db.schema
    .createTable("memberPermissions")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("memberId", sql`char(11)`)
    .addColumn("contentType", sql`varchar(45)`)
    .addColumn("contentId", sql`char(11)`)
    .addColumn("action", sql`varchar(45)`)
    .addColumn("emailNotification", sql`bit(1)`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema.createIndex("idx_memberPermissions_churchId_contentId_memberId").on("memberPermissions").columns(["churchId", "contentId", "memberId"]).execute();

  // 12. forms
  await db.schema
    .createTable("forms")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("name", sql`varchar(255)`)
    .addColumn("contentType", sql`varchar(50)`)
    .addColumn("createdTime", sql`datetime`)
    .addColumn("modifiedTime", sql`datetime`)
    .addColumn("accessStartTime", sql`datetime`)
    .addColumn("accessEndTime", sql`datetime`)
    .addColumn("restricted", sql`bit(1)`)
    .addColumn("archived", sql`bit(1)`)
    .addColumn("removed", sql`bit(1)`)
    .addColumn("thankYouMessage", sql`text`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema.createIndex("idx_forms_churchId").on("forms").columns(["churchId"]).execute();
  await db.schema.createIndex("idx_forms_churchId_removed_archived").on("forms").columns(["churchId", "removed", "archived"]).execute();
  await db.schema.createIndex("idx_forms_churchId_id").on("forms").columns(["churchId", "id"]).execute();

  // 13. formSubmissions
  await db.schema
    .createTable("formSubmissions")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("formId", sql`char(11)`)
    .addColumn("contentType", sql`varchar(50)`)
    .addColumn("contentId", sql`char(11)`)
    .addColumn("submissionDate", sql`datetime`)
    .addColumn("submittedBy", sql`char(11)`)
    .addColumn("revisionDate", sql`datetime`)
    .addColumn("revisedBy", sql`char(11)`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema.createIndex("idx_formSubmissions_churchId").on("formSubmissions").columns(["churchId"]).execute();
  await db.schema.createIndex("idx_formSubmissions_formId").on("formSubmissions").columns(["formId"]).execute();

  // 14. questions
  await db.schema
    .createTable("questions")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("formId", sql`char(11)`)
    .addColumn("parentId", sql`char(11)`)
    .addColumn("title", sql`varchar(255)`)
    .addColumn("description", sql`varchar(255)`)
    .addColumn("fieldType", sql`varchar(50)`)
    .addColumn("placeholder", sql`varchar(50)`)
    .addColumn("sort", sql`int`)
    .addColumn("choices", sql`text`)
    .addColumn("removed", sql`bit(1)`)
    .addColumn("required", sql`bit(1)`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema.createIndex("idx_questions_churchId").on("questions").columns(["churchId"]).execute();
  await db.schema.createIndex("idx_questions_formId").on("questions").columns(["formId"]).execute();

  // 15. answers
  await db.schema
    .createTable("answers")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("formSubmissionId", sql`char(11)`)
    .addColumn("questionId", sql`char(11)`)
    .addColumn("value", sql`varchar(4000)`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema.createIndex("idx_answers_churchId").on("answers").columns(["churchId"]).execute();
  await db.schema.createIndex("idx_answers_formSubmissionId").on("answers").columns(["formSubmissionId"]).execute();
  await db.schema.createIndex("idx_answers_questionId").on("answers").columns(["questionId"]).execute();

  // 16. settings
  await db.schema
    .createTable("settings")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("userId", sql`char(11)`)
    .addColumn("keyName", sql`varchar(255)`)
    .addColumn("value", sql`mediumtext`)
    .addColumn("public", sql`bit(1)`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema.createIndex("idx_settings_churchId").on("settings").columns(["churchId"]).execute();

  // 17. accessLogs
  await db.schema
    .createTable("accessLogs")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("userId", sql`char(11)`)
    .addColumn("churchId", sql`char(11)`)
    .addColumn("appName", sql`varchar(45)`)
    .addColumn("loginTime", sql`datetime`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  // 18. auditLogs
  await db.schema
    .createTable("auditLogs")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`, (col) => col.notNull())
    .addColumn("userId", sql`char(11)`)
    .addColumn("category", sql`varchar(50)`, (col) => col.notNull())
    .addColumn("action", sql`varchar(100)`, (col) => col.notNull())
    .addColumn("entityType", sql`varchar(100)`)
    .addColumn("entityId", sql`char(11)`)
    .addColumn("details", sql`text`)
    .addColumn("ipAddress", sql`varchar(45)`)
    .addColumn("created", sql`datetime`, (col) => col.notNull())
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema.createIndex("idx_auditLogs_churchId_created").on("auditLogs").columns(["churchId", "created"]).execute();
  await db.schema.createIndex("idx_auditLogs_churchId_category").on("auditLogs").columns(["churchId", "category"]).execute();
  await db.schema.createIndex("idx_auditLogs_churchId_userId").on("auditLogs").columns(["churchId", "userId"]).execute();
  await db.schema.createIndex("idx_auditLogs_churchId_entityType_entityId").on("auditLogs").columns(["churchId", "entityType", "entityId"]).execute();

  // 19. clientErrors
  await db.schema
    .createTable("clientErrors")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("application", sql`varchar(45)`)
    .addColumn("errorTime", sql`datetime`)
    .addColumn("userId", sql`char(11)`)
    .addColumn("churchId", sql`char(11)`)
    .addColumn("originUrl", sql`varchar(255)`)
    .addColumn("errorType", sql`varchar(45)`)
    .addColumn("message", sql`varchar(255)`)
    .addColumn("details", sql`text`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  // 20. domains
  await db.schema
    .createTable("domains")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("domainName", sql`varchar(255)`)
    .addColumn("lastChecked", sql`datetime`)
    .addColumn("isStale", sql`tinyint(1)`, (col) => col.defaultTo(0))
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  // 21. visibilityPreferences
  await db.schema
    .createTable("visibilityPreferences")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("personId", sql`char(11)`)
    .addColumn("address", sql`varchar(50)`)
    .addColumn("phoneNumber", sql`varchar(50)`)
    .addColumn("email", sql`varchar(50)`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  // 22. campuses
  await db.schema
    .createTable("campuses")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("name", sql`varchar(255)`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  // 23. oAuthClients
  await db.schema
    .createTable("oAuthClients")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("name", sql`varchar(45)`)
    .addColumn("clientId", sql`varchar(45)`)
    .addColumn("clientSecret", sql`varchar(45)`)
    .addColumn("redirectUris", sql`varchar(255)`)
    .addColumn("scopes", sql`varchar(255)`)
    .addColumn("createdAt", sql`datetime`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  // 24. oAuthCodes
  await db.schema
    .createTable("oAuthCodes")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("userChurchId", sql`char(11)`)
    .addColumn("clientId", sql`char(11)`)
    .addColumn("code", sql`varchar(45)`)
    .addColumn("redirectUri", sql`varchar(255)`)
    .addColumn("scopes", sql`varchar(255)`)
    .addColumn("expiresAt", sql`datetime`)
    .addColumn("createdAt", sql`datetime`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  // 25. oAuthDeviceCodes
  await db.schema
    .createTable("oAuthDeviceCodes")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("deviceCode", sql`varchar(64)`, (col) => col.notNull())
    .addColumn("userCode", sql`varchar(16)`, (col) => col.notNull())
    .addColumn("clientId", sql`varchar(45)`, (col) => col.notNull())
    .addColumn("scopes", sql`varchar(255)`)
    .addColumn("expiresAt", sql`datetime`, (col) => col.notNull())
    .addColumn("pollInterval", sql`int`, (col) => col.defaultTo(5))
    .addColumn("status", sql`enum('pending','approved','denied','expired')`, (col) => col.defaultTo("pending"))
    .addColumn("approvedByUserId", sql`char(11)`)
    .addColumn("userChurchId", sql`char(11)`)
    .addColumn("churchId", sql`char(11)`)
    .addColumn("createdAt", sql`datetime`, (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`))
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema.createIndex("idx_oAuthDeviceCodes_deviceCode").on("oAuthDeviceCodes").columns(["deviceCode"]).unique().execute();
  await db.schema.createIndex("idx_oAuthDeviceCodes_userCode_status").on("oAuthDeviceCodes").columns(["userCode", "status"]).execute();
  await db.schema.createIndex("idx_oAuthDeviceCodes_status_expiresAt").on("oAuthDeviceCodes").columns(["status", "expiresAt"]).execute();

  // 26. oAuthRelaySessions
  await db.schema
    .createTable("oAuthRelaySessions")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("sessionCode", sql`varchar(16)`, (col) => col.notNull())
    .addColumn("provider", sql`varchar(45)`, (col) => col.notNull())
    .addColumn("authCode", sql`varchar(512)`)
    .addColumn("redirectUri", sql`varchar(512)`, (col) => col.notNull())
    .addColumn("status", sql`enum('pending','completed','expired')`, (col) => col.defaultTo("pending"))
    .addColumn("expiresAt", sql`datetime`, (col) => col.notNull())
    .addColumn("createdAt", sql`datetime`, (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`))
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema.createIndex("idx_oAuthRelaySessions_sessionCode").on("oAuthRelaySessions").columns(["sessionCode"]).unique().execute();
  await db.schema.createIndex("idx_oAuthRelaySessions_status_expiresAt").on("oAuthRelaySessions").columns(["status", "expiresAt"]).execute();

  // 27. oAuthTokens
  await db.schema
    .createTable("oAuthTokens")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("clientId", sql`char(11)`)
    .addColumn("userChurchId", sql`char(11)`)
    .addColumn("accessToken", sql`varchar(1000)`)
    .addColumn("refreshToken", sql`varchar(45)`)
    .addColumn("scopes", sql`varchar(45)`)
    .addColumn("expiresAt", sql`datetime`)
    .addColumn("createdAt", sql`datetime`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  // 28. notes
  await db.schema
    .createTable("notes")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("contentType", sql`varchar(50)`)
    .addColumn("contentId", sql`char(11)`)
    .addColumn("noteType", sql`varchar(50)`)
    .addColumn("addedBy", sql`char(11)`)
    .addColumn("createdAt", sql`datetime`)
    .addColumn("contents", sql`text`)
    .addColumn("updatedAt", sql`datetime`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema.createIndex("idx_notes_churchId").on("notes").columns(["churchId"]).execute();

  // 29. usageTrends
  await db.schema
    .createTable("usageTrends")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("year", sql`int`)
    .addColumn("week", sql`int`)
    .addColumn("b1Users", sql`int`)
    .addColumn("b1Churches", sql`int`)
    .addColumn("b1Devices", sql`int`)
    .addColumn("chumsUsers", sql`int`)
    .addColumn("chumsChurches", sql`int`)
    .addColumn("lessonsUsers", sql`int`)
    .addColumn("lessonsChurches", sql`int`)
    .addColumn("lessonsDevices", sql`int`)
    .addColumn("freeShowDevices", sql`int`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema.createIndex("idx_usageTrends_year_week").on("usageTrends").columns(["year", "week"]).unique().execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("usageTrends").ifExists().execute();
  await db.schema.dropTable("notes").ifExists().execute();
  await db.schema.dropTable("oAuthTokens").ifExists().execute();
  await db.schema.dropTable("oAuthRelaySessions").ifExists().execute();
  await db.schema.dropTable("oAuthDeviceCodes").ifExists().execute();
  await db.schema.dropTable("oAuthCodes").ifExists().execute();
  await db.schema.dropTable("oAuthClients").ifExists().execute();
  await db.schema.dropTable("campuses").ifExists().execute();
  await db.schema.dropTable("visibilityPreferences").ifExists().execute();
  await db.schema.dropTable("domains").ifExists().execute();
  await db.schema.dropTable("clientErrors").ifExists().execute();
  await db.schema.dropTable("auditLogs").ifExists().execute();
  await db.schema.dropTable("accessLogs").ifExists().execute();
  await db.schema.dropTable("settings").ifExists().execute();
  await db.schema.dropTable("answers").ifExists().execute();
  await db.schema.dropTable("questions").ifExists().execute();
  await db.schema.dropTable("formSubmissions").ifExists().execute();
  await db.schema.dropTable("forms").ifExists().execute();
  await db.schema.dropTable("memberPermissions").ifExists().execute();
  await db.schema.dropTable("rolePermissions").ifExists().execute();
  await db.schema.dropTable("roleMembers").ifExists().execute();
  await db.schema.dropTable("roles").ifExists().execute();
  await db.schema.dropTable("groupMembers").ifExists().execute();
  await db.schema.dropTable("groups").ifExists().execute();
  await db.schema.dropTable("households").ifExists().execute();
  await db.schema.dropTable("people").ifExists().execute();
  await db.schema.dropTable("userChurches").ifExists().execute();
  await db.schema.dropTable("churches").ifExists().execute();
  await db.schema.dropTable("users").ifExists().execute();
}
