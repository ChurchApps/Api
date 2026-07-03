import { type Kysely, sql } from "kysely";

// Must run AFTER 2026-06-06_workflowTriggers (which creates the table).

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    INSERT INTO workflowTriggers (id, churchId, name, eventType, workflowId, stepId, conditions, oncePerSubject, active)
    SELECT id, churchId, CONCAT('Form submission (', formId, ')'), 'form.submission.created', workflowId, NULL,
      CONCAT('{"type":"group","conjunction":"AND","children":[{"type":"condition","field":"formSubmission.formId","operator":"=","value":"', formId, '"}]}'),
      b'0', active
    FROM formWorkflowTriggers
  `.execute(db);

  await db.schema.dropTable("formWorkflowTriggers").ifExists().execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  // Row data not reconstructed from conditions JSON.
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

  await sql`DELETE FROM workflowTriggers WHERE eventType = 'form.submission.created'`.execute(db);
}
