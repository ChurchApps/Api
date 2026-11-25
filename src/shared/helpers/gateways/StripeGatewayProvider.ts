import express from "express";
import Axios from "axios";
import Stripe from "stripe";
import { StripeHelper } from "../StripeHelper.js";
import { Environment } from "../Environment.js";
import type { Customer, PaymentDetails } from "../../../modules/giving/models/index.js";
import {
  IGatewayProvider, WebhookResult, ChargeResult, SubscriptionResult, GatewayConfig, ProviderCapabilities, WebhookEventClassification, ReplayEvent,
  GatewayObject, GatewayPaymentRequest, GatewaySubscriptionUpdate, GivingRepos, StripeEventObject, StripeEventRecord, NormalizedPaymentMethod,
  GatewayErrorMapping, GatewayAttachOptions, RefundOptions
} from "./IGatewayProvider.js";

// A charge awaiting 3DS carries what the client needs to finish authentication.
interface StripeChargeData extends GatewayObject {
  client_secret?: string;
  payment_intent_id?: string;
}

// PaymentDetails plus the PaymentIntent fields a charge may set.
interface StripePaymentData extends PaymentDetails {
  return_url?: string;
  payment_method_types?: string[];
  mandate?: string;
}

// Shape of a Stripe SDK error, as read by mapError.
interface StripeErrorLike {
  type?: string;
  code?: string;
}

const DONATION_EVENTS = ["charge.succeeded", "invoice.paid", "payment_intent.succeeded", "payment_intent.processing"];

export class StripeGatewayProvider implements IGatewayProvider {
  readonly name = "stripe";

  readonly capabilities: ProviderCapabilities = {
    supportsOneTimePayments: true,
    supportsSubscriptions: true,
    supportsVault: true,
    supportsACH: true,
    supportsRefunds: true,
    supportsPartialRefunds: false,
    supportsWebhooks: true,
    supportsOrders: false,
    supportedPaymentMethods: ["card", "ach_debit", "acss_debit", "link", "apple_pay", "google_pay"],
    supportedCurrencies: [
      "usd", "eur", "gbp", "cad", "aud", "jpy", "mxn", "nzd", "sgd", "inr"
    ],
    requiresPlansForSubscriptions: false,
    requiresCustomerForSubscription: true,
    supportsInstantCapture: true,
    supportsManualCapture: true,
    supportsSCA: true,
    maxRefundWindow: 180,
    minTransactionAmount: 50, // 50 cents
    maxTransactionAmount: 99999999, // $999,999.99
    notes: ["Supports ACH via Plaid or micro-deposits", "Ideal for card + bank payments"]
  };

  classifyWebhookEvent(eventType: string): WebhookEventClassification {
    // payment_intent.processing = ACH awaiting settlement; the rest are money-in-hand.
    if (DONATION_EVENTS.includes(eventType)) {
      return { action: "donation", status: eventType === "payment_intent.processing" ? "pending" : "complete" };
    }
    if (eventType === "invoice.payment_failed") return { action: "donation", status: "failed" };
    // A lost dispute takes the money back like a refund; verifyWebhookSignature drops won/other closes.
    if (eventType === "charge.refunded" || eventType === "charge.dispute.closed") return { action: "donation", status: "refunded" };
    if (eventType === "customer.subscription.deleted") return { action: "cancel-subscription" };
    return { action: "ignore" };
  }

  async createWebhookEndpoint(config: GatewayConfig, webhookUrl: string): Promise<{ id: string; secret?: string }> {
    const webhook = await StripeHelper.createWebhookEndpoint(config.privateKey, webhookUrl);
    return { id: webhook.id, secret: webhook.secret };
  }

  async deleteWebhooksByChurchId(config: GatewayConfig, churchId: string): Promise<void> {
    await StripeHelper.deleteWebhooksByChurchId(config.privateKey, churchId);
  }

