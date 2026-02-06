import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  // === Tasks ===

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

  await db.schema
    .createTable("tasks")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("taskNumber", sql`int(11)`)
    .addColumn("taskType", sql`varchar(45)`)
    .addColumn("dateCreated", "datetime")
    .addColumn("dateClosed", "datetime")
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
    .addColumn("data", "text")
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema
    .createIndex("tasks_idx_church_status")
    .on("tasks")
    .columns(["churchId", "status"])
    .execute();

  await db.schema
    .createIndex("tasks_idx_automation")
    .on("tasks")
    .columns(["churchId", "automationId"])
    .execute();

  await db.schema
    .createIndex("tasks_idx_assigned")
    .on("tasks")
    .columns(["churchId", "assignedToType", "assignedToId"])
    .execute();

  await db.schema
    .createIndex("tasks_idx_created")
    .on("tasks")
    .columns(["churchId", "createdByType", "createdById"])
    .execute();

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

  // === Scheduling ===

  await db.schema
    .createTable("assignments")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("positionId", sql`char(11)`)
    .addColumn("personId", sql`char(11)`)
    .addColumn("status", sql`varchar(45)`)
    .addColumn("notified", "datetime")
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema
    .createIndex("assignments_idx_church_person")
    .on("assignments")
    .columns(["churchId", "personId"])
    .execute();

  await db.schema
    .createIndex("assignments_idx_position")
    .on("assignments")
    .column("positionId")
    .execute();

  await db.schema
    .createTable("blockoutDates")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("personId", sql`char(11)`)
    .addColumn("startDate", "date")
    .addColumn("endDate", "date")
    .modifyEnd(sql`ENGINE=InnoDB`)
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
    .addColumn("updatedAt", "datetime")
    .addColumn("contents", "text")
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema
    .createIndex("notes_churchId")
    .on("notes")
    .column("churchId")
    .execute();

  await db.schema
    .createTable("plans")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("ministryId", sql`char(11)`)
    .addColumn("planTypeId", sql`char(11)`)
    .addColumn("name", sql`varchar(45)`)
    .addColumn("serviceDate", "date")
    .addColumn("notes", sql`mediumtext`)
    .addColumn("serviceOrder", sql`bit(1)`)
    .addColumn("contentType", sql`varchar(50)`)
    .addColumn("contentId", sql`char(11)`)
    .addColumn("providerId", sql`varchar(50)`)
    .addColumn("providerPlanId", sql`varchar(100)`)
    .addColumn("providerPlanName", sql`varchar(255)`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

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
    .addColumn("label", sql`varchar(45)`)
    .addColumn("description", sql`varchar(1000)`)
    .addColumn("seconds", sql`int(11)`)
    .addColumn("link", sql`varchar(1000)`)
    .addColumn("providerId", sql`varchar(50)`)
    .addColumn("providerPath", sql`varchar(500)`)
    .addColumn("providerContentPath", sql`varchar(50)`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema
    .createIndex("planItems_idx_church_plan")
    .on("planItems")
    .columns(["churchId", "planId"])
    .execute();

  await db.schema
    .createIndex("planItems_idx_parent")
    .on("planItems")
    .column("parentId")
    .execute();

  await db.schema
    .createTable("planTypes")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("ministryId", sql`char(11)`)
    .addColumn("name", sql`varchar(255)`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema
    .createTable("positions")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("planId", sql`char(11)`)
    .addColumn("categoryName", sql`varchar(45)`)
    .addColumn("name", sql`varchar(45)`)
    .addColumn("count", sql`int(11)`)
    .addColumn("groupId", sql`char(11)`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema
    .createIndex("positions_idx_church_plan")
    .on("positions")
    .columns(["churchId", "planId"])
    .execute();

  await db.schema
    .createIndex("positions_idx_group")
    .on("positions")
    .column("groupId")
    .execute();

  await db.schema
    .createTable("times")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("planId", sql`char(11)`)
    .addColumn("displayName", sql`varchar(45)`)
    .addColumn("startTime", "datetime")
    .addColumn("endTime", "datetime")
    .addColumn("teams", sql`varchar(1000)`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema
    .createTable("contentProviderAuths")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("ministryId", sql`char(11)`)
    .addColumn("providerId", sql`varchar(50)`)
    .addColumn("accessToken", "text")
    .addColumn("refreshToken", "text")
    .addColumn("tokenType", sql`varchar(50)`)
    .addColumn("expiresAt", "datetime")
    .addColumn("scope", sql`varchar(255)`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema
    .createIndex("contentProviderAuths_idx_ministry_provider")
    .on("contentProviderAuths")
    .columns(["churchId", "ministryId", "providerId"])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  const tables = [
    "contentProviderAuths",
    "times",
    "positions",
    "planTypes",
    "planItems",
    "plans",
    "notes",
    "blockoutDates",
    "assignments",
    "conjunctions",
    "conditions",
    "tasks",
    "automations",
    "actions",
  ];

  for (const table of tables) {
    await db.schema.dropTable(table).ifExists().execute();
  }
}
