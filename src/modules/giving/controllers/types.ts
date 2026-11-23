import { Donation, Gateway } from "../models/index.js";

// Shapes used by the giving controllers that have no model class of their own.

// Errors thrown by gateway SDKs: Stripe-style (type/code/statusCode/raw) or axios-style (response).
export interface GatewayError {
  message?: string;
  code?: string;
  type?: string;
  statusCode?: number;
  raw?: { message?: string };
  response?: { status?: number; data?: unknown };
}

// A gateway as a client posts it or as handed to toPublicGateway; settings may still be JSON text.
export type GatewayInput = Omit<Gateway, "settings"> & {
  settings?: Record<string, unknown> | string | null;
  enabled?: boolean;
};

// What donors may see of a gateway: no keys, only the sandbox flag from settings.
export interface PublicGateway {
  id?: string;
  provider?: string;
  publicKey?: string;
  productId?: string;
  payFees?: boolean;
  currency?: string;
  enabled?: boolean;
  environment: string | null;
  settings?: { sandbox: boolean };
}

// The membership rows the giving controllers read (giving may not import the membership module).
export interface MembershipChurchRow {
  id?: string;
  name?: string;
  subDomain?: string;
}

export interface MembershipSettingRow {
  churchId?: string;
  keyName?: string;
  value?: string;
}

// The membership repos the giving controllers read from (church name/logo, currency setting).
export interface MembershipLookupRepos {
  church: { loadById(id: string): Promise<MembershipChurchRow | null> };
  setting: { loadMulipleChurches(keyNames: string[], churchIds: string[]): Promise<MembershipSettingRow[]> };
}

// One fund split of a gift as the donate form posts it.
export interface DonationFundInput {
  id?: string;
  amount: number;
  name?: string;
}

// The donor as the donate form posts it. name is a plain string from the guest form, a person name object otherwise.
export interface DonorInput {
  id?: string;
  email?: string;
  name?: string | { display?: string };
}

// interval_count arrives as client text as often as a number; receipts render only a fixed label for it.
export interface DonationInterval {
  interval_count: number | string;
  interval: string;
}

// The payment payload handed to the gateway provider; each provider reads its own extra fields.
export interface GatewayPaymentData {
  id?: string;
  customerId?: string;
  paymentMethodId?: string;
  saveCard?: boolean;
  amount?: number;
  currency?: string;
  notes?: string;
  person?: DonorInput;
  interval?: DonationInterval;
  billing_cycle_anchor?: number;
  [key: string]: unknown;
}

// POST /giving/donate/charge
export interface ChargeRequest extends GatewayPaymentData {
  churchId?: string;
  provider?: string;
  gatewayId?: string;
  funds?: DonationFundInput[];
  anonymous?: boolean;
  captchaPass?: string;
}

// POST /giving/donate/subscribe
export interface SubscribeRequest extends ChargeRequest {
  type?: string;
  proration_behavior?: string;
  expiry_month?: string | number;
  expiry_year?: string | number;
  routing_number?: string;
  account_number?: string;
  account_type?: string;
  sec_code?: string;
  name?: string;
}

// DonationRepo.loadSummary: one row per week + fund + currency.
export interface DonationSummaryRow {
  week: Date | string;
  totalAmount: number;
  fundName: string;
  currency: string | null;
}

// A loadSummary row once its currencies are folded into the church currency.
export interface MergedSummaryRow {
  week: Date | string;
  fundName: string;
  totalAmount: number;
}

// DonationRepo.loadPersonBasedSummary: one row per fund split of each gift.
export interface PersonSummaryRow {
  personId: string;
  donationAmount: number;
  currency: string | null;
  fundId: string;
  fundAmount: number;
  fundName: string;
}

// DonationRepo.loadFailed: a donations row plus the newest failure message for that donor.
export type FailedDonationRow = Donation & { gatewayMessage: string | null };

// POST /giving/subscriptions: a subscription change passed through to the gateway provider.
export interface SubscriptionUpdateRequest {
  id: string;
  provider?: string;
  [key: string]: unknown;
}

// POST /giving/paymentmethods/addcard; the body also reaches the provider's attach options.
export interface AddCardRequest {
  id?: string;
  email?: string;
  name?: string;
  churchId?: string;
  provider?: string;
  personId?: string;
  customerId?: string;
  [key: string]: unknown;
}

// POST /giving/paymentmethods/updatecard
export interface UpdateCardRequest {
  personId?: string;
  paymentMethodId?: string;
  cardData?: Record<string, unknown>;
  provider?: string;
}

// POST /giving/paymentmethods/ach-setup-intent and ach-setup-intent-anon
export interface AchSetupIntentRequest {
  personId?: string;
  customerId?: string;
  email?: string;
  name?: string;
  churchId?: string;
  gatewayId?: string;
}

// POST /giving/paymentmethods/addbankaccount
export interface AddBankAccountRequest {
  id?: string;
  personId?: string;
  customerId?: string;
  email?: string;
  name?: string;
}

// POST /giving/paymentmethods/updatebank and verifybank
export interface BankChangeRequest {
  paymentMethodId?: string;
  personId?: string;
  customerId?: string;
  bankData?: Record<string, unknown>;
  amountData?: Record<string, unknown>;
}