  async verifyWebhookSignature(config: GatewayConfig, headers: express.Request["headers"], body: string | Buffer): Promise<WebhookResult> {
    try {
      const sig = headers["stripe-signature"]?.toString();
      // stripe-node verifies an HMAC keyed with "" too, so an unset secret would accept forged events.
      if (!sig || !config.webhookKey) {
        return { success: false, shouldProcess: false };
      }

      const stripeEvent = await StripeHelper.verifySignature(config.privateKey, { body }, sig, config.webhookKey);
      const eventData = stripeEvent.data.object as StripeEventObject;
      const subscriptionEvent = eventData.subscription || eventData.description?.toLowerCase().includes("subscription");

      // Skip processing subscription charge.succeeded events to avoid duplicates
      // Also skip payment_intent.succeeded for subscription invoices (handled by invoice.paid)
      let shouldProcess = true;
      // A charge made through a PaymentIntent is recorded from payment_intent.succeeded; processing
      // charge.succeeded too let the two concurrent deliveries both insert the gift.
      if (stripeEvent.type === "charge.succeeded" && (subscriptionEvent || eventData.payment_intent)) {
        shouldProcess = false;
      }
      if (stripeEvent.type === "payment_intent.succeeded" && eventData.invoice) {
        // This is a subscription payment - handled by invoice.paid
        shouldProcess = false;
      }
      if (stripeEvent.type === "charge.dispute.closed" && eventData.status !== "lost") shouldProcess = false;

      return {
        success: true,
        shouldProcess,
        eventType: stripeEvent.type,
        eventData,
        eventId: stripeEvent.id
      };
    } catch {
      return { success: false, shouldProcess: false };
    }
  }

  async processCharge(config: GatewayConfig, donationData: GatewayPaymentRequest): Promise<ChargeResult> {

    const currency = donationData?.currency || "usd";

    const paymentData: StripePaymentData = { amount: donationData.amount, currency, customer: donationData.customerId, metadata: { funds: JSON.stringify(donationData.funds), memo: donationData.notes } };

    if (donationData.type === "card") {
      paymentData.payment_method = donationData.id;
      paymentData.confirm = true;
      // Only use off_session for recurring/saved card payments, not for on-session donations
      // This allows 3DS authentication to work properly when the customer is present
      if (donationData.off_session === true) {
        paymentData.off_session = true;
      } else {
        // For on-session payments with 3DS, Stripe requires a return_url for redirect-based authentication
        const returnUrl = donationData.church?.churchURL || donationData.return_url;
        if (returnUrl) {
          paymentData.return_url = returnUrl;
        }
      }
    }
    if (donationData.type === "bank") {
      // Check if this is a new PaymentMethod (pm_xxx) or legacy Source (ba_xxx)
      if (donationData.id?.startsWith("pm_")) {
        // New PaymentMethod API flow - use Payment Intents
        paymentData.payment_method = donationData.id;
        const bankType = StripeHelper.bankMethodType(config.currency);
        paymentData.payment_method_types = [bankType];
        paymentData.confirm = true;
        paymentData.off_session = true;
        if (bankType === "acss_debit") paymentData.mandate = await StripeHelper.findAcssMandate(config.privateKey, donationData.customerId, donationData.id);
      } else {
        // Legacy Source-based flow (deprecated - will be removed after migration)
        paymentData.source = donationData.id;
      }
    }

    try {
      const result = await StripeHelper.donate(config.privateKey, paymentData);

      // Check if 3DS authentication is required
      // Only a PaymentIntent can be requires_action.
      const intent = result as Stripe.PaymentIntent;
      if (result?.status === "requires_action" && intent?.client_secret) {
        const data: StripeChargeData = {
          ...result,
          status: "requires_action",
          client_secret: intent.client_secret,
          payment_intent_id: result.id
        };
        return {
          success: true,
          transactionId: result?.id || "",
          data
        };
      }

      return {
        success: !!result && (result?.status === "succeeded" || result?.status === "processing"),
        transactionId: result?.id || "",
        data: result
      };
    } catch (err) {
      console.error("Stripe charge error:", (err as Error)?.message || err);
      return {
        success: false,
        transactionId: "",
        data: null,
        error: (err as Error)?.message || "Payment processing failed"
      };
    }
  }

