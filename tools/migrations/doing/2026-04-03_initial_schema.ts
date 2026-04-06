import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  // actions
  await db.schema
    .createTable("actions")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("automationId", sql`char(11)`)
    .addColumn("actionType", sql`varchar(45)`)
    .addColumn("actionData", sql`mediumtext`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  // assignments
  await db.schema
    .createTable("assignments")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("positionId", sql`char(11)`)
    .addColumn("personId", sql`char(11)`)
    .addColumn("status", sql`varchar(45)`)
    .addColumn("notified", sql`datetime`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema.createIndex("idx_assignments_churchId_personId").on("assignments").columns(["churchId", "personId"]).execute();
  await db.schema.createIndex("idx_assignments_positionId").on("assignments").columns(["positionId"]).execute();

  // automations
  await db.schema
    .createTable("automations")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("title", sql`varchar(45)`)
    .addColumn("recurs", sql`varchar(45)`)
    .addColumn("active", sql`bit(1)`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  // blockoutDates
  await db.schema
    .createTable("blockoutDates")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("personId", sql`char(11)`)
    .addColumn("startDate", sql`date`)
    .addColumn("endDate", sql`date`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  // conditions
  await db.schema
    .createTable("conditions")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("conjunctionId", sql`char(11)`)
    .addColumn("field", sql`varchar(45)`)
    .addColumn("fieldData", sql`mediumtext`)
    .addColumn("operator", sql`varchar(45)`)
    .addColumn("value", sql`varchar(45)`)
    .addColumn("label", sql`varchar(255)`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  // conjunctions
  await db.schema
    .createTable("conjunctions")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("automationId", sql`char(11)`)
    .addColumn("parentId", sql`char(11)`)
    .addColumn("groupType", sql`varchar(45)`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  // contentProviderAuths
  await db.schema
    .createTable("contentProviderAuths")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("ministryId", sql`char(11)`)
    .addColumn("providerId", sql`varchar(50)`)
    .addColumn("accessToken", sql`text`)
    .addColumn("refreshToken", sql`text`)
    .addColumn("tokenType", sql`varchar(50)`)
    .addColumn("expiresAt", sql`datetime`)
    .addColumn("scope", sql`varchar(255)`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema.createIndex("idx_contentProviderAuths_churchId_ministryId_providerId").on("contentProviderAuths").columns(["churchId", "ministryId", "providerId"]).execute();

  // plans
  await db.schema
    .createTable("plans")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("ministryId", sql`char(11)`)
    .addColumn("planTypeId", sql`char(11)`)
    .addColumn("name", sql`varchar(45)`)
    .addColumn("serviceDate", sql`date`)
    .addColumn("notes", sql`mediumtext`)
    .addColumn("serviceOrder", sql`bit(1)`)
    .addColumn("contentType", sql`varchar(50)`)
    .addColumn("contentId", sql`char(11)`)
    .addColumn("providerId", sql`varchar(50)`)
    .addColumn("providerPlanId", sql`varchar(100)`)
    .addColumn("providerPlanName", sql`varchar(255)`)
    .addColumn("signupDeadlineHours", sql`int`)
    .addColumn("showVolunteerNames", sql`bit(1)`, (col) => col.defaultTo(sql`b'1'`))
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  // planItems
  await db.schema
    .createTable("planItems")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("planId", sql`char(11)`)
    .addColumn("parentId", sql`char(11)`)
    .addColumn("sort", sql`float`)
    .addColumn("itemType", sql`varchar(45)`)
    .addColumn("relatedId", sql`char(11)`)
    .addColumn("label", sql`varchar(100)`)
    .addColumn("description", sql`varchar(1000)`)
    .addColumn("seconds", sql`int`)
    .addColumn("link", sql`varchar(1000)`)
    .addColumn("providerId", sql`varchar(50)`)
    .addColumn("providerPath", sql`varchar(500)`)
    .addColumn("providerContentPath", sql`varchar(50)`)
    .addColumn("thumbnailUrl", sql`varchar(1024)`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema.createIndex("idx_planItems_churchId_planId").on("planItems").columns(["churchId", "planId"]).execute();
  await db.schema.createIndex("idx_planItems_parentId").on("planItems").columns(["parentId"]).execute();

  // planTypes
  await db.schema
    .createTable("planTypes")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("ministryId", sql`char(11)`)
    .addColumn("name", sql`varchar(255)`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  // positions
  await db.schema
    .createTable("positions")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("planId", sql`char(11)`)
    .addColumn("categoryName", sql`varchar(45)`)
    .addColumn("name", sql`varchar(45)`)
    .addColumn("count", sql`int`)
    .addColumn("groupId", sql`char(11)`)
    .addColumn("allowSelfSignup", sql`bit(1)`, (col) => col.defaultTo(sql`b'0'`))
    .addColumn("description", sql`text`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema.createIndex("idx_positions_churchId_planId").on("positions").columns(["churchId", "planId"]).execute();
  await db.schema.createIndex("idx_positions_groupId").on("positions").columns(["groupId"]).execute();

  // tasks
  await db.schema
    .createTable("tasks")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("taskNumber", sql`int`)
    .addColumn("taskType", sql`varchar(45)`)
    .addColumn("dateCreated", sql`datetime`)
    .addColumn("dateClosed", sql`datetime`)
    .addColumn("associatedWithType", sql`varchar(45)`)
    .addColumn("associatedWithId", sql`char(11)`)
    .addColumn("associatedWithLabel", sql`varchar(45)`)
    .addColumn("createdByType", sql`varchar(45)`)
    .addColumn("createdById", sql`char(11)`)
    .addColumn("createdByLabel", sql`varchar(45)`)
    .addColumn("assignedToType", sql`varchar(45)`)
    .addColumn("assignedToId", sql`char(11)`)
    .addColumn("assignedToLabel", sql`varchar(45)`)
    .addColumn("title", sql`varchar(255)`)
    .addColumn("status", sql`varchar(45)`)
    .addColumn("automationId", sql`char(11)`)
    .addColumn("conversationId", sql`char(11)`)
    .addColumn("data", sql`text`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema.createIndex("idx_tasks_churchId_status").on("tasks").columns(["churchId", "status"]).execute();
  await db.schema.createIndex("idx_tasks_churchId_automationId").on("tasks").columns(["churchId", "automationId"]).execute();
  await db.schema.createIndex("idx_tasks_churchId_assignedToType_assignedToId").on("tasks").columns(["churchId", "assignedToType", "assignedToId"]).execute();
  await db.schema.createIndex("idx_tasks_churchId_createdByType_createdById").on("tasks").columns(["churchId", "createdByType", "createdById"]).execute();

  // times
  await db.schema
    .createTable("times")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("planId", sql`char(11)`)
    .addColumn("displayName", sql`varchar(45)`)
    .addColumn("startTime", sql`datetime`)
    .addColumn("endTime", sql`datetime`)
    .addColumn("teams", sql`varchar(1000)`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("times").ifExists().execute();
  await db.schema.dropTable("tasks").ifExists().execute();
  await db.schema.dropTable("positions").ifExists().execute();
  await db.schema.dropTable("planTypes").ifExists().execute();
  await db.schema.dropTable("planItems").ifExists().execute();
  await db.schema.dropTable("plans").ifExists().execute();
  await db.schema.dropTable("contentProviderAuths").ifExists().execute();
  await db.schema.dropTable("conjunctions").ifExists().execute();
  await db.schema.dropTable("conditions").ifExists().execute();
  await db.schema.dropTable("blockoutDates").ifExists().execute();
  await db.schema.dropTable("automations").ifExists().execute();
  await db.schema.dropTable("assignments").ifExists().execute();
  await db.schema.dropTable("actions").ifExists().execute();
}
