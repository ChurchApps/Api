import express from "express";
import Axios from "axios";
import crypto from "crypto";
import { Environment } from "../Environment.js";
import { Donation, DonationBatch, EventLog, FundDonation } from "../../../modules/giving/models/index.js";
import type { Customer } from "../../../modules/giving/models/index.js";
import {
  IGatewayProvider, WebhookResult, ChargeResult, SubscriptionResult, GatewayConfig, ProviderCapabilities, WebhookEventClassification, GatewayPaymentRequest,
  GatewaySubscriptionUpdate, GatewayPerson, GatewayInterval, GivingRepos, GatewayObject, GatewayWebhookData, GatewayAttachOptions, GatewayAttachBody,
  LocalMethodRecord, NormalizedPaymentMethod, NormalizedSubscription, FundAllocation
} from "./IGatewayProvider.js";

interface PaystackAuthorization {
  authorization_code?: string;
  reusable?: boolean;
  channel?: string;
  brand?: string;
  card_type?: string;
  last4?: string;
  bank?: string;
  exp_month?: string;
  exp_year?: string;
}

// A Paystack transaction (verify/charge_authorization or webhook data), plus fields the charge route merges in.
interface PaystackTx extends GatewayWebhookData {
  reference?: string;
  amount?: number;
  currency?: string;
  channel?: string;
  gateway_response?: string;
  paid_at?: string;
  created_at?: string;
  subscription_code?: string;
  authorization?: PaystackAuthorization;
  customer?: { customer_code?: string };
  metadata?: { funds?: FundAllocation[]; personId?: string };
  providerEventId?: string | number;
  saveCard?: boolean;
  person?: GatewayPerson;
  funds?: FundAllocation[];
  notes?: string;
  anonymous?: boolean;
}

interface PaystackWebhookBody {
  event?: string;
  data?: PaystackTx;
}

interface PaystackSubscription extends GatewayObject {
  subscription_code?: string;
  email_token?: string;
  amount?: number;
  next_payment_date?: string;
  createdAt?: string;
  customer?: { customer_code?: string };
  authorization?: PaystackAuthorization;
  plan?: { amount?: number; interval?: string };
}

// createSubscription's result data; finalizeSubscription reads customerId and initialTx back.
interface PaystackSubscriptionData extends PaystackSubscription {
  customerId?: string;
  initialTx?: PaystackTx;
}

interface PaystackCustomer {
  customer_code?: string;
  subscriptions?: PaystackSubscription[];
}

interface PaystackSavedMethod extends PaystackAuthorization, GatewayObject {
  customer_code?: string;
}

interface PaystackError {
  message?: string;
  response?: { data?: { message?: string } };
}

const PAYSTACK_API = "https://api.paystack.co";

// Zero-decimal handling isn't needed: every Paystack currency uses 2 subunits.
const toSubunits = (amount: number) => Math.round(Number(amount) * 100);
const fromSubunits = (amount: number) => Math.round(Number(amount || 0)) / 100;

// A client-supplied reference only proves *a* payment; it must be for the amount and currency being recorded.
const paystackTxMismatch = (tx: PaystackTx, amount: number, currency: string): string | null => {
  if (Number(tx?.amount) !== toSubunits(amount)) return "Payment amount does not match the donation amount";
  if (currency && tx?.currency && String(tx.currency).toLowerCase() !== String(currency).toLowerCase()) return "Payment currency does not match the donation currency";
  return null;
};

// Local-card defaults per currency; church overrides come from flatRateCC/transFeeCC settings.
const DEFAULT_FEES: Record<string, { percent: number; fixed: number; cap?: number; waiveBelow?: number }> = {
  ngn: { percent: 0.015, fixed: 100, cap: 2000, waiveBelow: 2500 },
  ghs: { percent: 0.0195, fixed: 0 },
  zar: { percent: 0.029, fixed: 1 },
  kes: { percent: 0.029, fixed: 0 },
  xof: { percent: 0.032, fixed: 0 },
  usd: { percent: 0.039, fixed: 0 }
};

export class PaystackGatewayProvider implements IGatewayProvider {
  readonly name = "paystack";
  // The popup charges before /donate/charge is called; verify() confirms money-in-hand.
  readonly logsDonationsImmediately = true;