  async createSubscription(config: GatewayConfig, subscriptionData: GatewayPaymentRequest): Promise<SubscriptionResult> {
    const paymentData = {
      payment_method_id: subscriptionData.id,
      amount: subscriptionData.amount,
      currency: subscriptionData.currency,
      customer: subscriptionData.customerId,
      type: subscriptionData.type,
      billing_cycle_anchor: subscriptionData.billing_cycle_anchor,
      proration_behavior: subscriptionData.proration_behavior,
      interval: subscriptionData.interval as Stripe.SubscriptionCreateParams.Item.PriceData.Recurring,
      metadata: { memo: subscriptionData.notes },
      productId: config.productId
    };

    const result = await StripeHelper.createSubscription(config.privateKey, paymentData);
    return {
      success: !!result,
      subscriptionId: result?.id || "",
      data: result
    };
  }

  async updateSubscription(config: GatewayConfig, subscriptionData: GatewaySubscriptionUpdate): Promise<SubscriptionResult> {
    const result = await StripeHelper.updateSubscription(config.privateKey, subscriptionData);
    return {
      success: !!result,
      subscriptionId: result?.id || "",
      data: result
    };
  }

  async cancelSubscription(config: GatewayConfig, subscriptionId: string): Promise<void> {
    await StripeHelper.deleteSubscription(config.privateKey, subscriptionId);
  }

  async pauseSubscription(config: GatewayConfig, subscriptionId: string): Promise<void> {
    await StripeHelper.pauseSubscription(config.privateKey, subscriptionId);
  }

  async resumeSubscription(config: GatewayConfig, subscriptionId: string): Promise<void> {
    await StripeHelper.resumeSubscription(config.privateKey, subscriptionId);
  }

  async calculateFees(amount: number, churchId: string, currency: string = "USD", paymentType?: "card" | "bank"): Promise<number> {
    let customFixedFee: number | null = null;
    let customPercentFee: number | null = null;
    let customMaxFee: number | null = null;

    if (churchId) {
      const response = await Axios.get(Environment.membershipApi + "/settings/public/" + churchId);
      const data = response.data;
      if (paymentType === "bank") {
        if (data?.flatRateACH != null && data.flatRateACH !== "") customPercentFee = +data.flatRateACH / 100;
        if (data?.hardLimitACH != null && data.hardLimitACH !== "") customMaxFee = +data.hardLimitACH;
      } else {
        if (data?.flatRateCC && data.flatRateCC !== null && data.flatRateCC !== undefined && data.flatRateCC !== "") {
          customFixedFee = +data.flatRateCC;
        }
        if (data?.transFeeCC && data.transFeeCC !== null && data.transFeeCC !== undefined && data.transFeeCC !== "") {
          customPercentFee = +data.transFeeCC / 100;
        }
      }
    }

    if (paymentType === "bank") {
      // Stripe PAD (CAD) is 1% + C$0.40 capped at C$5; ACH is 0.8% capped at $5.
      const isPad = currency.toLowerCase() === "cad";
      const fixedPercent = customPercentFee ?? (isPad ? 0.01 : 0.008);
      const fixedFee = isPad ? 0.40 : 0;
      const fixedMaxFee = customMaxFee ?? 5.0;
      const fee = Math.round(((amount + fixedFee) / (1 - fixedPercent) - amount) * 100) / 100;
      return Math.min(fee, fixedMaxFee);
    }

    // Stripe currency-specific fees for card payments
    const STRIPE_FEES: Record<string, { percent: number; fixed: number }> = {
      usd: { percent: 0.029, fixed: 0.30 },
      eur: { percent: 0.029, fixed: 0.25 },
      gbp: { percent: 0.029, fixed: 0.20 },
      cad: { percent: 0.029, fixed: 0.30 },
      aud: { percent: 0.029, fixed: 0.30 },
      inr: { percent: 0.029, fixed: 3.00 },
      jpy: { percent: 0.029, fixed: 30 },
      sgd: { percent: 0.029, fixed: 0.50 },
      hkd: { percent: 0.029, fixed: 2.35 },
      sek: { percent: 0.029, fixed: 2.50 },
      nok: { percent: 0.029, fixed: 2.00 },
      dkk: { percent: 0.029, fixed: 1.80 },
      chf: { percent: 0.029, fixed: 0.30 },
      mxn: { percent: 0.029, fixed: 3.00 },
      brl: { percent: 0.039, fixed: 0.50 }
    };

    const currencyKey = currency.toLowerCase();
    const stripeFee = STRIPE_FEES[currencyKey] || STRIPE_FEES.usd; // Default to USD if currency not found
    const fixedFee = customFixedFee ?? stripeFee.fixed;
    const fixedPercent = customPercentFee ?? stripeFee.percent;

    return Math.round(((amount + fixedFee) / (1 - fixedPercent) - amount) * 100) / 100;
  }

