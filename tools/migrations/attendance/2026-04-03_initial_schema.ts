import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {

  // campuses
  await db.schema
    .createTable("campuses")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("name", sql`varchar(255)`)
    .addColumn("address1", sql`varchar(50)`)
    .addColumn("address2", sql`varchar(50)`)
    .addColumn("city", sql`varchar(50)`)
    .addColumn("state", sql`varchar(10)`)
    .addColumn("zip", sql`varchar(10)`)
    .addColumn("removed", sql`bit(1)`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema.createIndex("idx_campuses_churchId").on("campuses").column("churchId").execute();

  // services
  await db.schema
    .createTable("services")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("campusId", sql`char(11)`)
    .addColumn("name", sql`varchar(50)`)
    .addColumn("removed", sql`bit(1)`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema.createIndex("idx_services_churchId").on("services").column("churchId").execute();
  await db.schema.createIndex("idx_services_campusId").on("services").column("campusId").execute();

  // serviceTimes
  await db.schema
    .createTable("serviceTimes")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("serviceId", sql`char(11)`)
    .addColumn("name", sql`varchar(50)`)
    .addColumn("removed", sql`bit(1)`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema.createIndex("idx_serviceTimes_churchId").on("serviceTimes").column("churchId").execute();
  await db.schema.createIndex("idx_serviceTimes_serviceId").on("serviceTimes").column("serviceId").execute();
  await db.schema.createIndex("idx_serviceTimes_church_service_removed").on("serviceTimes").columns(["churchId", "serviceId", "removed"]).execute();

  // sessions
  await db.schema
    .createTable("sessions")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("groupId", sql`char(11)`)
    .addColumn("serviceTimeId", sql`char(11)`)
    .addColumn("sessionDate", sql`datetime`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema.createIndex("idx_sessions_churchId").on("sessions").column("churchId").execute();
  await db.schema.createIndex("idx_sessions_groupId").on("sessions").column("groupId").execute();
  await db.schema.createIndex("idx_sessions_serviceTimeId").on("sessions").column("serviceTimeId").execute();
  await db.schema.createIndex("idx_sessions_church_date").on("sessions").columns(["churchId", "sessionDate"]).execute();
  await db.schema.createIndex("idx_sessions_church_group_serviceTime").on("sessions").columns(["churchId", "groupId", "serviceTimeId"]).execute();

  // visits
  await db.schema
    .createTable("visits")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("personId", sql`char(11)`)
    .addColumn("serviceId", sql`char(11)`)
    .addColumn("groupId", sql`char(11)`)
    .addColumn("visitDate", sql`datetime`)
    .addColumn("checkinTime", sql`datetime`)
    .addColumn("addedBy", sql`char(11)`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema.createIndex("idx_visits_churchId").on("visits").column("churchId").execute();
  await db.schema.createIndex("idx_visits_personId").on("visits").column("personId").execute();
  await db.schema.createIndex("idx_visits_serviceId").on("visits").column("serviceId").execute();
  await db.schema.createIndex("idx_visits_groupId").on("visits").column("groupId").execute();
  await db.schema.createIndex("idx_visits_church_date").on("visits").columns(["churchId", "visitDate"]).execute();
  await db.schema.createIndex("idx_visits_church_person").on("visits").columns(["churchId", "personId"]).execute();

  // visitSessions
  await db.schema
    .createTable("visitSessions")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("visitId", sql`char(11)`)
    .addColumn("sessionId", sql`char(11)`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema.createIndex("idx_visitSessions_churchId").on("visitSessions").column("churchId").execute();
  await db.schema.createIndex("idx_visitSessions_visitId").on("visitSessions").column("visitId").execute();
  await db.schema.createIndex("idx_visitSessions_sessionId").on("visitSessions").column("sessionId").execute();

  // groupServiceTimes
  await db.schema
    .createTable("groupServiceTimes")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("groupId", sql`char(11)`)
    .addColumn("serviceTimeId", sql`char(11)`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema.createIndex("idx_groupServiceTimes_churchId").on("groupServiceTimes").column("churchId").execute();
  await db.schema.createIndex("idx_groupServiceTimes_groupId").on("groupServiceTimes").column("groupId").execute();
  await db.schema.createIndex("idx_groupServiceTimes_serviceTimeId").on("groupServiceTimes").column("serviceTimeId").execute();

  // settings
  await db.schema
    .createTable("settings")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("keyName", sql`varchar(255)`)
    .addColumn("value", sql`varchar(255)`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema.createIndex("idx_settings_churchId").on("settings").column("churchId").execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  // Drop tables in reverse order
  const tables = [
    "settings",
    "groupServiceTimes",
    "visitSessions",
    "visits",
    "sessions",
    "serviceTimes",
    "services",
    "campuses",
  ];

  for (const table of tables) {
    await db.schema.dropTable(table).ifExists().execute();
  }
}
