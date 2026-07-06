import express from "express";

export interface WebhookResult {
  success: boolean;
  shouldProcess: boolean;
  eventType?: string;
  eventData?: any;
  eventId?: string;
}

export interface WebhookEventClassification {
  action: "donation" | "cancel-subscription" | "ignore";
  status?: "pending" | "complete";
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
  raw: any;
  skipReason?: string;
}

export interface ChargeResult {
  success: boolean;
  transactionId: string;
  data: any;
  error?: string;
}

export interface SubscriptionResult {
  success: boolean;
  subscriptionId: string;
  data: any;
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
  verifyWebhookSignature(config: GatewayConfig, headers: express.Request["headers"], body: any): Promise<WebhookResult>;
  // Semantic meaning of a verified webhook event; unknown events are "ignore".
  classifyWebhookEvent?(eventType: string): WebhookEventClassification;

  // Payment processing
  processCharge(config: GatewayConfig, donationData: any): Promise<ChargeResult>;
  // Provider-specific request massaging before processCharge/createSubscription
  // (e.g. saved-method vaulting, customer reuse). May mutate the passed data.
  prepareCharge?(config: GatewayConfig, donationData: any, repos: any): Promise<void>;
  prepareSubscription?(config: GatewayConfig, subscriptionData: any, person: any, repos: any): Promise<void>;
  // Post-subscription persistence (e.g. store the gateway-created customer); returns the customerId to keep locally.
  finalizeSubscription?(config: GatewayConfig, result: SubscriptionResult, subscriptionData: any, person: any, repos: any): Promise<string | undefined>;
  createSubscription(config: GatewayConfig, subscriptionData: any): Promise<SubscriptionResult>;
  updateSubscription(config: GatewayConfig, subscriptionData: any): Promise<SubscriptionResult>;
  cancelSubscription(config: GatewayConfig, subscriptionId: string, reason?: string): Promise<void>;
  pauseSubscription(config: GatewayConfig, subscriptionId: string): Promise<void>;
  resumeSubscription(config: GatewayConfig, subscriptionId: string): Promise<void>;

  // Fee calculation
  calculateFees(amount: number, churchId: string, currency?: string, paymentType?: "card" | "bank"): Promise<number>;

  // Product/service management
  createProduct?(config: GatewayConfig, churchId: string): Promise<string>;

  // Customer management. options.personId lets providers enrich the record (e.g. billing address).
  createCustomer?(config: GatewayConfig, email: string, name: string, options?: { personId?: string }): Promise<string>;
  getCustomerSubscriptions?(config: GatewayConfig, customerId: string): Promise<any>;
  // Subscriptions in the common UI shape ({ id, status, billing_cycle_anchor, default_payment_method, plan }).
  listNormalizedSubscriptions?(config: GatewayConfig, customerId: string): Promise<any[]>;
  getSubscription?(config: GatewayConfig, subscriptionId: string): Promise<any>;
  getCustomerPaymentMethods?(config: GatewayConfig, customer: any): Promise<any>;

  // Payment method management
  // Normalized saved methods for the member UI: { id, type, provider, name, last4?, email?, customerId, gatewayId, status? }
  listNormalizedPaymentMethods?(config: GatewayConfig, customer: any, repos: any): Promise<any[]>;
  // Returns an error message when an attach token is malformed for this provider.
  validateAttachToken?(id: string): string | null;
  // Resolves the provider-scoped customer id to attach to (may ignore the request-supplied one).
  resolveCustomerForAttach?(config: GatewayConfig, personId: string | undefined, requestCustomerId: string | undefined, repos: any): Promise<string | undefined>;
  buildAttachOptions?(customerId: string, tokenId: string, body: any): any;
  // Local gatewayPaymentMethods display record to persist after attach; null = none.
  buildLocalMethodRecord?(pm: any, body: any, tokenId: string): { methodType: string; displayName: string; metadata: any } | null;
  // True when an opaque payment-method id is in this provider's id format.
  ownsPaymentMethodId?(id: string): boolean;
  // Confirms the method belongs to the customer; providers without this get a local-record check.
  verifyMethodOwnership?(config: GatewayConfig, paymentMethodId: string, customerId: string, repos: any): Promise<boolean>;
  // Full provider-side delete (may cascade schedules); default is detachPaymentMethod.
  deletePaymentMethod?(config: GatewayConfig, paymentMethodId: string, customerId: string, repos: any): Promise<void>;
  // Verifies a gateway-created subscription belongs to the person (no local row exists).
  verifySubscriptionOwnership?(config: GatewayConfig, subscriptionId: string, personId: string, repos: any): Promise<boolean>;
  // Maps a provider SDK error to an HTTP response; null falls through to generic handling.
  mapError?(e: any): { status: number; body: any } | null;
  attachPaymentMethod?(config: GatewayConfig, paymentMethodId: string, options: any): Promise<any>;
  detachPaymentMethod?(config: GatewayConfig, paymentMethodId: string): Promise<any>;
  addCard?(config: GatewayConfig, customerId: string, cardData: any): Promise<any>;
  updateCard?(config: GatewayConfig, paymentMethodId: string, cardData: any): Promise<any>;
  createBankAccount?(config: GatewayConfig, customerId: string, options: any): Promise<any>;
  updateBank?(config: GatewayConfig, paymentMethodId: string, bankData: any, customerId: string): Promise<any>;
  verifyBank?(config: GatewayConfig, paymentMethodId: string, amountData: any, customerId: string): Promise<any>;
  deleteBankAccount?(config: GatewayConfig, customerId: string, bankAccountId: string): Promise<any>;

  // Provider-specific functionality
  generateClientToken?(config: GatewayConfig): Promise<string>;
  createOrder?(config: GatewayConfig, orderData: any): Promise<any>;

  // Subscription plan management
  createSubscriptionPlan?(config: GatewayConfig, planData: any): Promise<string>;
  createSubscriptionWithPlan?(config: GatewayConfig, subscriptionData: any): Promise<SubscriptionResult>;

  // Transaction lookup
  getCharge?(config: GatewayConfig, chargeId: string): Promise<any>;

  // Token-based payment methods (for secure card handling)
  createSetupIntent?(config: GatewayConfig, customerId?: string): Promise<any>;
  createACHSetupIntent?(config: GatewayConfig, customerId: string): Promise<any>;
  createPaymentMethod?(config: GatewayConfig, paymentMethodData: any): Promise<any>;
  confirmSetupIntent?(config: GatewayConfig, setupIntentId: string, paymentMethodId: string): Promise<any>;

  // Historical event replay (admin import tooling)
  listReplayEvents?(config: GatewayConfig, startDate: number, endDate: number): Promise<ReplayEvent[]>;
  importReplayEvent?(config: GatewayConfig, churchId: string, event: ReplayEvent, repos: any): Promise<void>;

  // Event logging
  logEvent(churchId: string, event: any, eventData: any, repos: any): Promise<void>;
  logDonation(config: GatewayConfig, churchId: string, eventData: any, repos: any, status?: "pending" | "complete"): Promise<any>;
  updateDonationStatus?(churchId: string, transactionId: string, status: "pending" | "complete" | "failed", repos: any): Promise<void>;
}