  async createProduct(config: GatewayConfig, churchId: string): Promise<string> {
    return await StripeHelper.createProduct(config.privateKey, churchId);
  }

  async logEvent(churchId: string, event: Buffer | string | StripeEventRecord, eventData: StripeEventObject, repos: GivingRepos): Promise<void> {
    // The webhook route hands over the raw body (kept raw for signature checks); without parsing, providerId/eventType save as NULL.
    const parsed = Buffer.isBuffer(event) || typeof event === "string" ? JSON.parse(event.toString()) : event;
    await StripeHelper.logEvent(churchId, parsed, eventData, repos);
  }

  async logDonation(config: GatewayConfig, churchId: string, eventData: StripeEventObject, repos: GivingRepos, status: "pending" | "complete" | "failed" = "complete") {
    return await StripeHelper.logDonation(config.privateKey, churchId, eventData, repos, status);
  }

  async updateDonationStatus(churchId: string, transactionId: string, status: "pending" | "complete" | "failed" | "refunded", repos: GivingRepos): Promise<void> {
    await StripeHelper.updateDonationStatus(churchId, transactionId, status, repos);
  }

  async retryFailedPayment(config: GatewayConfig, donation: { transactionId?: string }): Promise<{ success: boolean; error?: string }> {
    const invoiceId = donation.transactionId || "";
    if (!invoiceId.startsWith("in_")) return { success: false, error: "Only failed subscription invoices can be retried" };
    try {
      const invoice = await StripeHelper.payInvoice(config.privateKey, invoiceId);
      if (invoice.status === "paid") return { success: true };
      return { success: false, error: `Invoice is ${invoice.status}` };
    } catch (e) {
      return { success: false, error: (e as Error)?.message || "Retry failed" };
    }
  }

  async refundCharge(config: GatewayConfig, transactionId: string, options?: RefundOptions): Promise<{ success: boolean; refundId?: string; error?: string }> {
    const id = transactionId || "";
    // A donation's transactionId is whichever id the charge path stored, so pass the matching Stripe key.
    const target = id.startsWith("ch_") ? { charge: id } : id.startsWith("pi_") ? { payment_intent: id } : null;
    if (!target) return { success: false, error: "Only card and bank charges can be refunded" };
    const params: Stripe.RefundCreateParams = { ...target };
    if (options?.amount !== undefined) {
      const minor = StripeHelper.toMinorUnits(options.amount, options.currency || config.currency);
      if (!(minor > 0)) return { success: false, error: "Refund amount must be greater than zero" };
      params.amount = minor;
    }
    try {
      const refund = await StripeHelper.createRefund(config.privateKey, params, options?.idempotencyKey);
      if (refund.status === "failed" || refund.status === "canceled") return { success: false, error: `Refund ${refund.status}` };
      return { success: true, refundId: refund.id };
    } catch (e) {
      return { success: false, error: (e as Error)?.message || "Refund failed" };
    }
  }

  // Customer management
  async createCustomer(config: GatewayConfig, email: string, name: string): Promise<string> {
    return await StripeHelper.createCustomer(config.privateKey, email, name);
  }

  async getCustomerCreatedAt(config: GatewayConfig, customerId: string): Promise<Date | null> {
    try {
      const customer: Stripe.Customer | Stripe.DeletedCustomer = await new Stripe(config.privateKey, { apiVersion: "2025-02-24.acacia" }).customers.retrieve(customerId);
      // Past the deleted check it is a live Customer.
      const created = (customer as Stripe.Customer)?.created;
      return customer && !customer.deleted && created ? new Date(created * 1000) : null;
    } catch {
      return null;
    }
  }

  async getCustomerSubscriptions(config: GatewayConfig, customerId: string) {
    return await StripeHelper.getCustomerSubscriptions(config.privateKey, customerId);
  }

  async getCustomerPaymentMethods(config: GatewayConfig, customer: Customer) {
    return await StripeHelper.getCustomerPaymentMethods(config.privateKey, customer);
  }

