import { type Kysely, sql } from "kysely";

// Roadmap 2.7/2.8: rooms and resources as first-class entities, event bookings
// (which double as the approval records), facility blockouts, event templates,
// and an approval status on events for the non-staff event-request flow.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("rooms")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("name", sql`varchar(100)`)
    .addColumn("description", sql`varchar(500)`)
    .addColumn("capacity", sql`int`)
    .addColumn("approvalGroupId", sql`char(11)`)
    .modifyEnd(sql`ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
    .execute();
  await db.schema.createIndex("idx_rooms_churchId").on("rooms").columns(["churchId"]).execute();

  await db.schema
    .createTable("resources")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("name", sql`varchar(100)`)
    .addColumn("description", sql`varchar(500)`)
    .addColumn("quantity", sql`int`)
    .addColumn("approvalGroupId", sql`char(11)`)
    .modifyEnd(sql`ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
    .execute();
  await db.schema.createIndex("idx_resources_churchId").on("resources").columns(["churchId"]).execute();

  await db.schema
    .createTable("eventBookings")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("eventId", sql`char(11)`)
    .addColumn("roomId", sql`char(11)`)
    .addColumn("resourceId", sql`char(11)`)
    .addColumn("quantity", sql`int`)
    .addColumn("status", sql`varchar(20)`)
    .addColumn("requestedBy", sql`char(11)`)
    .addColumn("requestedDate", sql`datetime`)
    .addColumn("resolvedBy", sql`char(11)`)
    .addColumn("resolvedDate", sql`datetime`)
    .addColumn("notifiedDate", sql`datetime`)
    .modifyEnd(sql`ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
    .execute();
  await db.schema.createIndex("idx_eventBookings_churchId_eventId").on("eventBookings").columns(["churchId", "eventId"]).execute();
  await db.schema.createIndex("idx_eventBookings_churchId_roomId").on("eventBookings").columns(["churchId", "roomId"]).execute();
  await db.schema.createIndex("idx_eventBookings_churchId_resourceId").on("eventBookings").columns(["churchId", "resourceId"]).execute();
  await db.schema.createIndex("idx_eventBookings_status").on("eventBookings").columns(["status"]).execute();

  await db.schema
    .createTable("calendarBlockouts")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("roomId", sql`char(11)`)
    .addColumn("resourceId", sql`char(11)`)
    .addColumn("startTime", sql`datetime`)
    .addColumn("endTime", sql`datetime`)
    .addColumn("reason", sql`varchar(255)`)
    .modifyEnd(sql`ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
    .execute();
  await db.schema.createIndex("idx_calendarBlockouts_churchId").on("calendarBlockouts").columns(["churchId"]).execute();

  await db.schema
    .createTable("eventTemplates")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("name", sql`varchar(100)`)
    .addColumn("title", sql`varchar(255)`)
    .addColumn("description", sql`mediumtext`)
    .addColumn("durationMinutes", sql`int`)
    .addColumn("visibility", sql`varchar(45)`)
    .addColumn("roomIds", sql`varchar(255)`)
    .addColumn("resourcesJson", sql`varchar(1000)`)
    .modifyEnd(sql`ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
    .execute();
  await db.schema.createIndex("idx_eventTemplates_churchId").on("eventTemplates").columns(["churchId"]).execute();

  await db.schema
    .alterTable("events")
    .addColumn("approvalStatus", sql`varchar(20)`)
    .addColumn("requestedBy", sql`char(11)`)
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("events").dropColumn("approvalStatus").dropColumn("requestedBy").execute();
  await db.schema.dropTable("eventTemplates").ifExists().execute();
  await db.schema.dropTable("calendarBlockouts").ifExists().execute();
  await db.schema.dropTable("eventBookings").ifExists().execute();
  await db.schema.dropTable("resources").ifExists().execute();
  await db.schema.dropTable("rooms").ifExists().execute();
}
