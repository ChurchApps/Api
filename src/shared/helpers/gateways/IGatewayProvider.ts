import express from "express";
import type Stripe from "stripe";
import type { Repos } from "../../../modules/giving/repositories/Repos.js";
import type { Customer, Donation, FundDonation } from "../../../modules/giving/models/index.js";

export type { Repos as GivingRepos } from "../../../modules/giving/repositories/Repos.js";

/**
 * Fields shared by provider API objects (charges, subscriptions, saved methods, webhook payloads).
 * Each provider extends this with the fields its API returns.
 */
export interface GatewayObject {
  id?: string;
  status?: string;
  error?: string;
  success?: boolean;
  // ISO currency of a completed charge (Stripe PaymentIntent/Charge carry it).
  currency?: string;
  // Set by the charge path when the donation is already recorded (e.g. a replayed reference).
  alreadyRecorded?: boolean;
}

// Stripe sends a referenced object as its id string unless the field was expanded to the object.
export interface ExpandableRef {
  id?: string;
  toString(): string;
}

// Webhook payload fields the donation webhook route reads, whichever provider sent it.
export interface GatewayWebhookData extends GatewayObject {
  payment_intent?: string;
  latest_charge?: ExpandableRef;
  // A Stripe dispute names its charge here.
  charge?: string;
  reference_number?: string;
  transaction?: { id?: string };
  cancellation_details?: { reason?: string | null };
}

// Fields read from a Stripe Charge, PaymentIntent or Invoice delivered by a webhook or the events API.
export interface StripeEventObject extends GatewayWebhookData {
  object?: string;
  amount?: number;
  amount_paid?: number;
  amount_received?: number;
  amount_due?: number;
  currency?: string;
  customer?: string;
  created?: number;
  payment_intent?: string;
  latest_charge?: string;
  charge?: string;
  invoice?: string;
  subscription?: string;
  description?: string;
  billing_reason?: string;
  failure_message?: string;
  outcome?: { seller_message?: string };
  metadata?: { funds?: string; memo?: string; notes?: string };
  payment_method_details?: Stripe.Charge.PaymentMethodDetails;
}

// A Stripe event as kept for replay; the object is read through StripeEventObject.
export interface StripeEventRecord {
  id: string;
  type: string;
  created: number;
  data: { object: StripeEventObject };
}

// A fund split as sent by the donation UI or stored in provider metadata.
export interface FundAllocation {
  id?: string;
  fundId?: string;
  subscriptionId?: string;
  name?: string;
  amount?: number;
}

export interface GatewayPerson {
  id?: string;
  email?: string;
  name?: string | { display?: string; first?: string; last?: string };
  firstName?: string;
  lastName?: string;
  first_name?: string;
  last_name?: string;
}

export interface GatewayInterval {
  interval?: string;
  // Donation forms post this as text as often as a number.
  interval_count?: number | string;
  frequency?: string;
}

/** A one-time charge or subscription request as posted by the donation UI. */
export interface GatewayPaymentRequest {
  id?: string;
  token?: string;
  type?: string;
  paymentType?: string;
  amount?: number;
  currency?: string;
  customerId?: string;
  paymentMethodId?: string;
  funds?: FundAllocation[];
  notes?: string;
  note?: string;
  description?: string;
  person?: GatewayPerson;
  name?: string;
  email?: string;
  anonymous?: boolean;
  church?: { churchURL?: string };
  return_url?: string;
  off_session?: boolean;
  saveCard?: boolean;
  // Set by prepareCharge when the reference is already recorded.
  alreadyRecorded?: boolean;
  cardBrand?: string;
  cardLast4?: string;
  expiry_month?: string | number;
  expiry_year?: string | number;
  routing_number?: string;
  account_number?: string;
  account_type?: string;
  account_holder_type?: string;
  sec_code?: string;
  billing_info?: { first_name?: string; last_name?: string; email?: string };
  orderId?: string;
  // ePayMints per-transaction payment details
  paymentMethod?: string;
  cardData?: { number: string; expMonth: string; expYear: string; cvv: string };
  achData?: { routingNumber?: string; accountNumber?: string; accountType?: "checking" | "savings" };
  sourceId?: string;
  nonce?: string;
  idempotencyKey?: string;
  interval?: GatewayInterval | string;
  billing_cycle_anchor?: number;
  proration_behavior?: string;
  // Square / PayPal plan-based subscriptions
  planId?: string;
  cardId?: string;
  startDate?: string;
  customId?: string;
  paymentTokenId?: string;
}

