CREATE TABLE "customers" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"churchId" char(11),
	"personId" char(11),
	"provider" varchar(50),
	"metadata" json
);
--> statement-breakpoint
CREATE TABLE "donationBatches" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"churchId" char(11),
	"name" varchar(50),
	"batchDate" timestamp
);
--> statement-breakpoint
CREATE TABLE "donations" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"churchId" char(11),
	"batchId" char(11),
	"personId" char(11),
	"donationDate" timestamp,
	"amount" double precision,
	"currency" varchar(10),
	"method" varchar(50),
	"methodDetails" varchar(255),
	"notes" text,
	"entryTime" timestamp,
	"status" varchar(20) DEFAULT 'complete',
	"transactionId" varchar(255)
);
--> statement-breakpoint
CREATE TABLE "eventLogs" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"churchId" char(11),
	"customerId" varchar(255),
	"provider" varchar(50),
	"providerId" varchar(255),
	"status" varchar(50),
	"eventType" varchar(50),
	"message" text,
	"created" timestamp,
	"resolved" smallint
);
--> statement-breakpoint
CREATE TABLE "fundDonations" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"churchId" char(11),
	"donationId" char(11),
	"fundId" char(11),
	"amount" double precision
);
--> statement-breakpoint
CREATE TABLE "funds" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"churchId" char(11),
	"name" varchar(50),
	"removed" boolean,
	"productId" varchar(50),
	"taxDeductible" boolean
);
--> statement-breakpoint
CREATE TABLE "gatewayPaymentMethods" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"churchId" char(11) NOT NULL,
	"gatewayId" char(11) NOT NULL,
	"customerId" varchar(255) NOT NULL,
	"externalId" varchar(255) NOT NULL,
	"methodType" varchar(50),
	"displayName" varchar(255),
	"metadata" json,
	"createdAt" timestamp,
	"updatedAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "gateways" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"churchId" char(11),
	"provider" varchar(50),
	"publicKey" varchar(255),
	"privateKey" varchar(255),
	"webhookKey" varchar(255),
	"productId" varchar(255),
	"payFees" boolean,
	"currency" varchar(10),
	"settings" json,
	"environment" varchar(50),
	"createdAt" timestamp,
	"updatedAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"churchId" char(11),
	"keyName" varchar(255),
	"value" text,
	"public" boolean
);
--> statement-breakpoint
CREATE TABLE "subscriptionFunds" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"churchId" varchar(11) NOT NULL,
	"subscriptionId" varchar(255),
	"fundId" char(11),
	"amount" double precision
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"churchId" char(11),
	"personId" char(11),
	"customerId" varchar(255)
);
--> statement-breakpoint
CREATE INDEX "giv_idx_church_id" ON "donationBatches" USING btree ("churchId");--> statement-breakpoint
CREATE INDEX "giv_idx_church_donation_date" ON "donations" USING btree ("churchId","donationDate");--> statement-breakpoint
CREATE INDEX "giv_idx_church_person" ON "donations" USING btree ("churchId","personId");--> statement-breakpoint
CREATE INDEX "giv_idx_church_batch" ON "donations" USING btree ("churchId","batchId");--> statement-breakpoint
CREATE INDEX "giv_idx_church_method" ON "donations" USING btree ("churchId","method","methodDetails");--> statement-breakpoint
CREATE INDEX "giv_idx_church_status" ON "donations" USING btree ("churchId","status");--> statement-breakpoint
CREATE INDEX "giv_idx_transaction" ON "donations" USING btree ("transactionId");--> statement-breakpoint
CREATE INDEX "giv_idx_church_status_created" ON "eventLogs" USING btree ("churchId","status","created");--> statement-breakpoint
CREATE INDEX "giv_idx_customer" ON "eventLogs" USING btree ("customerId");--> statement-breakpoint
CREATE INDEX "giv_idx_provider_id" ON "eventLogs" USING btree ("providerId");--> statement-breakpoint
CREATE INDEX "giv_idx_church_donation" ON "fundDonations" USING btree ("churchId","donationId");--> statement-breakpoint
CREATE INDEX "giv_idx_church_fund" ON "fundDonations" USING btree ("churchId","fundId");--> statement-breakpoint
CREATE INDEX "giv_idx_church_removed" ON "funds" USING btree ("churchId","removed");--> statement-breakpoint
CREATE UNIQUE INDEX "giv_ux_gateway_payment_methods_external" ON "gatewayPaymentMethods" USING btree ("gatewayId","externalId");--> statement-breakpoint
CREATE INDEX "giv_idx_gateway_payment_methods_church" ON "gatewayPaymentMethods" USING btree ("churchId");--> statement-breakpoint
CREATE INDEX "giv_idx_gateway_payment_methods_customer" ON "gatewayPaymentMethods" USING btree ("customerId");--> statement-breakpoint
CREATE INDEX "giv_settings_churchId" ON "settings" USING btree ("churchId");--> statement-breakpoint
CREATE INDEX "giv_idx_church_subscription" ON "subscriptionFunds" USING btree ("churchId","subscriptionId");--> statement-breakpoint
CREATE INDEX "giv_idx_sub_church_fund" ON "subscriptionFunds" USING btree ("churchId","fundId");