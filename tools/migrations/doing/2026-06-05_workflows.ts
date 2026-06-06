import { type Kysely, sql } from "kysely";

// Planning-Center-style Workflows / Cards. A Task is a "card" when it has a workflowId.

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("workflowCategories")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("name", sql`varchar(255)`)
    .addColumn("sort", sql`int`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();
  await db.schema.createIndex("idx_workflowCategories_churchId").on("workflowCategories").columns(["churchId"]).execute();

  await db.schema
    .createTable("workflows")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("name", sql`varchar(255)`)
    .addColumn("categoryId", sql`char(11)`)
    .addColumn("active", sql`bit(1)`, (col) => col.defaultTo(sql`b'1'`))
    .addColumn("sort", sql`int`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();
  await db.schema.createIndex("idx_workflows_churchId").on("workflows").columns(["churchId"]).execute();

  await db.schema
    .createTable("workflowSteps")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("workflowId", sql`char(11)`)
    .addColumn("name", sql`varchar(255)`)
    .addColumn("sort", sql`int`)
    .addColumn("defaultAssignToType", sql`varchar(45)`)
    .addColumn("defaultAssignToId", sql`char(11)`)
    .addColumn("defaultAssignToLabel", sql`varchar(255)`)
    .addColumn("expectedResponseDays", sql`int`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();
  await db.schema.createIndex("idx_workflowSteps_churchId_workflowId").on("workflowSteps").columns(["churchId", "workflowId"]).execute();

  await db.schema
    .createTable("formWorkflowTriggers")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("formId", sql`char(11)`)
    .addColumn("workflowId", sql`char(11)`)
    .addColumn("active", sql`bit(1)`, (col) => col.defaultTo(sql`b'1'`))
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();
  await db.schema.createIndex("idx_formWorkflowTriggers_churchId_formId").on("formWorkflowTriggers").columns(["churchId", "formId"]).execute();

  await db.schema
    .createTable("workflowStepRoutes")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("workflowId", sql`char(11)`)
    .addColumn("stepId", sql`char(11)`)
    .addColumn("sort", sql`int`)
    .addColumn("trigger", sql`varchar(20)`)
    .addColumn("kind", sql`varchar(20)`)
    .addColumn("label", sql`varchar(255)`)
    .addColumn("targetStepId", sql`char(11)`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();
  await db.schema.createIndex("idx_workflowStepRoutes_churchId_stepId").on("workflowStepRoutes").columns(["churchId", "stepId"]).execute();
  await db.schema.createIndex("idx_workflowStepRoutes_churchId_workflowId").on("workflowStepRoutes").columns(["churchId", "workflowId"]).execute();

  await db.schema.alterTable("tasks").addColumn("workflowId", sql`char(11)`).execute();
  await db.schema.alterTable("tasks").addColumn("stepId", sql`char(11)`).execute();
  await db.schema.alterTable("tasks").addColumn("dueDate", sql`datetime`).execute();
  await db.schema.alterTable("tasks").addColumn("snoozedUntil", sql`datetime`).execute();
  await db.schema.alterTable("tasks").addColumn("sort", sql`int`).execute();
  await db.schema.alterTable("tasks").addColumn("pinnedAssignment", sql`bit(1)`, (col) => col.defaultTo(sql`b'0'`)).execute();
  await db.schema.createIndex("idx_tasks_churchId_workflowId_stepId").on("tasks").columns(["churchId", "workflowId", "stepId"]).execute();

  await db.schema.alterTable("conjunctions").addColumn("stepRouteId", sql`char(11)`).execute();
  await db.schema.createIndex("idx_conjunctions_stepRouteId").on("conjunctions").columns(["stepRouteId"]).execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex("idx_conjunctions_stepRouteId").on("conjunctions").ifExists().execute();
  await db.schema.alterTable("conjunctions").dropColumn("stepRouteId").execute();

  await db.schema.dropIndex("idx_tasks_churchId_workflowId_stepId").on("tasks").ifExists().execute();
  await db.schema.alterTable("tasks").dropColumn("pinnedAssignment").execute();
  await db.schema.alterTable("tasks").dropColumn("sort").execute();
  await db.schema.alterTable("tasks").dropColumn("snoozedUntil").execute();
  await db.schema.alterTable("tasks").dropColumn("dueDate").execute();
  await db.schema.alterTable("tasks").dropColumn("stepId").execute();
  await db.schema.alterTable("tasks").dropColumn("workflowId").execute();

  await db.schema.dropIndex("idx_workflowStepRoutes_churchId_workflowId").on("workflowStepRoutes").ifExists().execute();
  await db.schema.dropIndex("idx_workflowStepRoutes_churchId_stepId").on("workflowStepRoutes").ifExists().execute();
  await db.schema.dropTable("workflowStepRoutes").ifExists().execute();

  await db.schema.dropTable("formWorkflowTriggers").ifExists().execute();
  await db.schema.dropTable("workflowSteps").ifExists().execute();
  await db.schema.dropTable("workflows").ifExists().execute();
  await db.schema.dropTable("workflowCategories").ifExists().execute();
}