/** A subscription edit; Stripe receives its own subscription object back from the UI. */
export interface GatewaySubscriptionUpdate {
  id?: string;
  subscriptionId?: string;
  amount?: number;
  currency?: string;
  interval?: GatewayInterval | string;
  default_payment_method?: string | null;
  items?: { data?: { id?: string; price?: { currency?: string } }[] };
  plan?: { product?: string; currency?: string; amount?: number; unit_amount?: number; interval?: Stripe.PriceCreateParams.Recurring.Interval; interval_count?: number };
  planId?: string;
  quantity?: number;
  shippingAmount?: number;
  customId?: string;
}

export interface GatewayOrderRequest {
  amount: number;
  currency?: string;
  description?: string;
  customId?: string;
}

export interface GatewayPlanRequest {
  name?: string;
  amount: number;
  currency?: string;
  interval?: "DAY" | "WEEK" | "MONTH" | "YEAR";
  intervalCount?: number;
  productName?: string;
  productDescription?: string;
}

/** Options for attaching a saved payment method (Stripe passes { customer }, NMI the vault fields). */
export interface GatewayAttachOptions {
  customer?: string | { id?: string };
  customerId?: string;
  personId?: string;
  source?: string;
  token?: string;
  name?: string;
  routing_number?: string;
  account_number?: string;
  account_type?: string;
  sec_code?: string;
  expiry_month?: string | number;
  expiry_year?: string | number;
  cardBrand?: string;
  cardLast4?: string;
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  zip?: string;
}

/** Request body of the attach-payment-method endpoint, as read by buildAttachOptions/buildLocalMethodRecord. */
export interface GatewayAttachBody {
  personId?: string;
  type?: string;
  name?: string;
  routing_number?: string;
  account_number?: string;
  account_type?: string;
  expiry_month?: string | number;
  expiry_year?: string | number;
  cardBrand?: string;
  cardLast4?: string;
}

export interface LocalMethodRecord {
  methodType: string;
  displayName: string;
  metadata: Record<string, unknown>;
}

// Saved method in the common member-UI shape.
export interface NormalizedPaymentMethod {
  id: string;
  type: string;
  provider: string;
  name: string;
  last4?: string;
  email?: string;
  customerId: string;
  gatewayId: string;
  status?: string;
  isLegacy?: boolean;
}

// Subscription in the common UI shape ({ id, status, billing_cycle_anchor, default_payment_method, plan }).
export interface NormalizedSubscription {
  id: string;
  status: string;
  billing_cycle_anchor: number;
  default_payment_method: string;
  plan: { amount: number; interval: string; interval_count: number; currency?: string };
}

// Stripe groups a customer's saved methods by kind.
export interface StripeCustomerPaymentMethods {
  cards: Stripe.ApiList<Stripe.PaymentMethod>;
  banks: Stripe.ApiList<Stripe.PaymentMethod>;
  legacyBanks: Stripe.ApiList<Stripe.CustomerSource>;
  customer: Customer;
}

export type GatewayPaymentMethodList = GatewayObject[] | StripeCustomerPaymentMethods[];
export type GatewaySubscriptionList = GatewayObject[] | Stripe.ApiList<Stripe.Subscription>;

// Stripe takes a source token; ePayMints reads raw ACH numbers.
export type GatewayBankAccountOptions = Stripe.CustomerCreateSourceParams & { routingNumber?: string; accountNumber?: string };