  readonly capabilities: ProviderCapabilities = {
    supportsOneTimePayments: true,
    supportsSubscriptions: true,
    supportsVault: true,
    supportsACH: false,
    supportsRefunds: false,
    supportsPartialRefunds: false,
    supportsWebhooks: true,
    supportsOrders: false,
    supportsInstantCapture: true,
    supportsManualCapture: false,
    supportsSCA: true,
    requiresPlansForSubscriptions: true,
    requiresCustomerForSubscription: true,
    supportedPaymentMethods: ["card", "mobile_money", "bank", "bank_transfer", "ussd"],
    supportedCurrencies: ["ngn", "ghs", "zar", "kes", "xof", "usd"],
    minTransactionAmount: 100,
    notes: ["Webhook URL must be pasted into the Paystack dashboard", "Mobile money authorizations are not reusable for recurring gifts"]
  };

  private async api<T = PaystackTx>(config: GatewayConfig, method: "get" | "post", path: string, body?: unknown): Promise<T> {
    const resp = await Axios.request({
      method,
      url: PAYSTACK_API + path,
      data: body,
      headers: { Authorization: `Bearer ${config.privateKey}`, "Content-Type": "application/json" }
    });
    if (resp.data?.status === false) throw new Error(resp.data?.message || "Paystack request failed");
    return resp.data?.data;
  }

  private errorMessage(err: unknown): string {
    const e = err as PaystackError;
    return e?.response?.data?.message || e?.message || "Paystack request failed";
  }

  classifyWebhookEvent(eventType: string): WebhookEventClassification {
    if (eventType === "charge.success") return { action: "donation", status: "complete" };
    if (eventType === "subscription.disable" || eventType === "subscription.not_renew") return { action: "cancel-subscription" };
    return { action: "ignore" };
  }

  // Paystack has no webhook API; the church pastes the URL into its dashboard.
  async createWebhookEndpoint(_config: GatewayConfig, _webhookUrl: string): Promise<{ id: string }> {
    return { id: "" };
  }

  async deleteWebhooksByChurchId(_config: GatewayConfig, _churchId: string): Promise<void> {}

  async verifyWebhookSignature(config: GatewayConfig, headers: express.Request["headers"], body: string | Buffer | PaystackWebhookBody): Promise<WebhookResult> {
    const signature = String(headers["x-paystack-signature"] || "");
    if (!config.privateKey || !signature) return { success: false, shouldProcess: false };
    const rawBody = typeof body === "string" ? body : Buffer.isBuffer(body) ? body.toString("utf8") : JSON.stringify(body ?? {});
    const expected = crypto.createHmac("sha512", config.privateKey).update(rawBody).digest("hex");
    if (expected.length !== signature.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
      return { success: false, shouldProcess: false };
    }
    const parsed: PaystackWebhookBody = typeof body === "string" ? JSON.parse(body) : Buffer.isBuffer(body) ? JSON.parse(body.toString("utf8")) : body;
    const data = parsed?.data || {};
    const eventType = String(parsed?.event || "");
    // Controllers key donations on reference and subscriptions on subscription_code; Paystack's numeric data.id is neither.
    const id = eventType.startsWith("subscription.") ? data.subscription_code : data.reference;
    const eventData: PaystackTx = { ...data, id, providerEventId: data.id };
    return {
      success: true,
      shouldProcess: true,
      eventType,
      eventData,
      eventId: `${eventType}:${data.id ?? data.reference ?? data.subscription_code ?? ""}`
    };
  }

