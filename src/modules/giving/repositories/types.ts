import type { Campaign, Customer, Donation, DonationSummaryDonation, FundDonation, Gateway, GatewayPaymentMethod, Pledge, SubscriptionFund } from "../models/index.js";

// Row shapes for giving queries whose columns don't match a model in ../models.

// MySQL hands back TINYINT flags as 0/1 and DECIMAL columns as strings.
export type CampaignRow = Omit<Campaign, "showPublic" | "allowSelfPledge" | "goalAmount"> & {
  showPublic?: boolean | number;
  allowSelfPledge?: boolean | number;
  goalAmount?: number | string | null;
};

// Raw gateway rows carry `settings` as the stored JSON string.
export type GatewayRow = Omit<Gateway, "settings"> & { settings?: string | Record<string, unknown> | null };

// A subscription fund joined with its fund's name.
export type SubscriptionFundWithName = SubscriptionFund & { name?: string };

// Raw customer rows carry `metadata` as the stored JSON string.
export type CustomerRow = Omit<Customer, "metadata"> & { metadata?: string | Record<string, unknown> | null };

// DECIMAL amounts can come back from MySQL as strings.
export type PledgeRow = Omit<Pledge, "amount"> & { amount?: number | string | null };

// Raw payment-method rows carry `metadata` as the stored JSON string.
export type GatewayPaymentMethodRow = Omit<GatewayPaymentMethod, "metadata"> & { metadata?: string | Record<string, unknown> | null };

// A fund donation joined with fields from its donation.
export type FundDonationRow = FundDonation & {
  currency?: string | null;
  donationDate?: Date;
  batchId?: string;
  personId?: string;
};

// A donation joined with one of its fund allocations, or with the latest gateway failure message.
export type DonationRow = Donation & {
  fundId?: string;
  fundName?: string;
  fundAmount?: number;
  gatewayMessage?: string | null;
};

// loadSummary's week comes from STR_TO_DATE, so MySQL returns a DATE.
export interface DonationWeekRow {
  week: Date | string;
  fundName: string;
  totalAmount: number;
  currency: string | null;
}

export interface WeeklyDonationSummary {
  week: Date | string;
  donations: DonationSummaryDonation[];
}

export interface DonationPersonFundRow {
  personId: string | null;
  donationAmount: number;
  currency: string | null;
  fundId: string;
  fundAmount: number;
  fundName: string;
}