export interface GatewayErrorMapping {
  status: number;
  body: { error: string; code: string };
}

export type GatewayDonationLogResult = FundDonation[] | Donation;

export interface WebhookResult {
  success: boolean;
  shouldProcess: boolean;
  eventType?: string;
  eventData?: GatewayWebhookData;
  eventId?: string;
}

export interface WebhookEventClassification {
  action: "donation" | "cancel-subscription" | "ignore";
  status?: "pending" | "complete" | "failed" | "refunded";
}

export interface ProviderCapabilities {
  supportsOneTimePayments: boolean;
  supportsSubscriptions: boolean;
  supportsVault: boolean;
  supportsACH: boolean;
  supportsRefunds: boolean;
  supportsPartialRefunds: boolean;
  supportsWebhooks: boolean;
  supportsOrders: boolean;
  supportsInstantCapture: boolean;
  supportsManualCapture: boolean;
  supportsSCA: boolean;
  requiresPlansForSubscriptions: boolean;
  requiresCustomerForSubscription: boolean;
  supportedPaymentMethods: string[];
  supportedCurrencies: string[];
  maxRefundWindow?: number; // in days
  minTransactionAmount?: number; // in cents
  maxTransactionAmount?: number; // in cents
  notes?: string[];
}

export interface ReplayEvent {
  id: string;
  type: string;
  created: Date;
  amount: number;
  customerId: string;
  raw: StripeEventRecord;
  skipReason?: string;
}

export interface ChargeResult {
  success: boolean;
  transactionId: string;
  data: GatewayObject | null;
  error?: string;
}

export interface SubscriptionResult {
  success: boolean;
  subscriptionId: string;
  data: GatewayObject;
}

export interface GatewayConfig {
  gatewayId: string;
  churchId: string;
  publicKey: string;
  privateKey: string;
  webhookKey: string;
  productId?: string;
  settings?: Record<string, unknown> | null;
  environment?: string | null;
  currency?: string;
}

export interface RefundOptions {
  // Major units (e.g. dollars); omitted = refund whatever is left on the charge.
  amount?: number;
  currency?: string;
  idempotencyKey?: string;
}

export interface IGatewayProvider {
  readonly name: string;
  readonly capabilities: ProviderCapabilities;
  // Donations are recorded at charge time rather than via a later webhook confirmation.
  readonly logsDonationsImmediately?: boolean;
  // Attach() 404s for a stale local customer id should recreate the customer and retry.
  readonly recreatesMissingCustomers?: boolean;

  // Webhook management
  createWebhookEndpoint(config: GatewayConfig, webhookUrl: string): Promise<{ id: string; secret?: string }>;
  deleteWebhooksByChurchId(config: GatewayConfig, churchId: string): Promise<void>;
  verifyWebhookSignature(config: GatewayConfig, headers: express.Request["headers"], body: unknown, extras?: { notificationUrl?: string }): Promise<WebhookResult>;
  // Semantic meaning of a verified webhook event; unknown events are "ignore".
  classifyWebhookEvent?(eventType: string): WebhookEventClassification;

  // Payment processing
  processCharge(config: GatewayConfig, donationData: GatewayPaymentRequest): Promise<ChargeResult>;
  // Provider-specific request massaging before processCharge/createSubscription
  // (e.g. saved-method vaulting, customer reuse). May mutate the passed data.
  prepareCharge?(config: GatewayConfig, donationData: GatewayPaymentRequest, repos: Repos): Promise<void>;
  prepareSubscription?(config: GatewayConfig, subscriptionData: GatewayPaymentRequest, person: GatewayPerson, repos: Repos): Promise<void>;
  // Post-subscription persistence (e.g. store the gateway-created customer); returns the customerId to keep locally.
  finalizeSubscription?(config: GatewayConfig, result: SubscriptionResult, subscriptionData: GatewayPaymentRequest, person: GatewayPerson, repos: Repos): Promise<string | undefined>;
  createSubscription(config: GatewayConfig, subscriptionData: GatewayPaymentRequest): Promise<SubscriptionResult>;
  updateSubscription(config: GatewayConfig, subscriptionData: GatewaySubscriptionUpdate): Promise<SubscriptionResult>;
  cancelSubscription(config: GatewayConfig, subscriptionId: string, reason?: string): Promise<void>;
  pauseSubscription(config: GatewayConfig, subscriptionId: string): Promise<void>;
  resumeSubscription(config: GatewayConfig, subscriptionId: string): Promise<void>;