  async listNormalizedPaymentMethods(config: GatewayConfig, customer: Customer, _repos: GivingRepos): Promise<NormalizedPaymentMethod[]> {
    const raw = await this.getCustomerPaymentMethods(config, customer);
    const normalized: NormalizedPaymentMethod[] = [];
    if (!Array.isArray(raw)) return normalized;
    for (const customerData of raw) {
      for (const pm of customerData.cards?.data || []) {
        normalized.push({
          id: pm.id,
          type: "card",
          provider: this.name,
          name: pm.card?.brand || "Card",
          last4: pm.card?.last4,
          // Unexpanded list results carry the customer id string.
          customerId: (pm.customer as string) || customerData.customer?.id,
          gatewayId: config.gatewayId,
          status: "active"
        });
      }
      for (const bank of customerData.banks?.data || []) {
        normalized.push({
          id: bank.id,
          type: "bank",
          provider: this.name,
          name: bank.us_bank_account?.bank_name || bank.acss_debit?.bank_name || "Bank Account",
          last4: bank.us_bank_account?.last4 || bank.acss_debit?.last4,
          customerId: (bank.customer as string) || customerData.customer?.id,
          gatewayId: config.gatewayId,
          status: "active"
        });
      }
      // listSources was filtered to object: "bank_account".
      for (const bank of (customerData.legacyBanks?.data || []) as Stripe.BankAccount[]) {
        normalized.push({
          id: bank.id,
          type: "bank",
          provider: this.name,
          name: "Bank Account",
          last4: bank.last4,
          customerId: (bank.customer as string) || customerData.customer?.id,
          gatewayId: config.gatewayId,
          status: bank.status || "new",
          isLegacy: true
        });
      }
    }
    return normalized;
  }

  validateAttachToken(id: string): string | null {
    return (!id || !id.startsWith("pm_")) ? "Invalid payment method ID format" : null;
  }

  ownsPaymentMethodId(id: string): boolean {
    return id.startsWith("pm_") || id.startsWith("ba_");
  }

  async verifyMethodOwnership(config: GatewayConfig, paymentMethodId: string, customerId: string, repos: GivingRepos): Promise<boolean> {
    try {
      const customerData = await repos.customer.load(config.churchId, customerId);
      const customer = customerData ? repos.customer.convertToModel(config.churchId, customerData) : null;
      if (!customer) return false;
      const pmList = await this.getCustomerPaymentMethods(config, customer);
      const ids = new Set<string>();
      for (const cd of (Array.isArray(pmList) ? pmList : [])) {
        for (const coll of [cd?.cards?.data, cd?.banks?.data, cd?.legacyBanks?.data]) {
          for (const pm of (coll || [])) ids.add(String(pm.id));
        }
      }
      return ids.has(String(paymentMethodId));
    } catch (e) {
      console.error("[PM Delete] Stripe ownership verification failed:", e);
      return false;
    }
  }

  async activeSubscriptionIdsUsingMethod(config: GatewayConfig, paymentMethodId: string, customerId: string): Promise<string[]> {
    return await StripeHelper.getActiveSubscriptionIdsUsingMethod(config.privateKey, customerId, paymentMethodId);
  }

  async deletePaymentMethod(config: GatewayConfig, paymentMethodId: string, customerId: string, _repos: GivingRepos): Promise<void> {
    if (paymentMethodId.startsWith("ba_")) await this.deleteBankAccount(config, customerId, paymentMethodId);
    else await this.detachPaymentMethod(config, paymentMethodId);
  }

  mapError(err: unknown): GatewayErrorMapping | null {
    const e = err as StripeErrorLike;
    if (e?.type !== "StripeInvalidRequestError") return null;
    if (e.code === "resource_missing") {
      return { status: 404, body: { error: "Payment method not found. Please create a new payment method.", code: "payment_method_not_found" } };
    }
    if (e.code === "parameter_invalid_empty") {
      return { status: 400, body: { error: "Invalid payment method parameters", code: "invalid_parameters" } };
    }
    return null;
  }

