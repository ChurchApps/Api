import { pgTable, char, varchar, timestamp, boolean, doublePrecision, text, json, smallint, index, uniqueIndex } from "drizzle-orm/pg-core";

export const customers = pgTable("customers", {
  id: varchar("id", { length: 255 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  personId: char("personId", { length: 11 }),
  provider: varchar("provider", { length: 50 }),
  metadata: json("metadata")
});

export const donationBatches = pgTable("donationBatches", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  name: varchar("name", { length: 50 }),
  batchDate: timestamp("batchDate")
}, (t) => [index("giv_idx_church_id").on(t.churchId)]);

export const donations = pgTable("donations", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  batchId: char("batchId", { length: 11 }),
  personId: char("personId", { length: 11 }),
  donationDate: timestamp("donationDate"),
  amount: doublePrecision("amount"),
  currency: varchar("currency", { length: 10 }),
  method: varchar("method", { length: 50 }),
  methodDetails: varchar("methodDetails", { length: 255 }),
  notes: text("notes"),
  entryTime: timestamp("entryTime"),
  status: varchar("status", { length: 20 }).default("complete"),
  transactionId: varchar("transactionId", { length: 255 })
}, (t) => [
  index("giv_idx_church_donation_date").on(t.churchId, t.donationDate),
  index("giv_idx_church_person").on(t.churchId, t.personId),
  index("giv_idx_church_batch").on(t.churchId, t.batchId),
  index("giv_idx_church_method").on(t.churchId, t.method, t.methodDetails),
  index("giv_idx_church_status").on(t.churchId, t.status),
  index("giv_idx_transaction").on(t.transactionId)
]);

export const eventLogs = pgTable("eventLogs", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  customerId: varchar("customerId", { length: 255 }),
  provider: varchar("provider", { length: 50 }),
  providerId: varchar("providerId", { length: 255 }),
  status: varchar("status", { length: 50 }),
  eventType: varchar("eventType", { length: 50 }),
  message: text("message"),
  created: timestamp("created"),
  resolved: smallint("resolved")
}, (t) => [
  index("giv_idx_church_status_created").on(t.churchId, t.status, t.created),
  index("giv_idx_customer").on(t.customerId),
  index("giv_idx_provider_id").on(t.providerId)
]);

export const fundDonations = pgTable("fundDonations", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  donationId: char("donationId", { length: 11 }),
  fundId: char("fundId", { length: 11 }),
  amount: doublePrecision("amount")
}, (t) => [
  index("giv_idx_church_donation").on(t.churchId, t.donationId),
  index("giv_idx_church_fund").on(t.churchId, t.fundId)
]);

export const funds = pgTable("funds", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  name: varchar("name", { length: 50 }),
  removed: boolean("removed"),
  productId: varchar("productId", { length: 50 }),
  taxDeductible: boolean("taxDeductible")
}, (t) => [index("giv_idx_church_removed").on(t.churchId, t.removed)]);

export const gatewayPaymentMethods = pgTable("gatewayPaymentMethods", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }).notNull(),
  gatewayId: char("gatewayId", { length: 11 }).notNull(),
  customerId: varchar("customerId", { length: 255 }).notNull(),
  externalId: varchar("externalId", { length: 255 }).notNull(),
  methodType: varchar("methodType", { length: 50 }),
  displayName: varchar("displayName", { length: 255 }),
  metadata: json("metadata"),
  createdAt: timestamp("createdAt"),
  updatedAt: timestamp("updatedAt")
}, (t) => [
  uniqueIndex("giv_ux_gateway_payment_methods_external").on(t.gatewayId, t.externalId),
  index("giv_idx_gateway_payment_methods_church").on(t.churchId),
  index("giv_idx_gateway_payment_methods_customer").on(t.customerId)
]);

export const gateways = pgTable("gateways", {
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
  createdAt: timestamp("createdAt"),
  updatedAt: timestamp("updatedAt")
});

export const givingSettings = pgTable("settings", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  keyName: varchar("keyName", { length: 255 }),
  value: text("value"),
  public: boolean("public")
}, (t) => [index("giv_settings_churchId").on(t.churchId)]);

export const subscriptionFunds = pgTable("subscriptionFunds", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: varchar("churchId", { length: 11 }).notNull(),
  subscriptionId: varchar("subscriptionId", { length: 255 }),
  fundId: char("fundId", { length: 11 }),
  amount: doublePrecision("amount")
}, (t) => [
  index("giv_idx_church_subscription").on(t.churchId, t.subscriptionId),
  index("giv_idx_sub_church_fund").on(t.churchId, t.fundId)
]);

export const subscriptions = pgTable("subscriptions", {
  id: varchar("id", { length: 255 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  personId: char("personId", { length: 11 }),
  customerId: varchar("customerId", { length: 255 })
});
