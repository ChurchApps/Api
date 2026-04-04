import type { Customer, Donation, DonationBatch, EventLog, Fund, FundDonation, Gateway, GatewayPaymentMethod, Subscription, SubscriptionFund } from "../models/index.js";

export interface GivingDatabase {
  customers: Customer;
  donations: Omit<Donation, "fund">;
  donationBatches: Omit<DonationBatch, "donationCount" | "totalAmount">;
  eventLogs: EventLog;
  fundDonations: Omit<FundDonation, "donation">;
  funds: Fund;
  gateways: Gateway;
  gatewayPaymentMethods: GatewayPaymentMethod;
  subscriptions: Subscription;
  subscriptionFunds: SubscriptionFund;
}