  // The popup already charged; the "token" is the transaction reference to verify.
  async processCharge(config: GatewayConfig, donationData: GatewayPaymentRequest): Promise<ChargeResult> {
    try {
      let tx: PaystackTx;
      if (donationData.paymentMethodId) {
        tx = await this.api(config, "post", "/transaction/charge_authorization", {
          authorization_code: donationData.paymentMethodId,
          email: donationData.person?.email || donationData.email,
          amount: toSubunits(donationData.amount),
          currency: String(donationData.currency || "").toUpperCase() || undefined,
          metadata: { funds: donationData.funds, personId: donationData.person?.id }
        });
      } else {
        tx = await this.api(config, "get", `/transaction/verify/${encodeURIComponent(donationData.id || "")}`);
      }
      if (tx?.status !== "success") {
        return { success: false, transactionId: "", data: { error: tx?.gateway_response || "Payment was not successful" } };
      }
      const mismatch = donationData.paymentMethodId ? null : paystackTxMismatch(tx, donationData.amount, donationData.currency);
      if (mismatch) return { success: false, transactionId: "", data: { error: mismatch } };
      const data: PaystackTx = { ...tx, status: "succeeded", saveCard: !!donationData.saveCard, alreadyRecorded: !!donationData.alreadyRecorded };
      return {
        success: true,
        transactionId: tx.reference,
        data
      };
    } catch (e) {
      console.error("Paystack processCharge error:", this.errorMessage(e));
      return { success: false, transactionId: "", data: { error: this.errorMessage(e) } };
    }
  }

  // Saved methods arrive as AUTH_ codes in `id`; move them where processCharge expects them.
  async prepareCharge(config: GatewayConfig, donationData: GatewayPaymentRequest, repos: GivingRepos): Promise<void> {
    if (donationData.id && !donationData.paymentMethodId && this.ownsPaymentMethodId(String(donationData.id))) {
      donationData.paymentMethodId = String(donationData.id);
      delete donationData.id;
    }
    // A reference already on file (replay, or the webhook got there first) must not log a second donation
    if (!donationData.paymentMethodId && donationData.id) {
      donationData.alreadyRecorded = !!(await repos.donation.loadByTransactionId(config.churchId, String(donationData.id)));
    }
  }

  ownsPaymentMethodId(id: string): boolean {
    return /^AUTH_/.test(id);
  }

  async prepareSubscription(config: GatewayConfig, subscriptionData: GatewayPaymentRequest, person: GatewayPerson, repos: GivingRepos): Promise<void> {
    if (person?.id && !subscriptionData.customerId) {
      const existing = await repos.customer.loadByPersonAndProvider(config.churchId, person.id, this.name);
      if (existing?.id) subscriptionData.customerId = existing.id;
    }
  }

  private planInterval(interval: GatewayInterval | undefined): string {
    const unit = interval?.interval || "month";
    const count = Number(interval?.interval_count || 1);
    if (unit === "week" && count === 1) return "weekly";
    if (unit === "month" && count === 1) return "monthly";
    if (unit === "month" && count === 3) return "quarterly";
    if (unit === "month" && count === 6) return "biannually";
    if (unit === "year" && count === 1) return "annually";
    throw new Error(`Paystack does not support a ${count} ${unit} interval`);
  }

  private anchorDate(anchor: number | undefined): Date {
    let ms = Number(anchor || Date.now());
    if (ms < 10000000000) ms *= 1000;
    return new Date(ms);
  }

  private startsInFuture(anchor: number | undefined): boolean {
    return this.anchorDate(anchor).toISOString().slice(0, 10) > new Date().toISOString().slice(0, 10);
  }

  private nextChargeDate(anchor: number | undefined, interval: GatewayInterval | undefined): Date {
    if (this.startsInFuture(anchor)) return this.anchorDate(anchor);
    const next = new Date();
    const unit = interval?.interval || "month";
    const count = Number(interval?.interval_count || 1);
    if (unit === "week") next.setDate(next.getDate() + 7 * count);
    else if (unit === "year") next.setFullYear(next.getFullYear() + count);
    else next.setMonth(next.getMonth() + count);
    return next;
  }

