import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("funds")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("name", sql`varchar(50)`)
    .addColumn("removed", sql`bit(1)`)
    .addColumn("productId", sql`varchar(50)`)
    .addColumn("taxDeductible", sql`bit(1)`)
    .addUniqueConstraint("funds_id_UNIQUE", ["id"])
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema
    .createIndex("funds_idx_church_removed")
    .on("funds")
    .columns(["churchId", "removed"])
    .execute();

  await db.schema
    .createTable("donations")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("batchId", sql`char(11)`)
    .addColumn("personId", sql`char(11)`)
    .addColumn("donationDate", "datetime")
    .addColumn("amount", "double precision")
    .addColumn("method", sql`varchar(50)`)
    .addColumn("methodDetails", sql`varchar(255)`)
    .addColumn("notes", "text")
    .addColumn("entryTime", "datetime")
    .addColumn("status", sql`varchar(20)`, (col) => col.defaultTo("complete"))
    .addColumn("transactionId", sql`varchar(255)`)
    .addUniqueConstraint("donations_id_UNIQUE", ["id"])
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema
    .createIndex("donations_idx_church_donation_date")
    .on("donations")
    .columns(["churchId", "donationDate"])
    .execute();

  await db.schema
    .createIndex("donations_idx_church_person")
    .on("donations")
    .columns(["churchId", "personId"])
    .execute();

  await db.schema
    .createIndex("donations_idx_church_batch")
    .on("donations")
    .columns(["churchId", "batchId"])
    .execute();

  await db.schema
    .createIndex("donations_idx_church_method")
    .on("donations")
    .columns(["churchId", "method", "methodDetails"])
    .execute();

  await db.schema
    .createIndex("donations_idx_church_status")
    .on("donations")
    .columns(["churchId", "status"])
    .execute();

  await db.schema
    .createIndex("donations_idx_transaction")
    .on("donations")
    .column("transactionId")
    .execute();

  await db.schema
    .createTable("fundDonations")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("donationId", sql`char(11)`)
    .addColumn("fundId", sql`char(11)`)
    .addColumn("amount", "double precision")
    .addUniqueConstraint("fundDonations_id_UNIQUE", ["id"])
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema
    .createIndex("fundDonations_idx_church_donation")
    .on("fundDonations")
    .columns(["churchId", "donationId"])
    .execute();

  await db.schema
    .createIndex("fundDonations_idx_church_fund")
    .on("fundDonations")
    .columns(["churchId", "fundId"])
    .execute();

  await db.schema
    .createTable("donationBatches")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("name", sql`varchar(50)`)
    .addColumn("batchDate", "datetime")
    .addUniqueConstraint("donationBatches_id_UNIQUE", ["id"])
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema
    .createIndex("donationBatches_idx_church_id")
    .on("donationBatches")
    .column("churchId")
    .execute();

  await db.schema
    .createTable("gateways")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("provider", sql`varchar(50)`)
    .addColumn("publicKey", sql`varchar(255)`)
    .addColumn("privateKey", sql`varchar(255)`)
    .addColumn("webhookKey", sql`varchar(255)`)
    .addColumn("productId", sql`varchar(255)`)
    .addColumn("payFees", sql`bit(1)`)
    .addColumn("currency", sql`varchar(10)`)
    .addColumn("settings", "json")
    .addColumn("environment", sql`varchar(50)`)
    .addColumn("createdAt", "datetime", (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn("updatedAt", "datetime", (col) => col.defaultTo(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`))
    .addUniqueConstraint("gateways_id_UNIQUE", ["id"])
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema
    .createTable("customers")
    .ifNotExists()
    .addColumn("id", sql`varchar(255)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("personId", sql`char(11)`)
    .addColumn("provider", sql`varchar(50)`)
    .addColumn("metadata", "json")
    .addUniqueConstraint("customers_id_UNIQUE", ["id"])
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema
    .createTable("gatewayPaymentMethods")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`, (col) => col.notNull())
    .addColumn("gatewayId", sql`char(11)`, (col) => col.notNull())
    .addColumn("customerId", sql`varchar(255)`, (col) => col.notNull())
    .addColumn("externalId", sql`varchar(255)`, (col) => col.notNull())
    .addColumn("methodType", sql`varchar(50)`)
    .addColumn("displayName", sql`varchar(255)`)
    .addColumn("metadata", "json")
    .addColumn("createdAt", "datetime", (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn("updatedAt", "datetime", (col) => col.defaultTo(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`))
    .addUniqueConstraint("ux_gateway_payment_methods_external", ["gatewayId", "externalId"])
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema
    .createIndex("idx_gateway_payment_methods_church")
    .on("gatewayPaymentMethods")
    .column("churchId")
    .execute();

  await db.schema
    .createIndex("idx_gateway_payment_methods_customer")
    .on("gatewayPaymentMethods")
    .column("customerId")
    .execute();

  await db.schema
    .createTable("eventLogs")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("customerId", sql`varchar(255)`)
    .addColumn("provider", sql`varchar(50)`)
    .addColumn("providerId", sql`varchar(255)`)
    .addColumn("status", sql`varchar(50)`)
    .addColumn("eventType", sql`varchar(50)`)
    .addColumn("message", "text")
    .addColumn("created", "datetime")
    .addColumn("resolved", sql`tinyint(1)`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema
    .createIndex("eventLogs_idx_church_status_created")
    .on("eventLogs")
    .columns(["churchId", "status", "created"])
    .execute();

  await db.schema
    .createIndex("eventLogs_idx_customer")
    .on("eventLogs")
    .column("customerId")
    .execute();

  await db.schema
    .createIndex("eventLogs_idx_provider_id")
    .on("eventLogs")
    .column("providerId")
    .execute();

  await db.schema
    .createTable("settings")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
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
    .createTable("subscriptions")
    .ifNotExists()
    .addColumn("id", sql`varchar(255)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("personId", sql`char(11)`)
    .addColumn("customerId", sql`varchar(255)`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema
    .createTable("subscriptionFunds")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`varchar(11)`, (col) => col.notNull())
    .addColumn("subscriptionId", sql`varchar(255)`)
    .addColumn("fundId", sql`char(11)`)
    .addColumn("amount", "double precision")
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema
    .createIndex("subscriptionFunds_idx_church_subscription")
    .on("subscriptionFunds")
    .columns(["churchId", "subscriptionId"])
    .execute();

  await db.schema
    .createIndex("subscriptionFunds_idx_church_fund")
    .on("subscriptionFunds")
    .columns(["churchId", "fundId"])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  const tables = [
    "subscriptionFunds",
    "subscriptions",
    "settings",
    "eventLogs",
    "gatewayPaymentMethods",
    "customers",
    "gateways",
    "donationBatches",
    "fundDonations",
    "donations",
    "funds",
  ];

  for (const table of tables) {
    await db.schema.dropTable(table).ifExists().execute();
  }
}
