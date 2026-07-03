import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("registrationTypes")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`, (col) => col.notNull())
    .addColumn("eventId", sql`char(11)`, (col) => col.notNull())
    .addColumn("name", sql`varchar(255)`)
    .addColumn("description", sql`varchar(1000)`)
    .addColumn("price", sql`decimal(10,2)`)
    .addColumn("capacity", sql`int`)
    .addColumn("minAgeYears", sql`int`)
    .addColumn("maxAgeYears", sql`int`)
    .addColumn("formId", sql`char(11)`)
    .addColumn("sort", sql`int`)
    .addColumn("active", sql`bit(1)`, (col) => col.notNull().defaultTo(sql`b'1'`))
    .modifyEnd(sql`ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
    .execute();
  await db.schema.createIndex("idx_registrationTypes_churchId_eventId").on("registrationTypes").columns(["churchId", "eventId"]).execute();

  await db.schema.alterTable("registrationMembers").addColumn("registrationTypeId", sql`char(11)`).execute();

  await db.schema
    .createTable("registrationSelections")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`, (col) => col.notNull())
    .addColumn("eventId", sql`char(11)`, (col) => col.notNull())
    .addColumn("name", sql`varchar(255)`)
    .addColumn("description", sql`varchar(1000)`)
    .addColumn("price", sql`decimal(10,2)`)
    .addColumn("capacity", sql`int`)
    .addColumn("maxQuantity", sql`int`)
    .addColumn("sort", sql`int`)
    .addColumn("active", sql`bit(1)`, (col) => col.notNull().defaultTo(sql`b'1'`))
    .modifyEnd(sql`ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
    .execute();
  await db.schema.createIndex("idx_registrationSelections_churchId_eventId").on("registrationSelections").columns(["churchId", "eventId"]).execute();

  await db.schema
    .createTable("registrationSelectionChoices")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`, (col) => col.notNull())
    .addColumn("registrationId", sql`char(11)`, (col) => col.notNull())
    .addColumn("registrationMemberId", sql`char(11)`)
    .addColumn("selectionId", sql`char(11)`, (col) => col.notNull())
    .addColumn("quantity", sql`int`, (col) => col.notNull().defaultTo(1))
    .modifyEnd(sql`ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
    .execute();
  await db.schema.createIndex("idx_registrationSelectionChoices_registrationId").on("registrationSelectionChoices").columns(["churchId", "registrationId"]).execute();
  await db.schema.createIndex("idx_registrationSelectionChoices_selectionId").on("registrationSelectionChoices").columns(["selectionId"]).execute();

  await db.schema
    .createTable("registrationPayments")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`, (col) => col.notNull())
    .addColumn("registrationId", sql`char(11)`, (col) => col.notNull())
    .addColumn("gatewayId", sql`char(11)`)
    .addColumn("provider", sql`varchar(30)`)
    .addColumn("transactionId", sql`varchar(100)`)
    .addColumn("method", sql`varchar(30)`)
    .addColumn("amount", sql`decimal(10,2)`)
    .addColumn("currency", sql`varchar(10)`)
    .addColumn("kind", sql`varchar(20)`)
    .addColumn("status", sql`varchar(20)`)
    .addColumn("personId", sql`char(11)`)
    .addColumn("createdDate", sql`datetime`)
    .modifyEnd(sql`ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
    .execute();
  await db.schema.createIndex("idx_registrationPayments_registrationId").on("registrationPayments").columns(["churchId", "registrationId"]).execute();

  await db.schema
    .createTable("registrationCoupons")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`, (col) => col.notNull())
    .addColumn("eventId", sql`char(11)`, (col) => col.notNull())
    .addColumn("code", sql`varchar(50)`, (col) => col.notNull())
    .addColumn("discountType", sql`varchar(10)`)
    .addColumn("value", sql`decimal(10,2)`)
    .addColumn("startDate", sql`datetime`)
    .addColumn("endDate", sql`datetime`)
    .addColumn("minMembers", sql`int`)
    .addColumn("maxUses", sql`int`)
    .addColumn("active", sql`bit(1)`, (col) => col.notNull().defaultTo(sql`b'1'`))
    .modifyEnd(sql`ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
    .execute();
  await db.schema.createIndex("idx_registrationCoupons_churchId_eventId_code").on("registrationCoupons").columns(["churchId", "eventId", "code"]).unique().execute();

  await db.schema
    .alterTable("registrations")
    .addColumn("totalAmount", sql`decimal(10,2)`)
    .addColumn("amountPaid", sql`decimal(10,2)`, (col) => col.notNull().defaultTo(0))
    .addColumn("couponId", sql`char(11)`)
    .addColumn("waitlistNotifiedDate", sql`datetime`)
    .execute();

  await db.schema
    .createTable("eventRsvps")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("eventId", sql`char(11)`)
    .addColumn("personId", sql`char(11)`)
    .addColumn("occurrenceStart", sql`datetime`)
    .addColumn("response", sql`varchar(10)`)
    .addColumn("timeAdded", sql`datetime`)
    .addColumn("timeUpdated", sql`datetime`)
    .modifyEnd(sql`ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
    .execute();
  await db.schema.createIndex("idx_eventRsvps_unique").on("eventRsvps").columns(["churchId", "eventId", "personId", "occurrenceStart"]).unique().execute();
  await db.schema.createIndex("idx_eventRsvps_churchId_eventId").on("eventRsvps").columns(["churchId", "eventId"]).execute();

  await db.schema
    .alterTable("events")
    .addColumn("waitlistEnabled", sql`bit(1)`, (col) => col.notNull().defaultTo(sql`b'0'`))
    .addColumn("rsvpDisabled", sql`bit(1)`, (col) => col.defaultTo(sql`b'0'`))
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("events").dropColumn("waitlistEnabled").dropColumn("rsvpDisabled").execute();
  await db.schema.dropTable("eventRsvps").ifExists().execute();
  await db.schema
    .alterTable("registrations")
    .dropColumn("totalAmount")
    .dropColumn("amountPaid")
    .dropColumn("couponId")
    .dropColumn("waitlistNotifiedDate")
    .execute();
  await db.schema.dropTable("registrationCoupons").ifExists().execute();
  await db.schema.dropTable("registrationPayments").ifExists().execute();
  await db.schema.dropTable("registrationSelectionChoices").ifExists().execute();
  await db.schema.dropTable("registrationSelections").ifExists().execute();
  await db.schema.alterTable("registrationMembers").dropColumn("registrationTypeId").execute();
  await db.schema.dropTable("registrationTypes").ifExists().execute();
}