  // Fee calculation
  calculateFees(amount: number, churchId: string, currency?: string, paymentType?: "card" | "bank"): Promise<number>;

  // Product/service management
  createProduct?(config: GatewayConfig, churchId: string): Promise<string>;

  // Customer management. options.personId lets providers enrich the record (e.g. billing address).
  createCustomer?(config: GatewayConfig, email: string, name: string, options?: { personId?: string }): Promise<string>;
  getCustomerSubscriptions?(config: GatewayConfig, customerId: string): Promise<GatewaySubscriptionList>;
  // null when the customer doesn't exist on the gateway.
  getCustomerCreatedAt?(config: GatewayConfig, customerId: string): Promise<Date | null>;
  // Subscriptions in the common UI shape ({ id, status, billing_cycle_anchor, default_payment_method, plan }).
  listNormalizedSubscriptions?(config: GatewayConfig, customerId: string): Promise<NormalizedSubscription[]>;
  getSubscription?(config: GatewayConfig, subscriptionId: string): Promise<GatewayObject | null>;
  getCustomerPaymentMethods?(config: GatewayConfig, customer: Customer | string): Promise<GatewayPaymentMethodList>;

  // Payment method management
  // Normalized saved methods for the member UI: { id, type, provider, name, last4?, email?, customerId, gatewayId, status? }
  listNormalizedPaymentMethods?(config: GatewayConfig, customer: Customer | string, repos: Repos): Promise<NormalizedPaymentMethod[]>;
  // Returns an error message when an attach token is malformed for this provider.
  validateAttachToken?(id: string): string | null;
  // Resolves the provider-scoped customer id to attach to (may ignore the request-supplied one).
  resolveCustomerForAttach?(config: GatewayConfig, personId: string | undefined, requestCustomerId: string | undefined, repos: Repos): Promise<string | undefined>;
  buildAttachOptions?(customerId: string, tokenId: string, body: GatewayAttachBody): GatewayAttachOptions;
  // Local gatewayPaymentMethods display record to persist after attach; null = none.
  buildLocalMethodRecord?(pm: GatewayObject, body: GatewayAttachBody, tokenId: string): LocalMethodRecord | null;
  // True when an opaque payment-method id is in this provider's id format.
  ownsPaymentMethodId?(id: string): boolean;
  // Confirms the method belongs to the customer; providers without this get a local-record check.
  verifyMethodOwnership?(config: GatewayConfig, paymentMethodId: string, customerId: string, repos: Repos): Promise<boolean>;
  // Full provider-side delete (may cascade schedules); default is detachPaymentMethod.
  deletePaymentMethod?(config: GatewayConfig, paymentMethodId: string, customerId: string, repos: Repos): Promise<void>;
  // Ids of the customer's live recurring gifts charged to this method; providers without it fall back to listNormalizedSubscriptions.
  activeSubscriptionIdsUsingMethod?(config: GatewayConfig, paymentMethodId: string, customerId: string): Promise<string[]>;
  // Verifies a gateway-created subscription belongs to the person (no local row exists).
  verifySubscriptionOwnership?(config: GatewayConfig, subscriptionId: string, personId: string, repos: Repos): Promise<boolean>;
  // Maps a provider SDK error to an HTTP response; null falls through to generic handling.
  mapError?(e: unknown): GatewayErrorMapping | null;
  attachPaymentMethod?(config: GatewayConfig, paymentMethodId: string, options: GatewayAttachOptions): Promise<GatewayObject>;
  detachPaymentMethod?(config: GatewayConfig, paymentMethodId: string): Promise<GatewayObject>;
  addCard?(config: GatewayConfig, customerId: string, cardData: string | Stripe.CustomerCreateSourceParams): Promise<GatewayObject>;
  updateCard?(config: GatewayConfig, paymentMethodId: string, cardData: Stripe.PaymentMethodUpdateParams): Promise<GatewayObject>;
  createBankAccount?(config: GatewayConfig, customerId: string, options: GatewayBankAccountOptions): Promise<GatewayObject>;
  updateBank?(config: GatewayConfig, paymentMethodId: string, bankData: Stripe.CustomerUpdateSourceParams, customerId: string): Promise<GatewayObject>;
  verifyBank?(config: GatewayConfig, paymentMethodId: string, amountData: Stripe.CustomerVerifySourceParams, customerId: string): Promise<GatewayObject>;
  deleteBankAccount?(config: GatewayConfig, customerId: string, bankAccountId: string): Promise<GatewayObject>;

