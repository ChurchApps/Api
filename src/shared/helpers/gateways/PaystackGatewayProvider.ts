import express from "express";
import Axios from "axios";
import crypto from "crypto";
import { Environment } from "../Environment.js";
import { Donation, DonationBatch, EventLog, FundDonation } from "../../../modules/giving/models/index.js";
import { IGatewayProvider, WebhookResult, ChargeResult, SubscriptionResult, GatewayConfig, ProviderCapabilities, WebhookEventClassification } from "./IGatewayProvider.js";

const PAYSTACK_API = "https://api.paystack.co";

// Zero-decimal handling isn't needed: every Paystack currency uses 2 subunits.
const toSubunits = (amount: number) => Math.round(Number(amount) * 100);
const fromSubunits = (amount: number) => Math.round(Number(amount || 0)) / 100;

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

  private async api(config: GatewayConfig, method: "get" | "post", path: string, body?: any): Promise<any> {
    const resp = await Axios.request({
      method,
      url: PAYSTACK_API + path,
      data: body,
      headers: { Authorization: `Bearer ${config.privateKey}`, "Content-Type": "application/json" }
    });
    if (resp.data?.status === false) throw new Error(resp.data?.message || "Paystack request failed");
    return resp.data?.data;
  }

  private errorMessage(e: any): string {
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

  async verifyWebhookSignature(config: GatewayConfig, headers: express.Request["headers"], body: any): Promise<WebhookResult> {
    const signature = String(headers["x-paystack-signature"] || "");
    if (!config.privateKey || !signature) return { success: false, shouldProcess: false };
    const rawBody = typeof body === "string" ? body : Buffer.isBuffer(body) ? body.toString("utf8") : JSON.stringify(body ?? {});
    const expected = crypto.createHmac("sha512", config.privateKey).update(rawBody).digest("hex");
    if (expected.length !== signature.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
      return { success: false, shouldProcess: false };
    }
    const parsed = typeof body === "string" ? JSON.parse(body) : Buffer.isBuffer(body) ? JSON.parse(body.toString("utf8")) : body;
    const data = parsed?.data || {};
    const eventType = String(parsed?.event || "");
    // Controllers key donations on reference and subscriptions on subscription_code; Paystack's numeric data.id is neither.
    const id = eventType.startsWith("subscription.") ? data.subscription_code : data.reference;
    return {
      success: true,
      shouldProcess: true,
      eventType,
      eventData: { ...data, id, providerEventId: data.id },
      eventId: `${eventType}:${data.id ?? data.reference ?? data.subscription_code ?? ""}`
    };
  }

  // The popup already charged; the "token" is the transaction reference to verify.
  async processCharge(config: GatewayConfig, donationData: any): Promise<ChargeResult> {
    try {
      let tx: any;
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
      return {
        success: true,
        transactionId: tx.reference,
        data: { ...tx, status: "succeeded", saveCard: !!donationData.saveCard }
      };
    } catch (e: any) {
      console.error("Paystack processCharge error:", this.errorMessage(e));
      return { success: false, transactionId: "", data: { error: this.errorMessage(e) } };
    }
  }

  // Saved methods arrive as AUTH_ codes in `id`; move them where processCharge expects them.
  async prepareCharge(_config: GatewayConfig, donationData: any, _repos: any): Promise<void> {
    if (donationData.id && !donationData.paymentMethodId && this.ownsPaymentMethodId(String(donationData.id))) {
      donationData.paymentMethodId = String(donationData.id);
      delete donationData.id;
    }
  }

  ownsPaymentMethodId(id: string): boolean {
    return /^AUTH_/.test(id);
  }

  async prepareSubscription(config: GatewayConfig, subscriptionData: any, person: any, repos: any): Promise<void> {
    if (person?.id && !subscriptionData.customerId) {
      const existing = await repos.customer.loadByPersonAndProvider(config.churchId, person.id, this.name) as any;
      if (existing?.id) subscriptionData.customerId = existing.id;
    }
  }

  private planInterval(interval: { interval: string; interval_count: number } | undefined): string {
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

  private nextChargeDate(anchor: number | undefined, interval: { interval: string; interval_count: number } | undefined): Date {
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
  async createSubscription(config: GatewayConfig, subscriptionData: any): Promise<SubscriptionResult> {
    try {
      const saved = subscriptionData.paymentMethodId || (this.ownsPaymentMethodId(String(subscriptionData.id || "")) ? subscriptionData.id : null);
      let authorization: any;
      let customerCode: string;
      let initialTx: any = null;
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
        authorization = initialTx.authorization;
        customerCode = initialTx.customer?.customer_code;
      }
      if (!authorization?.reusable) {
        return { success: false, subscriptionId: "", data: { error: "This payment method cannot be reused for recurring gifts. Please use a card." } };
      }

      const amount = toSubunits(subscriptionData.amount);
      const interval = this.planInterval(subscriptionData.interval);
      const plan = await this.api(config, "post", "/plan", {
        name: `Donation ${interval} ${amount}`,
        amount,
        interval,
        currency: String(subscriptionData.currency || "").toUpperCase() || undefined
      });
      const startDate = this.nextChargeDate(subscriptionData.billing_cycle_anchor, subscriptionData.interval);
      const sub = await this.api(config, "post", "/subscription", {
        customer: customerCode,
        plan: plan.plan_code,
        authorization: authorization.authorization_code,
        start_date: startDate.toISOString()
      });
      return {
        success: true,
        subscriptionId: sub.subscription_code,
        data: { ...sub, status: "active", customerId: customerCode, authorization, initialTx }
      };
    } catch (e: any) {
      console.error("Paystack createSubscription error:", this.errorMessage(e));
      return { success: false, subscriptionId: "", data: { error: this.errorMessage(e) } };
    }
  }

  // Persist the customer, then log the first gift (subscribe has no charge-logging path of its own).
  async finalizeSubscription(config: GatewayConfig, result: SubscriptionResult, subscriptionData: any, person: any, repos: any): Promise<string | undefined> {
    const customerId = result.data?.customerId || subscriptionData.customerId;
    if (customerId && person?.id) {
      try { await repos.customer.save({ id: customerId, churchId: config.churchId, personId: person.id, provider: this.name }); } catch { /* exists */ }
    }
    const tx = result.data?.initialTx;
    if (tx?.reference) {
      try {
        await this.logDonation(config, config.churchId, { ...tx, person, funds: subscriptionData.funds, amount: subscriptionData.amount, notes: subscriptionData.notes }, repos, "complete");
      } catch (e) {
        console.error("Paystack: failed to log initial subscription gift", e);
      }
    }
    return customerId;
  }

  async updateSubscription(_config: GatewayConfig, _subscriptionData: any): Promise<SubscriptionResult> {
    throw new Error("Paystack subscriptions cannot be edited; cancel and create a new one");
  }

  async cancelSubscription(config: GatewayConfig, subscriptionId: string, _reason?: string): Promise<void> {
    const sub = await this.api(config, "get", `/subscription/${encodeURIComponent(subscriptionId)}`);
    await this.api(config, "post", "/subscription/disable", { code: subscriptionId, token: sub?.email_token });
  }

  async pauseSubscription(): Promise<void> {
    throw new Error("Paystack does not support pausing subscriptions");
  }

  async resumeSubscription(): Promise<void> {
    throw new Error("Paystack does not support resuming subscriptions");
  }

  async getSubscription(config: GatewayConfig, subscriptionId: string): Promise<any> {
    return this.api(config, "get", `/subscription/${encodeURIComponent(subscriptionId)}`);
  }

  async verifySubscriptionOwnership(config: GatewayConfig, subscriptionId: string, personId: string, repos: any): Promise<boolean> {
    const sub = await this.getSubscription(config, subscriptionId).catch((): null => null);
    const remote = sub?.customer?.customer_code;
    if (!remote) return false;
    const owner = await repos.customer.loadByPersonAndProvider(config.churchId, personId, this.name).catch((): null => null) as any;
    return !!owner && owner.id === remote;
  }

  async getCustomerSubscriptions(config: GatewayConfig, customerId: string): Promise<any> {
    const customer = await this.api(config, "get", `/customer/${encodeURIComponent(customerId)}`);
    return customer?.subscriptions || [];
  }

  async listNormalizedSubscriptions(config: GatewayConfig, customerId: string): Promise<any[]> {
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
      .filter((s: any) => s.status === "active")
      .map((s: any) => ({
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
    const customer = await this.api(config, "post", "/customer", { email, first_name, last_name: rest.join(" ") });
    return customer.customer_code;
  }

  async resolveCustomerForAttach(config: GatewayConfig, personId: string | undefined, _requestCustomerId: string | undefined, repos: any): Promise<string | undefined> {
    if (!personId) return undefined;
    const c = await repos.customer.loadByPersonAndProvider(config.churchId, personId, this.name) as any;
    return c?.id || undefined;
  }

  // "Attach" = verify the popup transaction and keep its reusable authorization.
  async attachPaymentMethod(config: GatewayConfig, paymentMethodId: string, _options: any): Promise<any> {
    const tx = await this.api(config, "get", `/transaction/verify/${encodeURIComponent(paymentMethodId)}`);
    if (tx?.status !== "success") throw new Error(tx?.gateway_response || "Payment was not successful");
    if (!tx.authorization?.reusable) throw new Error("This payment method cannot be saved for future use");
    return { ...tx.authorization, id: tx.authorization.authorization_code, customer_code: tx.customer?.customer_code };
  }

  buildLocalMethodRecord(pm: any, _body: any, _tokenId: string): { methodType: string; displayName: string; metadata: any } | null {
    if (!pm?.authorization_code) return null;
    return {
      methodType: pm.channel === "card" ? "card" : "mobile_money",
      displayName: pm.channel === "card" ? `${String(pm.brand || pm.card_type || "Card").toUpperCase()} ****${pm.last4 || ""}` : `${pm.bank || "Mobile Money"} ****${pm.last4 || ""}`,
      metadata: { brand: pm.brand, last4: pm.last4, channel: pm.channel, bank: pm.bank, exp_month: pm.exp_month, exp_year: pm.exp_year }
    };
  }

  async getCustomerPaymentMethods(_config: GatewayConfig, _customer: any): Promise<any> {
    return [];
  }

  // Local records are the source of truth; Paystack has no authorization list API.
  async listNormalizedPaymentMethods(config: GatewayConfig, customer: any, repos: any): Promise<any[]> {
    const customerId = typeof customer === "string" ? customer : customer?.id;
    const records = await repos.gatewayPaymentMethod.loadByCustomer(config.churchId, config.gatewayId, customerId);
    return (records || []).map((r: any) => ({
      id: r.externalId,
      type: "card",
      provider: this.name,
      name: r.displayName?.split(" ****")[0] || "Card",
      last4: r.metadata?.last4 || "",
      customerId,
      gatewayId: config.gatewayId,
      status: "active"
    }));
  }

  async verifyMethodOwnership(config: GatewayConfig, paymentMethodId: string, customerId: string, repos: any): Promise<boolean> {
    const record = await repos.gatewayPaymentMethod.loadByExternalId(config.churchId, config.gatewayId, paymentMethodId);
    return !!record && record.customerId === customerId;
  }

  async deletePaymentMethod(config: GatewayConfig, paymentMethodId: string, _customerId: string, repos: any): Promise<void> {
    try {
      await this.api(config, "post", "/customer/deactivate_authorization", { authorization_code: paymentMethodId });
    } catch (e) {
      console.warn("Paystack deactivate_authorization failed (removing local record anyway):", this.errorMessage(e));
    }
    await repos.gatewayPaymentMethod.deleteByExternalId(config.churchId, config.gatewayId, paymentMethodId);
  }

  async detachPaymentMethod(config: GatewayConfig, paymentMethodId: string): Promise<any> {
    await this.api(config, "post", "/customer/deactivate_authorization", { authorization_code: paymentMethodId });
    return { success: true };
  }

  async logEvent(churchId: string, event: any, eventData: any, repos: any): Promise<void> {
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

  async logDonation(config: GatewayConfig, churchId: string, eventData: any, repos: any, status: "pending" | "complete" = "complete"): Promise<any> {
    const amount = eventData.person ? Number(eventData.amount) : fromSubunits(eventData.amount);
    const customerCode = eventData.customer?.customer_code;
    let personId: string | undefined = eventData.anonymous ? undefined : (eventData.person?.id || eventData.metadata?.personId);
    if (!personId && !eventData.anonymous && customerCode) {
      const customer = await repos.customer.load(churchId, customerCode) as any;
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
      notes: eventData.notes || `Paystack ref: ${eventData.reference || ""}`,
      status
    };
    const saved = await repos.donation.save(donation);

    let funds: any[] = eventData.funds || eventData.metadata?.funds || [];
    if (!funds.length) funds = await this.recoverFunds(churchId, customerCode, amount, repos);
    for (const f of funds) {
      const fundId = f.fundId || f.id;
      if (fundId) await repos.fundDonation.save({ churchId, donationId: saved.id, fundId, amount: Number(f.amount || 0) } as FundDonation);
    }

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
  private async recoverFunds(churchId: string, customerCode: string | undefined, amount: number, repos: any): Promise<any[]> {
    try {
      const loaded = customerCode ? await repos.subscription.loadByCustomerId(churchId, customerCode) : [];
      const subs: any[] = Array.isArray(loaded) ? loaded : loaded ? [loaded] : [];
      let candidates: any[] = [];
      for (const s of subs) {
        const sf = await repos.subscriptionFunds.loadBySubscriptionId(churchId, s.id) as any[];
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

  async updateDonationStatus(churchId: string, transactionId: string, status: "pending" | "complete" | "failed", repos: any): Promise<void> {
    await repos.donation.updateStatus(churchId, transactionId, status);
  }

  async createProduct(): Promise<string> {
    return "";
  }
}