  // Popup already took the first gift; verify it, then schedule the rest on a plan.
  async createSubscription(config: GatewayConfig, subscriptionData: GatewayPaymentRequest): Promise<SubscriptionResult> {
    try {
      const saved = subscriptionData.paymentMethodId || (this.ownsPaymentMethodId(String(subscriptionData.id || "")) ? subscriptionData.id : null);
      let authorization: PaystackAuthorization;
      let customerCode: string;
      let initialTx: PaystackTx = null;
      if (saved) {
        authorization = { authorization_code: saved, reusable: true };
        customerCode = subscriptionData.customerId;
        if (!customerCode) return { success: false, subscriptionId: "", data: { error: "No saved customer for this payment method" } };
        // A saved method has no popup charge behind it; take the first gift now unless the schedule starts later.
        if (!this.startsInFuture(subscriptionData.billing_cycle_anchor)) {
          initialTx = await this.api(config, "post", "/transaction/charge_authorization", {
            authorization_code: saved,
            email: subscriptionData.email || subscriptionData.person?.email,
            amount: toSubunits(subscriptionData.amount),
            currency: String(subscriptionData.currency || "").toUpperCase() || undefined,
            metadata: { funds: subscriptionData.funds, personId: subscriptionData.person?.id }
          });
          if (initialTx?.status !== "success") return { success: false, subscriptionId: "", data: { error: initialTx?.gateway_response || "Payment was not successful" } };
        }
      } else {
        initialTx = await this.api(config, "get", `/transaction/verify/${encodeURIComponent(subscriptionData.id || "")}`);
        if (initialTx?.status !== "success") return { success: false, subscriptionId: "", data: { error: initialTx?.gateway_response || "Payment was not successful" } };
        const mismatch = paystackTxMismatch(initialTx, subscriptionData.amount, subscriptionData.currency);
        if (mismatch) return { success: false, subscriptionId: "", data: { error: mismatch } };
        authorization = initialTx.authorization;
        customerCode = initialTx.customer?.customer_code;
      }
      if (!authorization?.reusable) {
        return { success: false, subscriptionId: "", data: { error: "This payment method cannot be reused for recurring gifts. Please use a card." } };
      }

      const amount = toSubunits(subscriptionData.amount);
      // The donation UI sends the interval as an object here.
      const intervalData = subscriptionData.interval as GatewayInterval;
      const interval = this.planInterval(intervalData);
      const plan = await this.api<{ plan_code?: string }>(config, "post", "/plan", {
        name: `Donation ${interval} ${amount}`,
        amount,
        interval,
        currency: String(subscriptionData.currency || "").toUpperCase() || undefined
      });
      const startDate = this.nextChargeDate(subscriptionData.billing_cycle_anchor, intervalData);
      const sub = await this.api<PaystackSubscription>(config, "post", "/subscription", {
        customer: customerCode,
        plan: plan.plan_code,
        authorization: authorization.authorization_code,
        start_date: startDate.toISOString()
      });
      const data: PaystackSubscriptionData = { ...sub, status: "active", customerId: customerCode, authorization, initialTx };
      return {
        success: true,
        subscriptionId: sub.subscription_code,
        data
      };
    } catch (e) {
      console.error("Paystack createSubscription error:", this.errorMessage(e));
      return { success: false, subscriptionId: "", data: { error: this.errorMessage(e) } };
    }
  }

  // Persist the customer, then log the first gift (subscribe has no charge-logging path of its own).
  async finalizeSubscription(config: GatewayConfig, result: SubscriptionResult, subscriptionData: GatewayPaymentRequest, person: GatewayPerson, repos: GivingRepos): Promise<string | undefined> {
    const resultData = result.data as PaystackSubscriptionData;
    const customerId = resultData?.customerId || subscriptionData.customerId;
    if (customerId && person?.id) {
      try { await repos.customer.save({ id: customerId, churchId: config.churchId, personId: person.id, provider: this.name }); } catch { /* exists */ }
    }
    const tx = resultData?.initialTx;
    if (tx?.reference && !(await repos.donation.loadByTransactionId(config.churchId, String(tx.reference)))) {
      try {
        await this.logDonation(config, config.churchId, { ...tx, person, funds: subscriptionData.funds, amount: subscriptionData.amount, notes: subscriptionData.notes }, repos, "complete");
      } catch (e) {
        console.error("Paystack: failed to log initial subscription gift", e);
      }
    }
    return customerId;
  }

  async updateSubscription(_config: GatewayConfig, _subscriptionData: GatewaySubscriptionUpdate): Promise<SubscriptionResult> {
    throw new Error("Paystack subscriptions cannot be edited; cancel and create a new one");
  }

  async cancelSubscription(config: GatewayConfig, subscriptionId: string, _reason?: string): Promise<void> {
    const sub = await this.api<PaystackSubscription>(config, "get", `/subscription/${encodeURIComponent(subscriptionId)}`);
    await this.api(config, "post", "/subscription/disable", { code: subscriptionId, token: sub?.email_token });
  }

