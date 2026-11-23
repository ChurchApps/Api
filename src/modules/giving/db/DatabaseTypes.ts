import type { ColumnType } from "kysely";
import type { Campaign, Customer, Donation, DonationBatch, EventLog, Fund, FundDonation, Gateway, GatewayPaymentMethod, Pledge, Subscription, SubscriptionFund } from "../models/index.js";

// Repositories write some columns in their stored form rather than the model's:
// DATETIME columns as MySQL date strings, JSON columns as strings, and flags as 0/1.
type WritesAs<T, K extends keyof T, W> = Omit<T, K> & {
  [P in K]: ColumnType<T[P], T[P] | W | null, T[P] | W | null>;
};

// Soft-delete flag that lives on the table but not on the model.
interface Removable {
  removed: ColumnType<boolean, boolean | number | undefined, boolean | number>;
}

export interface GivingDatabase {
  campaigns: WritesAs<Campaign, "showPublic" | "allowSelfPledge", number> & Removable;
  customers: WritesAs<Customer, "metadata", string>;
  donations: WritesAs<Omit<Donation, "fund">, "donationDate" | "entryTime", string>;
  donationBatches: WritesAs<Omit<DonationBatch, "donationCount" | "totalAmount">, "batchDate", string>;
  eventLogs: EventLog;
  fundDonations: Omit<FundDonation, "donation">;
  funds: Fund & Removable;
  pledges: Pledge;
  gateways: WritesAs<Gateway, "settings", string>;
  gatewayPaymentMethods: WritesAs<GatewayPaymentMethod, "metadata", string>;
  subscriptions: Subscription;
  subscriptionFunds: SubscriptionFund;
}