  // Provider-specific functionality
  generateClientToken?(config: GatewayConfig): Promise<string>;
  // Wallet (Apple Pay) domain verification; providers without wallets omit it.
  registerPaymentMethodDomain?(config: GatewayConfig, domainName: string): Promise<{ id: string; created: boolean }>;
  createOrder?(config: GatewayConfig, orderData: GatewayOrderRequest): Promise<GatewayObject>;

  // Subscription plan management
  createSubscriptionPlan?(config: GatewayConfig, planData: GatewayPlanRequest): Promise<string>;
  createSubscriptionWithPlan?(config: GatewayConfig, subscriptionData: GatewayPaymentRequest): Promise<SubscriptionResult>;

  // Transaction lookup
  getCharge?(config: GatewayConfig, chargeId: string): Promise<GatewayObject>;

  // Token-based payment methods (for secure card handling)
  createSetupIntent?(config: GatewayConfig, customerId?: string): Promise<Stripe.SetupIntent>;
  createACHSetupIntent?(config: GatewayConfig, customerId: string, instantOnly?: boolean): Promise<Stripe.SetupIntent>;
  createPaymentMethod?(config: GatewayConfig, paymentMethodData: Stripe.PaymentMethodCreateParams): Promise<GatewayObject>;
  confirmSetupIntent?(config: GatewayConfig, setupIntentId: string, paymentMethodId: string): Promise<Stripe.SetupIntent>;

  // Historical event replay (admin import tooling)
  listReplayEvents?(config: GatewayConfig, startDate: number, endDate: number): Promise<ReplayEvent[]>;
  importReplayEvent?(config: GatewayConfig, churchId: string, event: ReplayEvent, repos: Repos): Promise<void>;

  // Event logging
  // event is the raw webhook body (Buffer/string/object) or the charge result data.
  logEvent(churchId: string, event: unknown, eventData: GatewayObject, repos: Repos): Promise<void>;
  logDonation(config: GatewayConfig, churchId: string, eventData: GatewayObject, repos: Repos, status?: "pending" | "complete" | "failed"): Promise<GatewayDonationLogResult>;
  updateDonationStatus?(churchId: string, transactionId: string, status: "pending" | "complete" | "failed" | "refunded", repos: Repos): Promise<void>;
  // Re-charges a failed recurring payment; absent = the provider has no retry and the UI hides Retry.
  retryFailedPayment?(config: GatewayConfig, donation: { transactionId?: string }): Promise<{ success: boolean; error?: string }>;
  // Refund of a settled charge (full unless options.amount is set); absent = the provider has no refunds and the UI hides Refund.
  refundCharge?(config: GatewayConfig, transactionId: string, options?: RefundOptions): Promise<{ success: boolean; refundId?: string; error?: string }>;
}