  async pauseSubscription(): Promise<void> {
    throw new Error("Paystack does not support pausing subscriptions");
  }

  async resumeSubscription(): Promise<void> {
    throw new Error("Paystack does not support resuming subscriptions");
  }

  async getSubscription(config: GatewayConfig, subscriptionId: string): Promise<PaystackSubscription> {
    return this.api<PaystackSubscription>(config, "get", `/subscription/${encodeURIComponent(subscriptionId)}`);
  }

  async verifySubscriptionOwnership(config: GatewayConfig, subscriptionId: string, personId: string, repos: GivingRepos): Promise<boolean> {
    const sub = await this.getSubscription(config, subscriptionId).catch((): null => null);
    const remote = sub?.customer?.customer_code;
    if (!remote) return false;
    const owner = await repos.customer.loadByPersonAndProvider(config.churchId, personId, this.name).catch((): null => null);
    return !!owner && owner.id === remote;
  }

  async getCustomerSubscriptions(config: GatewayConfig, customerId: string): Promise<PaystackSubscription[]> {
    const customer = await this.api<PaystackCustomer>(config, "get", `/customer/${encodeURIComponent(customerId)}`);
    return customer?.subscriptions || [];
  }

  async listNormalizedSubscriptions(config: GatewayConfig, customerId: string): Promise<NormalizedSubscription[]> {
    const subs = await this.getCustomerSubscriptions(config, customerId);
    const map: Record<string, { interval: string; interval_count: number }> = {
      weekly: { interval: "week", interval_count: 1 },
      monthly: { interval: "month", interval_count: 1 },
      quarterly: { interval: "month", interval_count: 3 },
      biannually: { interval: "month", interval_count: 6 },
      annually: { interval: "year", interval_count: 1 }
    };
    return (Array.isArray(subs) ? subs : [])
      // disable() leaves the schedule "non-renewing" until period end; the donor has cancelled, so hide it.
      .filter((s) => s.status === "active")
      .map((s) => ({
        id: s.subscription_code,
        status: "active",
        billing_cycle_anchor: Math.floor(new Date(s.next_payment_date || s.createdAt || Date.now()).getTime() / 1000),
        default_payment_method: s.authorization?.authorization_code,
        plan: { amount: Number(s.amount ?? s.plan?.amount ?? 0), ...(map[s.plan?.interval] || map.monthly) }
      }));
  }

  async calculateFees(amount: number, churchId: string, currency?: string): Promise<number> {
    const cur = (currency || "usd").toLowerCase();
    const defaults = DEFAULT_FEES[cur] || DEFAULT_FEES.usd;
    let percent = defaults.percent;
    let fixed = defaults.fixed;
    if (churchId) {
      try {
        const { data } = await Axios.get(Environment.membershipApi + "/settings/public/" + churchId);
        if (data?.transFeeCC != null && data.transFeeCC !== "") percent = +data.transFeeCC / 100;
        if (data?.flatRateCC != null && data.flatRateCC !== "") fixed = +data.flatRateCC;
      } catch { /* defaults */ }
    }
    if (defaults.waiveBelow && amount <= defaults.waiveBelow) fixed = 0;
    percent = Math.min(Math.max(percent, 0), 0.99);
    let fee = (amount + fixed) / (1 - percent) - amount;
    if (defaults.cap) fee = Math.min(fee, defaults.cap);
    return Math.round(fee * 100) / 100;
  }

  async createCustomer(config: GatewayConfig, email: string, name: string): Promise<string> {
    const [first_name, ...rest] = String(name || "").trim().split(" ");
    const customer = await this.api<PaystackCustomer>(config, "post", "/customer", { email, first_name, last_name: rest.join(" ") });
    return customer.customer_code;
  }

  async resolveCustomerForAttach(config: GatewayConfig, personId: string | undefined, _requestCustomerId: string | undefined, repos: GivingRepos): Promise<string | undefined> {
    if (!personId) return undefined;
    const c = await repos.customer.loadByPersonAndProvider(config.churchId, personId, this.name);
    return c?.id || undefined;
  }

