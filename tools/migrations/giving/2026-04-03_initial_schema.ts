import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {

  // customers
  await db.schema
    .createTable("customers")
    .ifNotExists()
    .addColumn("id", sql`varchar(255)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("personId", sql`char(11)`)
    .addColumn("provider", sql`varchar(50)`)
    .addColumn("metadata", sql`json`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  // donationBatches
  await db.schema
    .createTable("donationBatches")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("name", sql`varchar(50)`)
    .addColumn("batchDate", sql`datetime`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema.createIndex("idx_donationBatches_churchId").on("donationBatches").column("churchId").execute();

  // donations
  await db.schema
    .createTable("donations")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("batchId", sql`char(11)`)
    .addColumn("personId", sql`char(11)`)
    .addColumn("donationDate", sql`datetime`)
    .addColumn("amount", sql`double`)
    .addColumn("currency", sql`varchar(10)`)
    .addColumn("method", sql`varchar(50)`)
    .addColumn("methodDetails", sql`varchar(255)`)
    .addColumn("notes", "text")
    .addColumn("entryTime", sql`datetime`)
    .addColumn("status", sql`varchar(20)`, (col) => col.defaultTo("complete"))
    .addColumn("transactionId", sql`varchar(255)`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema.createIndex("idx_donations_church_date").on("donations").columns(["churchId", "donationDate"]).execute();
  await db.schema.createIndex("idx_donations_church_person").on("donations").columns(["churchId", "personId"]).execute();
  await db.schema.createIndex("idx_donations_church_batch").on("donations").columns(["churchId", "batchId"]).execute();
  await db.schema.createIndex("idx_donations_church_method").on("donations").columns(["churchId", "method", "methodDetails"]).execute();
  await db.schema.createIndex("idx_donations_church_status").on("donations").columns(["churchId", "status"]).execute();
  await db.schema.createIndex("idx_donations_transactionId").on("donations").column("transactionId").execute();

  // eventLogs
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
    .addColumn("created", sql`datetime`)
    .addColumn("resolved", sql`tinyint(1)`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema.createIndex("idx_eventLogs_church_status_created").on("eventLogs").columns(["churchId", "status", "created"]).execute();
  await db.schema.createIndex("idx_eventLogs_customerId").on("eventLogs").column("customerId").execute();
  await db.schema.createIndex("idx_eventLogs_providerId").on("eventLogs").column("providerId").execute();

  // fundDonations
  await db.schema
    .createTable("fundDonations")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("donationId", sql`char(11)`)
    .addColumn("fundId", sql`char(11)`)
    .addColumn("amount", sql`double`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema.createIndex("idx_fundDonations_church_donation").on("fundDonations").columns(["churchId", "donationId"]).execute();
  await db.schema.createIndex("idx_fundDonations_church_fund").on("fundDonations").columns(["churchId", "fundId"]).execute();

  // funds
  await db.schema
    .createTable("funds")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("name", sql`varchar(50)`)
    .addColumn("removed", sql`bit(1)`)
    .addColumn("productId", sql`varchar(50)`)
    .addColumn("taxDeductible", sql`bit(1)`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema.createIndex("idx_funds_church_removed").on("funds").columns(["churchId", "removed"]).execute();

  // gateways
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
    .addColumn("settings", sql`json`)
    .addColumn("environment", sql`varchar(50)`)
    .addColumn("createdAt", sql`datetime`, (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn("updatedAt", sql`datetime`, (col) => col.defaultTo(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`))
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  // gatewayPaymentMethods
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
    .addColumn("metadata", sql`json`)
    .addColumn("createdAt", sql`datetime`, (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn("updatedAt", sql`datetime`, (col) => col.defaultTo(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`))
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema.createIndex("idx_gatewayPaymentMethods_unique_gateway_external").on("gatewayPaymentMethods").columns(["gatewayId", "externalId"]).unique().execute();
  await db.schema.createIndex("idx_gatewayPaymentMethods_churchId").on("gatewayPaymentMethods").column("churchId").execute();
  await db.schema.createIndex("idx_gatewayPaymentMethods_customerId").on("gatewayPaymentMethods").column("customerId").execute();

  // subscriptions
  await db.schema
    .createTable("subscriptions")
    .ifNotExists()
    .addColumn("id", sql`varchar(255)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("personId", sql`char(11)`)
    .addColumn("customerId", sql`varchar(255)`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  // subscriptionFunds
  await db.schema
    .createTable("subscriptionFunds")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`varchar(11)`)
    .addColumn("subscriptionId", sql`varchar(255)`)
    .addColumn("fundId", sql`char(11)`)
    .addColumn("amount", sql`double`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema.createIndex("idx_subscriptionFunds_church_subscription").on("subscriptionFunds").columns(["churchId", "subscriptionId"]).execute();
  await db.schema.createIndex("idx_subscriptionFunds_church_fund").on("subscriptionFunds").columns(["churchId", "fundId"]).execute();

  // settings
  await db.schema
    .createTable("settings")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("keyName", sql`varchar(255)`)
    .addColumn("value", sql`mediumtext`)
    .addColumn("public", sql`bit(1)`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema.createIndex("idx_settings_churchId").on("settings").column("churchId").execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  // Drop tables in reverse order
  const tables = [
    "settings",
    "subscriptionFunds",
    "subscriptions",
    "gatewayPaymentMethods",
    "gateways",
    "funds",
    "fundDonations",
    "eventLogs",
    "donations",
    "donationBatches",
    "customers",
  ];

  for (const table of tables) {
    await db.schema.dropTable(table).ifExists().execute();
  }
}
