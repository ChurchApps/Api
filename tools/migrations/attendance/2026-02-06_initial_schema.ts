import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
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
    .addUniqueConstraint("campuses_id_UNIQUE", ["id"])
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema
    .createIndex("campuses_churchId")
    .on("campuses")
    .column("churchId")
    .execute();

  await db.schema
    .createTable("services")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("campusId", sql`char(11)`)
    .addColumn("name", sql`varchar(50)`)
    .addColumn("removed", sql`bit(1)`)
    .addUniqueConstraint("services_id_UNIQUE", ["id"])
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema
    .createIndex("services_churchId")
    .on("services")
    .column("churchId")
    .execute();

  await db.schema
    .createIndex("services_campusId")
    .on("services")
    .column("campusId")
    .execute();

  await db.schema
    .createTable("serviceTimes")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("serviceId", sql`char(11)`)
    .addColumn("name", sql`varchar(50)`)
    .addColumn("removed", sql`bit(1)`)
    .addUniqueConstraint("serviceTimes_id_UNIQUE", ["id"])
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema
    .createIndex("serviceTimes_churchId")
    .on("serviceTimes")
    .column("churchId")
    .execute();

  await db.schema
    .createIndex("serviceTimes_serviceId")
    .on("serviceTimes")
    .column("serviceId")
    .execute();

  await db.schema
    .createIndex("serviceTimes_idx_church_service_removed")
    .on("serviceTimes")
    .columns(["churchId", "serviceId", "removed"])
    .execute();

  await db.schema
    .createTable("groupServiceTimes")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("groupId", sql`char(11)`)
    .addColumn("serviceTimeId", sql`char(11)`)
    .addUniqueConstraint("groupServiceTimes_id_UNIQUE", ["id"])
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema
    .createIndex("groupServiceTimes_churchId")
    .on("groupServiceTimes")
    .column("churchId")
    .execute();

  await db.schema
    .createIndex("groupServiceTimes_groupId")
    .on("groupServiceTimes")
    .column("groupId")
    .execute();

  await db.schema
    .createIndex("groupServiceTimes_serviceTimeId")
    .on("groupServiceTimes")
    .column("serviceTimeId")
    .execute();

  await db.schema
    .createTable("sessions")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("groupId", sql`char(11)`)
    .addColumn("serviceTimeId", sql`char(11)`)
    .addColumn("sessionDate", "datetime")
    .addUniqueConstraint("sessions_id_UNIQUE", ["id"])
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema
    .createIndex("sessions_churchId")
    .on("sessions")
    .column("churchId")
    .execute();

  await db.schema
    .createIndex("sessions_groupId")
    .on("sessions")
    .column("groupId")
    .execute();

  await db.schema
    .createIndex("sessions_serviceTimeId")
    .on("sessions")
    .column("serviceTimeId")
    .execute();

  await db.schema
    .createIndex("sessions_idx_church_session_date")
    .on("sessions")
    .columns(["churchId", "sessionDate"])
    .execute();

  await db.schema
    .createIndex("sessions_idx_church_group_service")
    .on("sessions")
    .columns(["churchId", "groupId", "serviceTimeId"])
    .execute();

  await db.schema
    .createTable("settings")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("keyName", sql`varchar(255)`)
    .addColumn("value", sql`varchar(255)`)
    .addUniqueConstraint("settings_id_UNIQUE", ["id"])
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema
    .createIndex("settings_churchId")
    .on("settings")
    .column("churchId")
    .execute();

  await db.schema
    .createTable("visits")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("personId", sql`char(11)`)
    .addColumn("serviceId", sql`char(11)`)
    .addColumn("groupId", sql`char(11)`)
    .addColumn("visitDate", "datetime")
    .addColumn("checkinTime", "datetime")
    .addColumn("addedBy", sql`char(11)`)
    .addUniqueConstraint("visits_id_UNIQUE", ["id"])
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema
    .createIndex("visits_churchId")
    .on("visits")
    .column("churchId")
    .execute();

  await db.schema
    .createIndex("visits_personId")
    .on("visits")
    .column("personId")
    .execute();

  await db.schema
    .createIndex("visits_serviceId")
    .on("visits")
    .column("serviceId")
    .execute();

  await db.schema
    .createIndex("visits_groupId")
    .on("visits")
    .column("groupId")
    .execute();

  await db.schema
    .createIndex("visits_idx_church_visit_date")
    .on("visits")
    .columns(["churchId", "visitDate"])
    .execute();

  await db.schema
    .createIndex("visits_idx_church_person")
    .on("visits")
    .columns(["churchId", "personId"])
    .execute();

  await db.schema
    .createTable("visitSessions")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("visitId", sql`char(11)`)
    .addColumn("sessionId", sql`char(11)`)
    .addUniqueConstraint("visitSessions_id_UNIQUE", ["id"])
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema
    .createIndex("visitSessions_churchId")
    .on("visitSessions")
    .column("churchId")
    .execute();

  await db.schema
    .createIndex("visitSessions_visitId")
    .on("visitSessions")
    .column("visitId")
    .execute();

  await db.schema
    .createIndex("visitSessions_sessionId")
    .on("visitSessions")
    .column("sessionId")
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  const tables = [
    "visitSessions",
    "visits",
    "settings",
    "sessions",
    "groupServiceTimes",
    "serviceTimes",
    "services",
    "campuses",
  ];

  for (const table of tables) {
    await db.schema.dropTable(table).ifExists().execute();
  }
}