  // "Attach" = verify the popup transaction and keep its reusable authorization.
  async attachPaymentMethod(config: GatewayConfig, paymentMethodId: string, _options: GatewayAttachOptions): Promise<PaystackSavedMethod> {
    const tx = await this.api(config, "get", `/transaction/verify/${encodeURIComponent(paymentMethodId)}`);
    if (tx?.status !== "success") throw new Error(tx?.gateway_response || "Payment was not successful");
    if (!tx.authorization?.reusable) throw new Error("This payment method cannot be saved for future use");
    return { ...tx.authorization, id: tx.authorization.authorization_code, customer_code: tx.customer?.customer_code };
  }

  buildLocalMethodRecord(pm: PaystackSavedMethod, _body: GatewayAttachBody | null, _tokenId: string): LocalMethodRecord | null {
    if (!pm?.authorization_code) return null;
    return {
      methodType: pm.channel === "card" ? "card" : "mobile_money",
      displayName: pm.channel === "card" ? `${String(pm.brand || pm.card_type || "Card").toUpperCase()} ****${pm.last4 || ""}` : `${pm.bank || "Mobile Money"} ****${pm.last4 || ""}`,
      metadata: { brand: pm.brand, last4: pm.last4, channel: pm.channel, bank: pm.bank, exp_month: pm.exp_month, exp_year: pm.exp_year }
    };
  }

  async getCustomerPaymentMethods(_config: GatewayConfig, _customer: Customer | string): Promise<GatewayObject[]> {
    return [];
  }

  // Local records are the source of truth; Paystack has no authorization list API.
  async listNormalizedPaymentMethods(config: GatewayConfig, customer: Customer | string, repos: GivingRepos): Promise<NormalizedPaymentMethod[]> {
    const customerId = typeof customer === "string" ? customer : customer?.id;
    const records = await repos.gatewayPaymentMethod.loadByCustomer(config.churchId, config.gatewayId, customerId);
    return (records || []).map((r) => ({
      id: r.externalId,
      type: "card",
      provider: this.name,
      name: r.displayName?.split(" ****")[0] || "Card",
      last4: (r.metadata?.last4 as string) || "",
      customerId,
      gatewayId: config.gatewayId,
      status: "active"
    }));
  }

  async verifyMethodOwnership(config: GatewayConfig, paymentMethodId: string, customerId: string, repos: GivingRepos): Promise<boolean> {
    const record = await repos.gatewayPaymentMethod.loadByExternalId(config.churchId, config.gatewayId, paymentMethodId);
    return !!record && record.customerId === customerId;
  }

  async deletePaymentMethod(config: GatewayConfig, paymentMethodId: string, _customerId: string, repos: GivingRepos): Promise<void> {
    try {
      await this.api(config, "post", "/customer/deactivate_authorization", { authorization_code: paymentMethodId });
    } catch (e) {
      console.warn("Paystack deactivate_authorization failed (removing local record anyway):", this.errorMessage(e));
    }
    await repos.gatewayPaymentMethod.deleteByExternalId(config.churchId, config.gatewayId, paymentMethodId);
  }

  async detachPaymentMethod(config: GatewayConfig, paymentMethodId: string): Promise<GatewayObject> {
    await this.api(config, "post", "/customer/deactivate_authorization", { authorization_code: paymentMethodId });
    return { success: true };
  }

  async logEvent(churchId: string, event: PaystackWebhookBody, eventData: PaystackTx, repos: GivingRepos): Promise<void> {
    const eventType = event?.event || (eventData?.reference ? "charge.success" : "unknown");
    const log: EventLog = {
      id: "",
      churchId,
      customerId: eventData?.customer?.customer_code || "",
      provider: "Paystack",
      providerId: `${eventType}:${eventData?.providerEventId ?? eventData?.id ?? eventData?.reference ?? ""}`,
      eventType,
      status: eventData?.status || "",
      message: eventData?.gateway_response || "",
      created: new Date(eventData?.paid_at || eventData?.created_at || Date.now()),
      resolved: false
    };
    await repos.eventLog.save(log);
  }

