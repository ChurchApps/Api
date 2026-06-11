import type { Campaign, Customer, Donation, DonationBatch, EventLog, Fund, FundDonation, Gateway, GatewayPaymentMethod, Pledge, Subscription, SubscriptionFund } from "../models/index.js";

export interface GivingDatabase {
  campaigns: Campaign;
  customers: Customer;
  donations: Omit<Donation, "fund">;
  donationBatches: Omit<DonationBatch, "donationCount" | "totalAmount">;
  eventLogs: EventLog;
  fundDonations: Omit<FundDonation, "donation">;
  funds: Fund;
  pledges: Pledge;
  gateways: Gateway;
  gatewayPaymentMethods: GatewayPaymentMethod;
  subscriptions: Subscription;
  subscriptionFunds: SubscriptionFund;
}
