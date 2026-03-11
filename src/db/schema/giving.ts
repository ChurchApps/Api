import { mysqlTable, char, varchar, datetime, boolean, int, double, text, mediumtext, json, tinyint, index, uniqueIndex } from "drizzle-orm/mysql-core";

export const customers = mysqlTable("customers", {
  id: varchar("id", { length: 255 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  personId: char("personId", { length: 11 }),
  provider: varchar("provider", { length: 50 }),
  metadata: json("metadata"),
});

export const donationBatches = mysqlTable("donationBatches", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  name: varchar("name", { length: 50 }),
  batchDate: datetime("batchDate"),
}, (t) => [
  index("idx_church_id").on(t.churchId),
]);

export const donations = mysqlTable("donations", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  batchId: char("batchId", { length: 11 }),
  personId: char("personId", { length: 11 }),
  donationDate: datetime("donationDate"),
  amount: double("amount"),
  currency: varchar("currency", { length: 10 }),
  method: varchar("method", { length: 50 }),
  methodDetails: varchar("methodDetails", { length: 255 }),
  notes: text("notes"),
  entryTime: datetime("entryTime"),
  status: varchar("status", { length: 20 }).default("complete"),
  transactionId: varchar("transactionId", { length: 255 }),
}, (t) => [
  index("idx_church_donation_date").on(t.churchId, t.donationDate),
  index("idx_church_person").on(t.churchId, t.personId),
  index("idx_church_batch").on(t.churchId, t.batchId),
  index("idx_church_method").on(t.churchId, t.method, t.methodDetails),
  index("idx_church_status").on(t.churchId, t.status),
  index("idx_transaction").on(t.transactionId),
]);

export const eventLogs = mysqlTable("eventLogs", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  customerId: varchar("customerId", { length: 255 }),
  provider: varchar("provider", { length: 50 }),
  providerId: varchar("providerId", { length: 255 }),
  status: varchar("status", { length: 50 }),
  eventType: varchar("eventType", { length: 50 }),
  message: text("message"),
  created: datetime("created"),
  resolved: tinyint("resolved"),
}, (t) => [
  index("idx_church_status_created").on(t.churchId, t.status, t.created),
  index("idx_customer").on(t.customerId),
  index("idx_provider_id").on(t.providerId),
]);

export const fundDonations = mysqlTable("fundDonations", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  donationId: char("donationId", { length: 11 }),
  fundId: char("fundId", { length: 11 }),
  amount: double("amount"),
}, (t) => [
  index("idx_church_donation").on(t.churchId, t.donationId),
  index("idx_church_fund").on(t.churchId, t.fundId),
]);

export const funds = mysqlTable("funds", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  name: varchar("name", { length: 50 }),
  removed: boolean("removed"),
  productId: varchar("productId", { length: 50 }),
  taxDeductible: boolean("taxDeductible"),
}, (t) => [
  index("idx_church_removed").on(t.churchId, t.removed),
]);

export const gatewayPaymentMethods = mysqlTable("gatewayPaymentMethods", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }).notNull(),
  gatewayId: char("gatewayId", { length: 11 }).notNull(),
  customerId: varchar("customerId", { length: 255 }).notNull(),
  externalId: varchar("externalId", { length: 255 }).notNull(),
  methodType: varchar("methodType", { length: 50 }),
  displayName: varchar("displayName", { length: 255 }),
  metadata: json("metadata"),
  createdAt: datetime("createdAt"),
  updatedAt: datetime("updatedAt"),
}, (t) => [
  uniqueIndex("ux_gateway_payment_methods_external").on(t.gatewayId, t.externalId),
  index("idx_gateway_payment_methods_church").on(t.churchId),
  index("idx_gateway_payment_methods_customer").on(t.customerId),
]);

export const gateways = mysqlTable("gateways", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  provider: varchar("provider", { length: 50 }),
  publicKey: varchar("publicKey", { length: 255 }),
  privateKey: varchar("privateKey", { length: 255 }),
  webhookKey: varchar("webhookKey", { length: 255 }),
  productId: varchar("productId", { length: 255 }),
  payFees: boolean("payFees"),
  currency: varchar("currency", { length: 10 }),
  settings: json("settings"),
  environment: varchar("environment", { length: 50 }),
  createdAt: datetime("createdAt"),
  updatedAt: datetime("updatedAt"),
});

export const givingSettings = mysqlTable("settings", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  keyName: varchar("keyName", { length: 255 }),
  value: mediumtext("value"),
  public: boolean("public"),
}, (t) => [
  index("churchId").on(t.churchId),
]);

export const subscriptionFunds = mysqlTable("subscriptionFunds", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: varchar("churchId", { length: 11 }).notNull(),
  subscriptionId: varchar("subscriptionId", { length: 255 }),
  fundId: char("fundId", { length: 11 }),
  amount: double("amount"),
}, (t) => [
  index("idx_church_subscription").on(t.churchId, t.subscriptionId),
  index("idx_church_fund").on(t.churchId, t.fundId),
]);

export const subscriptions = mysqlTable("subscriptions", {
  id: varchar("id", { length: 255 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  personId: char("personId", { length: 11 }),
  customerId: varchar("customerId", { length: 255 }),
});