  async logDonation(config: GatewayConfig, churchId: string, eventData: PaystackTx, repos: GivingRepos, status: "pending" | "complete" = "complete") {
    const amount = eventData.person ? Number(eventData.amount) : fromSubunits(eventData.amount);
    const customerCode = eventData.customer?.customer_code;
    let personId: string | undefined = eventData.anonymous ? undefined : (eventData.person?.id || eventData.metadata?.personId);
    if (!personId && !eventData.anonymous && customerCode) {
      const customer = await repos.customer.load(churchId, customerCode);
      personId = customer?.personId;
    }

    const auth = eventData.authorization || {};
    const isCard = auth.channel === "card" || eventData.channel === "card";
    const method = isCard ? "Card" : "Mobile Money";
    const methodDetails = isCard ? `${String(auth.brand || auth.card_type || "Card").toUpperCase()} ****${auth.last4 || ""}` : `${auth.bank || eventData.channel || "Mobile Money"} ****${auth.last4 || ""}`;

    const batch: DonationBatch = await repos.donationBatch.getOrCreateCurrent(churchId);
    const donation: Donation = {
      churchId,
      batchId: batch.id,
      personId,
      transactionId: String(eventData.reference || eventData.id || ""),
      donationDate: new Date(eventData.paid_at || eventData.created_at || Date.now()),
      amount,
      method,
      methodDetails,
      memo: eventData.notes || undefined,
      notes: `Paystack ref: ${eventData.reference || ""}`,
      status
    };
    let funds: FundAllocation[] = eventData.funds || eventData.metadata?.funds || [];
    if (!funds.length) funds = await this.recoverFunds(churchId, customerCode, amount, repos);
    const fundDonations = funds
      .filter((f) => f.fundId || f.id)
      .map((f) => ({ churchId, fundId: f.fundId || f.id, amount: Number(f.amount || 0) } as FundDonation));
    const saved = await repos.donation.save(donation, fundDonations);

    if (eventData.saveCard && auth.reusable && auth.authorization_code && personId && customerCode) {
      try {
        await repos.customer.save({ id: customerCode, churchId, personId, provider: this.name });
        const record = this.buildLocalMethodRecord(auth, null, "");
        if (record) {
          const existing = await repos.gatewayPaymentMethod.loadByExternalId(churchId, config.gatewayId, auth.authorization_code);
          if (!existing) await repos.gatewayPaymentMethod.save({ churchId, gatewayId: config.gatewayId, customerId: customerCode, externalId: auth.authorization_code, ...record });
        }
      } catch (e) {
        console.warn("Paystack: could not save payment method after charge", e);
      }
    }
    return saved;
  }

  // Renewal webhooks carry no fund split; take it from the donor's Paystack subscription (amount-matched when
  // several), else the General Fund so the gift is never left unallocated (and invisible in fund reports).
  private async recoverFunds(churchId: string, customerCode: string | undefined, amount: number, repos: GivingRepos): Promise<FundAllocation[]> {
    try {
      const loaded: { id?: string } | { id?: string }[] | null = customerCode ? await repos.subscription.loadByCustomerId(churchId, customerCode) : [];
      const subs: { id?: string }[] = Array.isArray(loaded) ? loaded : loaded ? [loaded] : [];
      let candidates: { funds: FundAllocation[]; total: number }[] = [];
      for (const s of subs) {
        const sf: FundAllocation[] = await repos.subscriptionFunds.loadBySubscriptionId(churchId, s.id);
        const total = (sf || []).reduce((t, f) => t + Number(f.amount || 0), 0);
        if (sf?.length) candidates.push({ funds: sf, total });
      }
      if (candidates.length > 1) candidates = candidates.filter((c) => Math.abs(c.total - amount) < 0.01).concat(candidates);
      if (candidates[0]) return candidates[0].funds;
      const general = await repos.fund.getOrCreateGeneral(churchId);
      return general?.id ? [{ fundId: general.id, amount }] : [];
    } catch (e) {
      console.error("Paystack recoverFunds failed:", e);
      return [];
    }
  }

  async updateDonationStatus(churchId: string, transactionId: string, status: "pending" | "complete" | "failed", repos: GivingRepos): Promise<void> {
    await repos.donation.updateStatus(churchId, transactionId, status);
  }

  async createProduct(): Promise<string> {
    return "";
  }
}
