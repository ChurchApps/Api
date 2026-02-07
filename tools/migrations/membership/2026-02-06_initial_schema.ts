import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  // === Access ===

  await db.schema
    .createTable("accessLogs")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("userId", sql`char(11)`)
    .addColumn("churchId", sql`char(11)`)
    .addColumn("appName", sql`varchar(45)`)
    .addColumn("loginTime", "datetime")
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema
    .createTable("churches")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("name", sql`varchar(255)`)
    .addColumn("subDomain", sql`varchar(45)`)
    .addColumn("registrationDate", "datetime", (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn("address1", sql`varchar(255)`)
    .addColumn("address2", sql`varchar(255)`)
    .addColumn("city", sql`varchar(255)`)
    .addColumn("state", sql`varchar(45)`)
    .addColumn("zip", sql`varchar(45)`)
    .addColumn("country", sql`varchar(45)`)
    .addColumn("archivedDate", "datetime")
    .addColumn("latitude", sql`float`)
    .addColumn("longitude", sql`float`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema
    .createTable("domains")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("domainName", sql`varchar(255)`)
    .addColumn("lastChecked", "datetime")
    .addColumn("isStale", sql`tinyint(1)`, (col) => col.defaultTo(0))
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema
    .createTable("roles")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("name", sql`varchar(255)`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema
    .createTable("roleMembers")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("roleId", sql`char(11)`)
    .addColumn("userId", sql`char(11)`)
    .addColumn("dateAdded", "datetime")
    .addColumn("addedBy", sql`char(11)`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema
    .createIndex("userId_INDEX")
    .on("roleMembers")
    .column("userId")
    .execute();

  await db.schema
    .createIndex("roleMembers_userId_churchId")
    .on("roleMembers")
    .columns(["userId", "churchId"])
    .execute();

  await db.schema
    .createIndex("roleMembers_roleId_churchId")
    .on("roleMembers")
    .columns(["roleId", "churchId"])
    .execute();

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

  await db.schema
    .createIndex("rolePermissions_roleId_churchId_INDEX")
    .on("rolePermissions")
    .columns(["roleId", "churchId"])
    .execute();

  await db.schema
    .createTable("users")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("email", sql`varchar(191)`)
    .addColumn("password", sql`varchar(255)`)
    .addColumn("authGuid", sql`varchar(255)`)
    .addColumn("displayName", sql`varchar(255)`)
    .addColumn("registrationDate", "datetime", (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn("lastLogin", "datetime")
    .addColumn("firstName", sql`varchar(45)`)
    .addColumn("lastName", sql`varchar(45)`)
    .addUniqueConstraint("id_UNIQUE", ["id"])
    .addUniqueConstraint("email_UNIQUE", ["email"])
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema
    .createIndex("authGuid_INDEX")
    .on("users")
    .column("authGuid")
    .execute();

  await db.schema
    .createTable("userChurches")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("userId", sql`char(11)`)
    .addColumn("churchId", sql`char(11)`)
    .addColumn("personId", sql`char(11)`)
    .addColumn("lastAccessed", "datetime")
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema
    .createIndex("userChurches_userId")
    .on("userChurches")
    .column("userId")
    .execute();

  await db.schema
    .createIndex("userChurches_churchId")
    .on("userChurches")
    .column("churchId")
    .execute();

  // === Forms ===

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

  await db.schema
    .createIndex("answers_churchId")
    .on("answers")
    .column("churchId")
    .execute();

  await db.schema
    .createIndex("answers_formSubmissionId")
    .on("answers")
    .column("formSubmissionId")
    .execute();

  await db.schema
    .createIndex("answers_questionId")
    .on("answers")
    .column("questionId")
    .execute();

  await db.schema
    .createTable("forms")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("name", sql`varchar(255)`)
    .addColumn("contentType", sql`varchar(50)`)
    .addColumn("createdTime", "datetime")
    .addColumn("modifiedTime", "datetime")
    .addColumn("accessStartTime", "datetime")
    .addColumn("accessEndTime", "datetime")
    .addColumn("restricted", sql`bit(1)`)
    .addColumn("archived", sql`bit(1)`)
    .addColumn("removed", sql`bit(1)`)
    .addColumn("thankYouMessage", "text")
    .addUniqueConstraint("forms_id_UNIQUE", ["id"])
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema
    .createIndex("forms_churchId")
    .on("forms")
    .column("churchId")
    .execute();

  await db.schema
    .createIndex("forms_churchId_removed_archived")
    .on("forms")
    .columns(["churchId", "removed", "archived"])
    .execute();

  await db.schema
    .createIndex("forms_churchId_id")
    .on("forms")
    .columns(["churchId", "id"])
    .execute();

  await db.schema
    .createTable("formSubmissions")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("formId", sql`char(11)`)
    .addColumn("contentType", sql`varchar(50)`)
    .addColumn("contentId", sql`char(11)`)
    .addColumn("submissionDate", "datetime")
    .addColumn("submittedBy", sql`char(11)`)
    .addColumn("revisionDate", "datetime")
    .addColumn("revisedBy", sql`char(11)`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema
    .createIndex("formSubmissions_churchId")
    .on("formSubmissions")
    .column("churchId")
    .execute();

  await db.schema
    .createIndex("formSubmissions_formId")
    .on("formSubmissions")
    .column("formId")
    .execute();

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
    .addColumn("sort", sql`int(11)`)
    .addColumn("choices", "text")
    .addColumn("removed", sql`bit(1)`)
    .addColumn("required", sql`bit(1)`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema
    .createIndex("questions_churchId")
    .on("questions")
    .column("churchId")
    .execute();

  await db.schema
    .createIndex("questions_formId")
    .on("questions")
    .column("formId")
    .execute();

  // === People ===

  await db.schema
    .createTable("households")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("name", sql`varchar(50)`)
    .addUniqueConstraint("households_id_UNIQUE", ["id"])
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema
    .createIndex("households_churchId")
    .on("households")
    .column("churchId")
    .execute();

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
    .addColumn("birthDate", "datetime")
    .addColumn("gender", sql`varchar(11)`)
    .addColumn("maritalStatus", sql`varchar(10)`)
    .addColumn("anniversary", "datetime")
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
    .addColumn("photoUpdated", "datetime")
    .addColumn("householdId", sql`char(11)`)
    .addColumn("householdRole", sql`varchar(10)`)
    .addColumn("removed", sql`bit(1)`)
    .addColumn("conversationId", sql`char(11)`)
    .addColumn("optedOut", sql`bit(1)`)
    .addColumn("nametagNotes", sql`varchar(20)`)
    .addColumn("donorNumber", sql`varchar(20)`)
    .addUniqueConstraint("people_id_UNIQUE", ["id"])
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema
    .createIndex("people_churchId")
    .on("people")
    .column("churchId")
    .execute();

  await db.schema
    .createIndex("people_userId")
    .on("people")
    .column("userId")
    .execute();

  await db.schema
    .createIndex("people_householdId")
    .on("people")
    .column("householdId")
    .execute();

  await db.schema
    .createIndex("people_id_INDEX")
    .on("people")
    .column("id")
    .execute();

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

  await db.schema
    .createIndex("memberPermissions_churchId_contentId_memberId")
    .on("memberPermissions")
    .columns(["churchId", "contentId", "memberId"])
    .execute();

  await db.schema
    .createTable("notes")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("contentType", sql`varchar(50)`)
    .addColumn("contentId", sql`char(11)`)
    .addColumn("noteType", sql`varchar(50)`)
    .addColumn("addedBy", sql`char(11)`)
    .addColumn("createdAt", "datetime")
    .addColumn("contents", "text")
    .addColumn("updatedAt", "datetime")
    .addUniqueConstraint("notes_id_UNIQUE", ["id"])
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema
    .createIndex("notes_churchId")
    .on("notes")
    .column("churchId")
    .execute();

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

  // === Groups ===

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
    .addColumn("about", "text")
    .addColumn("photoUrl", sql`varchar(255)`)
    .addColumn("removed", sql`bit(1)`)
    .addColumn("tags", sql`varchar(45)`)
    .addColumn("meetingTime", sql`varchar(45)`)
    .addColumn("meetingLocation", sql`varchar(45)`)
    .addColumn("labels", sql`varchar(500)`)
    .addColumn("slug", sql`varchar(45)`)
    .addUniqueConstraint("groups_id_UNIQUE", ["id"])
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema
    .createIndex("groups_churchId")
    .on("groups")
    .column("churchId")
    .execute();

  await db.schema
    .createIndex("groups_churchId_removed_tags")
    .on("groups")
    .columns(["churchId", "removed", "tags"])
    .execute();

  await db.schema
    .createIndex("groups_churchId_removed_labels")
    .on("groups")
    .columns(["churchId", "removed", "labels"])
    .execute();

  await db.schema
    .createTable("groupMembers")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("groupId", sql`char(11)`)
    .addColumn("personId", sql`char(11)`)
    .addColumn("joinDate", "datetime")
    .addColumn("leader", sql`bit(1)`)
    .addUniqueConstraint("groupMembers_id_UNIQUE", ["id"])
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema
    .createIndex("groupMembers_churchId")
    .on("groupMembers")
    .column("churchId")
    .execute();

  await db.schema
    .createIndex("groupMembers_groupId")
    .on("groupMembers")
    .column("groupId")
    .execute();

  await db.schema
    .createIndex("groupMembers_personId")
    .on("groupMembers")
    .column("personId")
    .execute();

  await db.schema
    .createIndex("groupMembers_churchId_groupId_personId")
    .on("groupMembers")
    .columns(["churchId", "groupId", "personId"])
    .execute();

  await db.schema
    .createIndex("groupMembers_personId_churchId")
    .on("groupMembers")
    .columns(["personId", "churchId"])
    .execute();

  // === OAuth ===

  await db.schema
    .createTable("oAuthClients")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("name", sql`varchar(45)`)
    .addColumn("clientId", sql`varchar(45)`)
    .addColumn("clientSecret", sql`varchar(45)`)
    .addColumn("redirectUris", sql`varchar(255)`)
    .addColumn("scopes", sql`varchar(255)`)
    .addColumn("createdAt", "datetime")
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema
    .createTable("oAuthCodes")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("userChurchId", sql`char(11)`)
    .addColumn("clientId", sql`char(11)`)
    .addColumn("code", sql`varchar(45)`)
    .addColumn("redirectUri", sql`varchar(255)`)
    .addColumn("scopes", sql`varchar(255)`)
    .addColumn("expiresAt", "datetime")
    .addColumn("createdAt", "datetime")
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema
    .createTable("oAuthDeviceCodes")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("deviceCode", sql`varchar(64)`, (col) => col.notNull())
    .addColumn("userCode", sql`varchar(16)`, (col) => col.notNull())
    .addColumn("clientId", sql`varchar(45)`, (col) => col.notNull())
    .addColumn("scopes", sql`varchar(255)`)
    .addColumn("expiresAt", "datetime", (col) => col.notNull())
    .addColumn("pollInterval", "integer", (col) => col.defaultTo(5))
    .addColumn("status", sql`enum('pending','approved','denied','expired')`, (col) => col.defaultTo("pending"))
    .addColumn("approvedByUserId", sql`char(11)`)
    .addColumn("userChurchId", sql`char(11)`)
    .addColumn("churchId", sql`char(11)`)
    .addColumn("createdAt", "datetime", (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`))
    .addUniqueConstraint("oAuthDeviceCodes_deviceCode", ["deviceCode"])
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema
    .createIndex("oAuthDeviceCodes_userCode_status")
    .on("oAuthDeviceCodes")
    .columns(["userCode", "status"])
    .execute();

  await db.schema
    .createIndex("oAuthDeviceCodes_status_expiresAt")
    .on("oAuthDeviceCodes")
    .columns(["status", "expiresAt"])
    .execute();

  await db.schema
    .createTable("oAuthTokens")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("clientId", sql`char(11)`)
    .addColumn("userChurchId", sql`char(11)`)
    .addColumn("accessToken", sql`varchar(1000)`)
    .addColumn("refreshToken", sql`varchar(45)`)
    .addColumn("scopes", sql`varchar(45)`)
    .addColumn("expiresAt", "datetime")
    .addColumn("createdAt", "datetime")
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  // === Misc ===

  await db.schema
    .createTable("clientErrors")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("application", sql`varchar(45)`)
    .addColumn("errorTime", "datetime")
    .addColumn("userId", sql`char(11)`)
    .addColumn("churchId", sql`char(11)`)
    .addColumn("originUrl", sql`varchar(255)`)
    .addColumn("errorType", sql`varchar(45)`)
    .addColumn("message", sql`varchar(255)`)
    .addColumn("details", "text")
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema
    .createTable("settings")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("userId", sql`char(11)`)
    .addColumn("keyName", sql`varchar(255)`)
    .addColumn("value", sql`mediumtext`)
    .addColumn("public", sql`bit(1)`)
    .addUniqueConstraint("settings_id_UNIQUE", ["id"])
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema
    .createIndex("settings_churchId")
    .on("settings")
    .column("churchId")
    .execute();

  await db.schema
    .createTable("usageTrends")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("year", sql`int(11)`)
    .addColumn("week", sql`int(11)`)
    .addColumn("b1Users", sql`int(11)`)
    .addColumn("b1Churches", sql`int(11)`)
    .addColumn("b1Devices", sql`int(11)`)
    .addColumn("chumsUsers", sql`int(11)`)
    .addColumn("chumsChurches", sql`int(11)`)
    .addColumn("lessonsUsers", sql`int(11)`)
    .addColumn("lessonsChurches", sql`int(11)`)
    .addColumn("lessonsDevices", sql`int(11)`)
    .addColumn("freeShowDevices", sql`int(11)`)
    .addUniqueConstraint("usageTrends_year_week", ["year", "week"])
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  // === Seed: Server Admins role + permissions ===

  await sql`INSERT IGNORE INTO roles (id, churchId, name) VALUES ('r1', 0, 'Server Admins')`.execute(db);
  await sql`INSERT IGNORE INTO rolePermissions (id, churchId, roleId, apiName, contentType, action) SELECT 'rp1', 0, id, 'MembershipApi', 'Server', 'Admin' FROM roles WHERE name='Server Admins'`.execute(db);
  await sql`INSERT IGNORE INTO rolePermissions (id, churchId, roleId, apiName, contentType, action) SELECT 'rp2', 0, id, 'MembershipApi', 'Roles', 'Edit' FROM roles WHERE name='Server Admins'`.execute(db);
  await sql`INSERT IGNORE INTO rolePermissions (id, churchId, roleId, apiName, contentType, action) SELECT 'rp3', 0, id, 'MembershipApi', 'Roles', 'View' FROM roles WHERE name='Server Admins'`.execute(db);
  await sql`INSERT IGNORE INTO rolePermissions (id, churchId, roleId, apiName, contentType, action) SELECT 'rp4', 0, id, 'MembershipApi', 'RoleMembers', 'Edit' FROM roles WHERE name='Server Admins'`.execute(db);
  await sql`INSERT IGNORE INTO rolePermissions (id, churchId, roleId, apiName, contentType, action) SELECT 'rp5', 0, id, 'MembershipApi', 'RoleMembers', 'View' FROM roles WHERE name='Server Admins'`.execute(db);
  await sql`INSERT IGNORE INTO rolePermissions (id, churchId, roleId, apiName, contentType, action) SELECT 'rp6', 0, id, 'MembershipApi', 'RolePermissions', 'Edit' FROM roles WHERE name='Server Admins'`.execute(db);
  await sql`INSERT IGNORE INTO rolePermissions (id, churchId, roleId, apiName, contentType, action) SELECT 'rp7', 0, id, 'MembershipApi', 'RolePermissions', 'View' FROM roles WHERE name='Server Admins'`.execute(db);
  await sql`INSERT IGNORE INTO rolePermissions (id, churchId, roleId, apiName, contentType, action) SELECT 'rp8', 0, id, 'MembershipApi', 'Users', 'Edit' FROM roles WHERE name='Server Admins'`.execute(db);
  await sql`INSERT IGNORE INTO rolePermissions (id, churchId, roleId, apiName, contentType, action) SELECT 'rp9', 0, id, 'MembershipApi', 'Users', 'View' FROM roles WHERE name='Server Admins'`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  // Drop in reverse dependency order
  const tables = [
    "usageTrends",
    "settings",
    "clientErrors",
    "oAuthTokens",
    "oAuthDeviceCodes",
    "oAuthCodes",
    "oAuthClients",
    "groupMembers",
    "groups",
    "visibilityPreferences",
    "notes",
    "memberPermissions",
    "people",
    "households",
    "questions",
    "formSubmissions",
    "forms",
    "answers",
    "userChurches",
    "users",
    "rolePermissions",
    "roleMembers",
    "roles",
    "domains",
    "churches",
    "accessLogs",
  ];

  for (const table of tables) {
    await db.schema.dropTable(table).ifExists().execute();
  }
}