  async listReplayEvents(config: GatewayConfig, startDate: number, endDate: number): Promise<ReplayEvent[]> {
    const events = await StripeHelper.listEvents(config.privateKey, {
      startDate,
      endDate,
      // Include payment_intent.succeeded for new ACH payments using Payment Intents API
      types: ["charge.succeeded", "invoice.paid", "payment_intent.succeeded"]
    });
    return events.map((stripeEvent) => {
      const event = stripeEvent as StripeEventRecord;
      const eventData = event.data.object;
      const isSubscriptionEvent = eventData.subscription || eventData.description?.toLowerCase().includes("subscription");
      return {
        id: event.id,
        type: event.type,
        created: new Date(event.created * 1000),
        amount: (eventData.amount || eventData.amount_paid || 0) / 100,
        customerId: eventData.customer || "",
        raw: event,
        // Basil-era API versions dropped PaymentIntent.invoice, so the description is the only subscription marker left on a PI.
        skipReason: (event.type === "charge.succeeded" && isSubscriptionEvent) || (event.type === "payment_intent.succeeded" && (eventData.invoice || isSubscriptionEvent))
          ? "Subscription event - handled by invoice.paid"
          : undefined
      };
    });
  }

  async importReplayEvent(config: GatewayConfig, churchId: string, event: ReplayEvent, repos: GivingRepos): Promise<void> {
    const eventData = event.raw.data.object;
    await StripeHelper.logEvent(churchId, event.raw, eventData, repos);
    await StripeHelper.logDonation(config.privateKey, churchId, eventData, repos);
  }

  // Payment method management
  async attachPaymentMethod(config: GatewayConfig, paymentMethodId: string, options: GatewayAttachOptions) {
    return await StripeHelper.attachPaymentMethod(config.privateKey, paymentMethodId, options as Stripe.PaymentMethodAttachParams);
  }

  async detachPaymentMethod(config: GatewayConfig, paymentMethodId: string) {
    return await StripeHelper.detachPaymentMethod(config.privateKey, paymentMethodId);
  }

  async updateCard(config: GatewayConfig, paymentMethodId: string, cardData: Stripe.PaymentMethodUpdateParams) {
    return await StripeHelper.updateCard(config.privateKey, paymentMethodId, cardData);
  }

  async createBankAccount(config: GatewayConfig, customerId: string, options: Stripe.CustomerCreateSourceParams) {
    return await StripeHelper.createBankAccount(config.privateKey, customerId, options);
  }

  async updateBank(config: GatewayConfig, paymentMethodId: string, bankData: Stripe.CustomerUpdateSourceParams, customerId: string) {
    return await StripeHelper.updateBank(config.privateKey, paymentMethodId, bankData, customerId);
  }

  async verifyBank(config: GatewayConfig, paymentMethodId: string, amountData: Stripe.CustomerVerifySourceParams, customerId: string) {
    return await StripeHelper.verifyBank(config.privateKey, paymentMethodId, amountData, customerId);
  }

  async deleteBankAccount(config: GatewayConfig, customerId: string, bankAccountId: string) {
    return await StripeHelper.deleteBankAccount(config.privateKey, customerId, bankAccountId);
  }

  async addCard(config: GatewayConfig, customerId: string, cardData: string | Stripe.CustomerCreateSourceParams) {
    return await StripeHelper.addCard(config.privateKey, customerId, cardData);
  }

  async getCharge(config: GatewayConfig, chargeId: string) {
    return await StripeHelper.getCharge(config.privateKey, chargeId);
  }

  // Token-based payment methods
  async createSetupIntent(config: GatewayConfig, customerId?: string) {
    return await StripeHelper.createSetupIntent(config.privateKey, customerId);
  }

  // ACH SetupIntent for Financial Connections
  async createACHSetupIntent(config: GatewayConfig, customerId: string, instantOnly = false) {
    return await StripeHelper.createACHSetupIntent(config.privateKey, customerId, config.currency, instantOnly);
  }

  async createPaymentMethod(config: GatewayConfig, paymentMethodData: Stripe.PaymentMethodCreateParams) {
    return await StripeHelper.createPaymentMethod(config.privateKey, paymentMethodData);
  }

  async confirmSetupIntent(config: GatewayConfig, setupIntentId: string, paymentMethodId: string) {
    return await StripeHelper.confirmSetupIntent(config.privateKey, setupIntentId, paymentMethodId);
  }

  async registerPaymentMethodDomain(config: GatewayConfig, domainName: string): Promise<{ id: string; created: boolean }> {
    return await StripeHelper.registerPaymentMethodDomain(config.privateKey, domainName);
  }
}
