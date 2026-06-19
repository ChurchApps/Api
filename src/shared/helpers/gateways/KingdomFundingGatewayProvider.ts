import express from "express";
import crypto from "crypto";
import { AbstractExperimentalGatewayProvider } from "./AbstractExperimentalGatewayProvider.js";
import { GatewayConfig, WebhookResult, ChargeResult, SubscriptionResult } from "./IGatewayProvider.js";
import Axios from "axios";
import { Environment } from "../Environment.js";
import { Donation, DonationBatch, EventLog, FundDonation } from "../../../modules/giving/models/index.js";

/**
 * KingdomFunding payment gateway provider — backed by NMI (Network Merchants Inc.).
 *
 * The "Kingdom Funding" name/branding is retained throughout the product; only the
 * underlying gateway is NMI. (Previously this provider talked to Accept Blue; it was
 * migrated to NMI because Accept Blue cannot tokenize ACH and NMI can — Collect.js
 * tokenizes both card and ACH into a single-use `payment_token`.)
 *
 * Supports:
 * - One-time card charges (via Collect.js payment_token)
 * - One-time ACH/eCheck charges (via Collect.js payment_token OR raw routing/account)
 * - Recurring subscriptions (vault the method, then add_subscription)
 * - Customer Vault for reusable saved payment methods
 * - Refunds (full + partial) and voids
 * - Webhooks with HMAC-SHA256 signature verification
 *
 * DB column mapping (unchanged from before — only the meaning of each value changes):
 *   gateways.publicKey    = NMI Collect.js public tokenization key (browser-side)
 *   gateways.privateKey   = NMI Security Key (server-side secret, encrypted at rest)
 *   gateways.webhookKey   = NMI webhook signing key (per-endpoint, encrypted at rest)
 *   gateways.settings     = { merchantId?, webhookId? }
 *
 * NMI Payment API: POST application/x-www-form-urlencoded to transact.php.
 * Responses are url-encoded key=value strings; response=1 Approved, 2 Declined, 3 Error.
 */
export class KingdomFundingGatewayProvider extends AbstractExperimentalGatewayProvider {
  readonly name = "kingdomfunding";

  async createProduct(_config: GatewayConfig, _churchId: string): Promise<string> {
    return "";
  }

  // ─── Helpers ──────────────────────────────────────────────

  /**
   * NMI Payment API endpoint. Sandbox and production share the same host — the
   * account behind the Security Key determines test vs. live. NMI_API_URL allows
   * the local integration-test harness to point at a sandbox/mock host.
   */
  private getApiUrl(_config: GatewayConfig): string {
    return process.env.NMI_API_URL || "https://secure.nmi.com/api/transact.php";
  }

  /** NMI Query API (read side: vault records, subscriptions). Returns XML. */
  private getQueryUrl(_config: GatewayConfig): string {
    return process.env.NMI_QUERY_URL || "https://secure.nmi.com/api/query.php";
  }

  /**
   * POST a form-urlencoded request to the NMI Payment API and parse the
   * url-encoded response into a flat string map.
   * security_key is always injected from config.privateKey.
   */
  private async nmiPost(config: GatewayConfig, params: Record<string, any>): Promise<Record<string, string>> {
    const body = new URLSearchParams();
    body.set("security_key", config.privateKey || "");
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null || v === "") continue;
      body.set(k, String(v));
    }

    const response = await Axios.post(this.getApiUrl(config), body.toString(), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      // NMI returns 200 with response=2/3 for declines/errors; only throw on transport errors.
      timeout: 30000,
    });

    const parsed: Record<string, string> = {};
    new URLSearchParams(typeof response.data === "string" ? response.data : "").forEach((value, key) => {
      parsed[key] = value;
    });
    return parsed;
  }

  /** NMI: response === "1" means Approved. */
  private isApproved(resp: Record<string, string>): boolean {
    return resp.response === "1";
  }

  private errorText(resp: Record<string, string>): string {
    return resp.responsetext || resp.response_code || "Transaction was not approved";
  }

  /** Split a "First Last" display name into NMI first_name / last_name fields. */
  private splitName(name: string): { first_name?: string; last_name?: string } {
    const parts = (name || "").trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return {};
    if (parts.length === 1) return { first_name: parts[0] };
    return { first_name: parts[0], last_name: parts.slice(1).join(" ") };
  }

  /** Build NMI billing fields from donationData.person / billing_info. */
  private billingFields(donationData: any): Record<string, any> {
    const person = donationData.person || {};
    const billing = donationData.billing_info || {};
    const first = billing.first_name || person.firstName || person.first_name;
    const last = billing.last_name || person.lastName || person.last_name;
    const email = billing.email || person.email || donationData.email;
    return {
      first_name: first || undefined,
      last_name: last || undefined,
      email: email || undefined,
    };
  }

  // ─── Webhook Management ───────────────────────────────────

  /**
   * NMI webhook endpoints + signing keys are configured in the Merchant Portal
   * (Settings → Webhooks), not via the Payment API. Setup is handled in B1Admin.
   */
  async createWebhookEndpoint(_config: GatewayConfig, _webhookUrl: string): Promise<{ id: string; secret?: string }> {
    return { id: "", secret: "" };
  }

  async deleteWebhooksByChurchId(_config: GatewayConfig, _churchId: string): Promise<void> {
    // No-op: webhooks managed via the NMI Merchant Portal.
  }

  /**
   * Verify an NMI webhook signature.
   *
   * NMI sends a `Webhook-Signature` header of the form `t=<nonce>,s=<hexHmac>`.
   * The signed string is `<nonce>.<rawBody>` and the HMAC is SHA-256 keyed with
   * the endpoint's signing key (stored in config.webhookKey).
   *
   * IMPORTANT: `body` must be the RAW request body (string). A re-serialized JSON
   * object will not reproduce the signature. DonateController passes the raw body.
   */
  async verifyWebhookSignature(
    config: GatewayConfig,
    headers: express.Request["headers"],
    body: any
  ): Promise<WebhookResult> {
    const signatureHeader = (headers["webhook-signature"] || "") as string;
    const webhookSecret = config.webhookKey;

    // No signing key configured — refuse to process (don't silently accept).
    if (!webhookSecret) {
      console.error("KingdomFunding(NMI) webhook: no signing key configured for this church; rejecting.");
      return { success: false, shouldProcess: false };
    }
    if (!signatureHeader) {
      console.error("KingdomFunding(NMI) webhook: missing Webhook-Signature header; rejecting.");
      return { success: false, shouldProcess: false };
    }

    // Parse `t=<nonce>,s=<sig>`
    const parts: Record<string, string> = {};
    for (const seg of signatureHeader.split(",")) {
      const idx = seg.indexOf("=");
      if (idx > 0) parts[seg.slice(0, idx).trim()] = seg.slice(idx + 1).trim();
    }
    const nonce = parts.t;
    const provided = parts.s;
    if (!nonce || !provided) {
      console.error("KingdomFunding(NMI) webhook: malformed Webhook-Signature header; rejecting.");
      return { success: false, shouldProcess: false };
    }

    // The raw request body is preserved by the webhook route (string in production,
    // Buffer in local dev — see app.ts). NMI signs the exact raw bytes, so we must
    // hash that raw payload, never a re-serialized object.
    const rawBody =
      typeof body === "string"
        ? body
        : Buffer.isBuffer(body)
          ? body.toString("utf8")
          : JSON.stringify(body ?? {});
    const expected = crypto
      .createHmac("sha256", webhookSecret)
      .update(`${nonce}.${rawBody}`, "utf-8")
      .digest("hex");

    let matches = false;
    try {
      matches = crypto.timingSafeEqual(Buffer.from(provided, "hex"), Buffer.from(expected, "hex"));
    } catch {
      matches = false;
    }
    if (!matches) {
      console.error("KingdomFunding(NMI) webhook: signature mismatch");
      return { success: false, shouldProcess: false };
    }

    // NMI webhook payload: { event_id, event_type, event_body }. rawBody is always a
    // JSON string at this point, so parse it (works for string + Buffer inputs alike).
    const payload = safeJsonParse(rawBody);
    const eventType: string = payload?.event_type || "";        // e.g. "transaction.sale.success"
    const eventId: string = payload?.event_id || "";
    const eventBody: any = payload?.event_body || {};

    // event_type is dot-delimited: <category>.<action>.<result>
    const [category, action, result] = eventType.split(".");

    // Process successful sales and ACH/check status settlements as donations.
    const isTransaction = category === "transaction";
    const isCheckStatus = category === "check"; // ACH lifecycle (settled/returned/etc.)
    const shouldProcess =
      (isTransaction && (action === "sale" || action === "auth") && result === "success") ||
      isCheckStatus;

    const txn = eventBody.transaction || eventBody;
    const transactionId = txn.transaction_id || txn.transactionid || eventBody.transaction_id || eventId;

    return {
      success: true,
      shouldProcess,
      eventType,
      eventId,
      eventData: {
        ...eventBody,
        id: transactionId,
        eventType,
        eventCategory: category,
        action,
        result,
        // Surface common fields downstream code reads (logDonation tolerates missing ones).
        amount: txn.amount || eventBody.amount,
        last_4: txn.cc_last_4 || txn.cc_number_masked?.slice(-4) || txn.check_account?.slice(-4),
        card_type: txn.cc_type || txn.card_type,
      },
    };
  }

  // ─── Payment Processing ───────────────────────────────────

  /**
   * Process a one-time charge via NMI.
   *
   * Payment source resolution (in priority order):
   *   1. saved method  → customer_vault_id (donationData.paymentMethodId or customerId)
   *   2. Collect.js    → payment_token (donationData.token / donationData.id)
   *   3. raw bank      → handled by processBankCharge (routing/account fields)
   *
   * A Collect.js payment_token carries whether it was a card or ACH, so card and
   * token-based ACH both flow through here uniformly.
   */
  async processCharge(config: GatewayConfig, donationData: any): Promise<ChargeResult> {
    // Raw bank fields (no token) route to the dedicated ACH path.
    const hasRawBank = donationData.routing_number && donationData.account_number;
    if ((donationData.type === "bank" || donationData.paymentType === "bank") && hasRawBank) {
      return this.processBankCharge(config, donationData);
    }

    try {
      const params: Record<string, any> = {
        type: "sale",
        amount: this.formatAmount(donationData.amount),
        ...this.billingFields(donationData),
      };

      const vaultId = donationData.paymentMethodId || (donationData.customerId && !donationData.token ? donationData.customerId : undefined);
      const token = donationData.token || (isLikelyToken(donationData.id) ? donationData.id : undefined);

      if (vaultId) {
        params.customer_vault_id = vaultId;
      } else if (token) {
        params.payment_token = token;
      } else {
        return { success: false, transactionId: "", data: { error: "Missing payment token or saved payment method" } };
      }

      if (donationData.orderId) params.orderid = donationData.orderId;

      const resp = await this.nmiPost(config, params);

      if (this.isApproved(resp)) {
        return {
          success: true,
          transactionId: resp.transactionid || "",
          data: {
            ...resp,
            status: "active",
            reference_number: resp.transactionid,
            auth_amount: params.amount,
            authcode: resp.authcode,
            last_4: resp.cc_number?.slice(-4),
            card_type: resp.cc_type,
          },
        };
      }

      return {
        success: false,
        transactionId: "",
        data: { error: this.errorText(resp), ...resp },
      };
    } catch (error: any) {
      const msg = error.response?.data || error.message || "Charge failed";
      console.error("KingdomFunding(NMI) processCharge error:", typeof msg === "string" ? msg : JSON.stringify(msg));
      return { success: false, transactionId: "", data: { error: "Charge failed. Please try again." } };
    }
  }

  /**
   * Process a bank/ACH charge from RAW routing/account details.
   * (Token-based ACH goes through processCharge with a payment_token.)
   */
  private async processBankCharge(config: GatewayConfig, donationData: any): Promise<ChargeResult> {
    try {
      const params: Record<string, any> = {
        type: "sale",
        amount: this.formatAmount(donationData.amount),
        payment: "check",
        checkname: donationData.name || donationData.person?.name || "",
        checkaba: donationData.routing_number,
        checkaccount: donationData.account_number,
        account_type: donationData.account_type || "checking", // checking | savings
        account_holder_type: donationData.account_holder_type || "personal", // personal | business
        sec_code: donationData.sec_code || "WEB", // PPD | WEB | CCD | TEL
        ...this.billingFields(donationData),
      };

      if (donationData.paymentMethodId) {
        // Saved ACH method → charge the vault record instead of raw fields.
        delete params.payment;
        delete params.checkname;
        delete params.checkaba;
        delete params.checkaccount;
        delete params.account_type;
        delete params.account_holder_type;
        delete params.sec_code;
        params.customer_vault_id = donationData.paymentMethodId;
      }

      const resp = await this.nmiPost(config, params);

      if (this.isApproved(resp)) {
        return {
          success: true,
          transactionId: resp.transactionid || "",
          data: { ...resp, status: "active", reference_number: resp.transactionid, auth_amount: params.amount },
        };
      }
      return { success: false, transactionId: "", data: { error: this.errorText(resp), ...resp } };
    } catch (error: any) {
      console.error("KingdomFunding(NMI) processBankCharge error:", error.message);
      return { success: false, transactionId: "", data: { error: "ACH charge failed. Please try again." } };
    }
  }

  /** NMI expects amounts as a decimal string with 2 places, e.g. "10.00". */
  private formatAmount(amount: any): string {
    const n = Number(amount);
    return (isNaN(n) ? 0 : n).toFixed(2);
  }

  // ─── Recurring Subscriptions ──────────────────────────────

  /**
   * Map our frontend interval format to NMI recurring frequency fields.
   * NMI uses EITHER day_frequency OR (month_frequency + day_of_month) — never both.
   */
  private mapIntervalToNmi(interval: any, anchorDate: Date): Record<string, any> {
    const str = (typeof interval === "string" ? interval : interval?.interval || interval?.frequency || "").toLowerCase();
    const dayOfMonth = anchorDate.getDate();

    switch (str) {
      case "daily": return { day_frequency: 1 };
      case "one_week": case "weekly": return { day_frequency: 7 };
      case "two_week": case "biweekly": return { day_frequency: 14 };
      case "one_month": case "monthly": return { month_frequency: 1, day_of_month: dayOfMonth };
      case "two_month": case "bimonthly": return { month_frequency: 2, day_of_month: dayOfMonth };
      case "three_month": case "quarterly": return { month_frequency: 3, day_of_month: dayOfMonth };
      case "six_month": case "biannually": return { month_frequency: 6, day_of_month: dayOfMonth };
      case "one_year": case "annual": case "annually": return { month_frequency: 12, day_of_month: dayOfMonth };
      default: return { month_frequency: 1, day_of_month: dayOfMonth };
    }
  }

  /** Format a Date as NMI's YYYYMMDD start_date. */
  private nmiDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}${m}${day}`;
  }

  /**
   * Create a recurring subscription in NMI.
   *
   * Collect.js tokens are single-use, so recurring requires a vaulted method:
   *   1. Vault the payment method (add_customer with payment_token / raw bank) → customer_vault_id
   *   2. If it starts today, charge the vault immediately
   *   3. add_subscription against the customer_vault_id with a future start_date
   */
  async createSubscription(config: GatewayConfig, subscriptionData: any): Promise<SubscriptionResult> {
    try {
      const name = subscriptionData.name || subscriptionData.person?.name?.display || subscriptionData.person?.name || "Donor";
      const amount = this.formatAmount(subscriptionData.amount);
      const token = subscriptionData.token || (isLikelyToken(subscriptionData.id) ? subscriptionData.id : undefined);
      const isBank = subscriptionData.type === "bank" || (subscriptionData.routing_number && subscriptionData.account_number);

      // Determine start timing.
      let startsToday = true;
      let anchorDate = new Date();
      if (subscriptionData.billing_cycle_anchor) {
        let anchorMs = subscriptionData.billing_cycle_anchor;
        if (anchorMs < 10000000000) anchorMs = anchorMs * 1000;
        anchorDate = new Date(anchorMs);
        const today = new Date();
        startsToday =
          anchorDate.toISOString().split("T")[0] === today.toISOString().split("T")[0] || anchorDate <= today;
      }

      // Step 1: obtain a vault id (reuse if a saved method was provided).
      let customerVaultId: string | undefined = subscriptionData.paymentMethodId || subscriptionData.customerId;
      if (!customerVaultId) {
        customerVaultId = await this.vaultPaymentMethod(config, { token, isBank, name, subscriptionData });
        if (!customerVaultId) {
          return { success: false, subscriptionId: "", data: { error: "Failed to save payment method for recurring donation" } };
        }
      }

      // Step 2: if it starts today, charge the vault now.
      let initialTxnId: string | undefined;
      if (startsToday) {
        const chargeResp = await this.nmiPost(config, {
          type: "sale",
          amount,
          customer_vault_id: customerVaultId,
          ...this.billingFields(subscriptionData),
        });
        if (!this.isApproved(chargeResp)) {
          return { success: false, subscriptionId: "", data: { error: this.errorText(chargeResp) } };
        }
        initialTxnId = chargeResp.transactionid;
      }

      // Step 3: compute the next run date, then add the subscription.
      const nextRun = startsToday ? this.advance(anchorDate.getTime() <= Date.now() ? new Date() : anchorDate, subscriptionData.interval) : anchorDate;
      const freq = this.mapIntervalToNmi(subscriptionData.interval, nextRun);

      const subResp = await this.nmiPost(config, {
        recurring: "add_subscription",
        customer_vault_id: customerVaultId,
        plan_amount: amount,
        plan_payments: 0, // 0 = continue until cancelled
        start_date: this.nmiDate(nextRun),
        ...freq,
      });

      if (!this.isApproved(subResp) || !subResp.subscription_id) {
        return { success: false, subscriptionId: "", data: { error: this.errorText(subResp) || "Recurring schedule creation failed" } };
      }

      return {
        success: true,
        subscriptionId: subResp.subscription_id,
        data: {
          ...subResp,
          status: "active",
          customerId: String(customerVaultId),
          paymentMethodId: String(customerVaultId),
          nextRunDate: this.nmiDate(nextRun),
          initialChargeRef: initialTxnId,
        },
      };
    } catch (error: any) {
      console.error("KingdomFunding(NMI) createSubscription error:", error.message);
      return { success: false, subscriptionId: "", data: { error: "Subscription creation failed. Please try again." } };
    }
  }

  /**
   * Create an NMI Customer Vault record from a token or raw bank details.
   * Returns the customer_vault_id (we generate and supply it so it's stable/known).
   */
  private async vaultPaymentMethod(
    config: GatewayConfig,
    opts: { token?: string; isBank?: boolean; name?: string; subscriptionData?: any }
  ): Promise<string | undefined> {
    const vaultId = crypto.randomUUID();
    const params: Record<string, any> = {
      customer_vault: "add_customer",
      customer_vault_id: vaultId,
      ...this.splitName(opts.name || ""),
      email: opts.subscriptionData?.email || opts.subscriptionData?.person?.email || undefined,
    };

    if (opts.token) {
      params.payment_token = opts.token;
    } else if (opts.isBank && opts.subscriptionData) {
      params.payment = "check";
      params.checkname = opts.name || "";
      params.checkaba = opts.subscriptionData.routing_number;
      params.checkaccount = opts.subscriptionData.account_number;
      params.account_type = opts.subscriptionData.account_type || "checking";
      params.sec_code = opts.subscriptionData.sec_code || "WEB";
    } else {
      return undefined;
    }

    const resp = await this.nmiPost(config, params);
    if (!this.isApproved(resp)) {
      console.error("KingdomFunding(NMI) vaultPaymentMethod failed:", this.errorText(resp));
      return undefined;
    }
    // NMI echoes back the vault id we supplied (or its own in customer_vault_id).
    return resp.customer_vault_id || vaultId;
  }

  /** Advance a date by one interval (used to schedule the next run after charging today). */
  private advance(from: Date, interval: any): Date {
    const next = new Date(from);
    const str = (typeof interval === "string" ? interval : interval?.interval || "").toLowerCase();
    switch (str) {
      case "daily": next.setDate(next.getDate() + 1); break;
      case "one_week": case "weekly": next.setDate(next.getDate() + 7); break;
      case "two_week": case "biweekly": next.setDate(next.getDate() + 14); break;
      case "two_month": case "bimonthly": next.setMonth(next.getMonth() + 2); break;
      case "three_month": case "quarterly": next.setMonth(next.getMonth() + 3); break;
      case "six_month": case "biannually": next.setMonth(next.getMonth() + 6); break;
      case "one_year": case "annual": case "annually": next.setFullYear(next.getFullYear() + 1); break;
      default: next.setMonth(next.getMonth() + 1); break; // monthly
    }
    return next;
  }

  async updateSubscription(config: GatewayConfig, subscriptionData: any): Promise<SubscriptionResult> {
    try {
      const subscriptionId = subscriptionData.subscriptionId || subscriptionData.id;
      if (!subscriptionId) {
        return { success: false, subscriptionId: "", data: { error: "Missing subscription ID" } };
      }

      const params: Record<string, any> = { recurring: "update_subscription", subscription_id: subscriptionId };
      if (subscriptionData.amount) params.plan_amount = this.formatAmount(subscriptionData.amount);
      if (subscriptionData.interval) Object.assign(params, this.mapIntervalToNmi(subscriptionData.interval, new Date()));

      const resp = await this.nmiPost(config, params);
      if (!this.isApproved(resp)) {
        return { success: false, subscriptionId: String(subscriptionId), data: { error: this.errorText(resp) } };
      }
      return { success: true, subscriptionId: String(subscriptionId), data: resp };
    } catch (error: any) {
      console.error("KingdomFunding(NMI) updateSubscription error:", error.message);
      return { success: false, subscriptionId: subscriptionData.subscriptionId || "", data: { error: "Subscription update failed" } };
    }
  }

  async cancelSubscription(config: GatewayConfig, subscriptionId: string, _reason?: string): Promise<void> {
    const resp = await this.nmiPost(config, { recurring: "delete_subscription", subscription_id: subscriptionId });
    if (!this.isApproved(resp)) {
      console.error("KingdomFunding(NMI) cancelSubscription error:", { subscriptionId, error: this.errorText(resp) });
      throw new Error(this.errorText(resp) || "Failed to cancel subscription");
    }
  }

  // ─── Refunds ──────────────────────────────────────────────

  /**
   * Refund (settled) or void (unsettled) a transaction.
   * We attempt a refund; the caller can pass type:"void" to force a void.
   * Omit amount for a full refund.
   */
  async processRefund(config: GatewayConfig, refundData: any): Promise<ChargeResult> {
    try {
      const transactionId = refundData.transactionId || refundData.reference_number;
      if (!transactionId) {
        return { success: false, transactionId: "", data: { error: "Missing transaction ID for refund" } };
      }

      const type = refundData.type === "void" ? "void" : "refund";
      const params: Record<string, any> = { type, transactionid: transactionId };
      if (type === "refund" && refundData.amount) params.amount = this.formatAmount(refundData.amount);

      const resp = await this.nmiPost(config, params);
      if (this.isApproved(resp)) {
        return { success: true, transactionId: resp.transactionid || String(transactionId), data: resp };
      }
      return { success: false, transactionId: "", data: { error: this.errorText(resp), ...resp } };
    } catch (error: any) {
      console.error("KingdomFunding(NMI) processRefund error:", error.message);
      return { success: false, transactionId: "", data: { error: "Refund failed. Please try again." } };
    }
  }

  // ─── Fee Calculation ──────────────────────────────────────

  /**
   * Calculate transaction fees using KF-specific settings (flatRateKF / transFeeKF).
   * Fee logic is our own, not gateway-dependent — carried over unchanged.
   */
  async calculateFees(amount: number, churchId: string, _currency?: string): Promise<number> {
    let customFixedFee: number | null = null;
    let customPercentFee: number | null = null;

    if (churchId) {
      try {
        const response = await Axios.get(Environment.membershipApi + "/settings/public/" + churchId);
        const data = response.data;
        if (data?.flatRateKF !== null && data?.flatRateKF !== undefined && data?.flatRateKF !== "") customFixedFee = +data.flatRateKF;
        if (data?.transFeeKF !== null && data?.transFeeKF !== undefined && data?.transFeeKF !== "") customPercentFee = +data.transFeeKF / 100;
      } catch (err) {
        console.warn("KingdomFunding(NMI): Failed to load fee settings, using defaults", err);
      }
    }

    const fixedFee = customFixedFee ?? 0.3;
    const percentFee = customPercentFee ?? 0.029;
    return Math.round(((amount + fixedFee) / (1 - percentFee) - amount) * 100) / 100;
  }

  // ─── Customer & Payment Method Management ─────────────────

  /**
   * Create a bare Customer Vault record (contact info only).
   * Payment methods are attached separately via attachPaymentMethod (add_billing).
   * Returns the customer_vault_id.
   */
  async createCustomer(config: GatewayConfig, email: string, name: string): Promise<string> {
    const vaultId = crypto.randomUUID();
    const resp = await this.nmiPost(config, {
      customer_vault: "add_customer",
      customer_vault_id: vaultId,
      email: email || undefined,
      ...this.splitName(name),
    });
    if (!this.isApproved(resp)) {
      throw new Error(this.errorText(resp) || "Failed to create customer");
    }
    return resp.customer_vault_id || vaultId;
  }

  /**
   * Attach a payment method to a customer vault record.
   * - With options.customerId → add_billing to that vault (supports multiple methods).
   * - Without → add_customer creating a new vault record from the token/bank.
   * Returns an object with `.id` (the id callers persist) and `customer_vault_id`.
   */
  async attachPaymentMethod(config: GatewayConfig, paymentMethodId: string, options: any): Promise<any> {
    const token = options.source || options.token || (isLikelyToken(paymentMethodId) ? paymentMethodId : undefined);
    const customerId = options.customerId;

    const methodParams: Record<string, any> = {};
    if (token) {
      methodParams.payment_token = token;
    } else if (options.routing_number) {
      methodParams.payment = "check";
      methodParams.checkname = options.name || "";
      methodParams.checkaba = options.routing_number;
      methodParams.checkaccount = options.account_number;
      methodParams.account_type = options.account_type || "checking";
      methodParams.sec_code = options.sec_code || "WEB";
    } else {
      throw new Error("attachPaymentMethod requires a payment_token or bank details");
    }
    Object.assign(methodParams, this.splitName(options.name || ""));

    let resp: Record<string, string>;
    let vaultId: string;
    let billingId: string | undefined;

    if (customerId) {
      billingId = crypto.randomUUID();
      resp = await this.nmiPost(config, {
        customer_vault: "add_billing",
        customer_vault_id: customerId,
        billing_id: billingId,
        ...methodParams,
      });
      vaultId = customerId;
    } else {
      vaultId = crypto.randomUUID();
      resp = await this.nmiPost(config, {
        customer_vault: "add_customer",
        customer_vault_id: vaultId,
        ...methodParams,
      });
      vaultId = resp.customer_vault_id || vaultId;
    }

    if (!this.isApproved(resp)) {
      throw new Error(this.errorText(resp) || "Failed to save payment method");
    }

    // The persisted "payment method id" is the vault id (one method per donor vault by default).
    return { id: vaultId, customer_vault_id: vaultId, billing_id: billingId, ...resp };
  }

  /**
   * Remove a saved payment method. With a billing id we delete just that billing
   * record; otherwise we delete the whole vault customer.
   */
  async detachPaymentMethod(config: GatewayConfig, paymentMethodId: string, customerId?: string): Promise<any> {
    const params: Record<string, any> = customerId
      ? { customer_vault: "delete_billing", customer_vault_id: customerId, billing_id: paymentMethodId }
      : { customer_vault: "delete_customer", customer_vault_id: paymentMethodId };
    const resp = await this.nmiPost(config, params);
    if (!this.isApproved(resp)) {
      console.error("KingdomFunding(NMI) detachPaymentMethod error:", { paymentMethodId, customerId, error: this.errorText(resp) });
      throw new Error(this.errorText(resp) || "Failed to remove payment method");
    }
    return resp;
  }

  // ─── Read APIs (NMI Query API — returns XML) ──────────────
  // NOTE: These power "view recurring donations" and "manage saved methods" screens.
  // They hit NMI's Query API (query.php) which returns XML. Implemented with a light
  // tag extractor; field coverage to be confirmed against the sandbox in BCAI-6.

  async getSubscription(config: GatewayConfig, subscriptionId: string): Promise<any> {
    try {
      const resp = await Axios.get(this.getQueryUrl(config), {
        params: { security_key: config.privateKey, report_type: "recurring", subscription_id: subscriptionId },
        timeout: 15000,
      });
      const subs = parseNmiSubscriptions(typeof resp.data === "string" ? resp.data : "");
      return subs[0] || null;
    } catch (error: any) {
      console.error("KingdomFunding(NMI) getSubscription error:", error.message);
      return null;
    }
  }

  async getCustomerSubscriptions(config: GatewayConfig, customerId: string): Promise<any> {
    try {
      const resp = await Axios.get(this.getQueryUrl(config), {
        params: { security_key: config.privateKey, report_type: "recurring", customer_vault_id: customerId },
        timeout: 15000,
      });
      return parseNmiSubscriptions(typeof resp.data === "string" ? resp.data : "");
    } catch (error: any) {
      console.error("KingdomFunding(NMI) getCustomerSubscriptions error:", error.message);
      return [];
    }
  }

  async getCustomerPaymentMethods(config: GatewayConfig, customer: any): Promise<any> {
    try {
      const customerId = typeof customer === "string" ? customer : customer?.id || customer?.customerId;
      if (!customerId) return [];
      const resp = await Axios.get(this.getQueryUrl(config), {
        params: { security_key: config.privateKey, report_type: "customer_vault", customer_vault_id: customerId },
        timeout: 15000,
      });
      return parseNmiVaultMethods(typeof resp.data === "string" ? resp.data : "");
    } catch (error: any) {
      console.error("KingdomFunding(NMI) getCustomerPaymentMethods error:", error.message);
      return [];
    }
  }

  // ─── Event & Donation Logging ─────────────────────────────

  async logEvent(churchId: string, event: any, eventData: any, repos: any): Promise<void> {
    try {
      const eventLog = new EventLog();
      eventLog.churchId = churchId;
      eventLog.eventType = eventData?.eventType || event?.event_type || "unknown";
      eventLog.provider = "kingdomfunding";
      eventLog.providerId = eventData?.id?.toString() || event?.event_id?.toString() || "";
      eventLog.message = JSON.stringify(event);
      await repos.eventLog.save(eventLog);
    } catch (err) {
      console.error("KingdomFunding(NMI) logEvent error:", err);
    }
  }

  async logDonation(
    _config: GatewayConfig,
    churchId: string,
    eventData: any,
    repos: any,
    _status: "pending" | "complete" = "complete"
  ): Promise<any> {
    try {
      let amount = Number(eventData.auth_amount || eventData.amount || eventData.transaction?.amount || 0);

      // Find person — from direct person data (charge flow) or customer/txn lookup (webhook flow).
      let personId: string | undefined;
      if (eventData.person?.id) {
        personId = eventData.person.id;
      } else {
        const customerVaultId = eventData.customer_vault_id || eventData.transaction?.customer_vault_id;
        if (customerVaultId) {
          const customer = await repos.customer.load(churchId, String(customerVaultId));
          if (customer) personId = customer.personId;
        }
        if (!personId) {
          const refNum = eventData.reference_number || eventData.id || eventData.transaction?.transaction_id;
          if (refNum) {
            const existing = await repos.donation.loadByTransactionId(churchId, String(refNum));
            if (existing?.personId) personId = existing.personId;
          }
        }
      }

      // Payment method type. Prefer an explicit paymentType ("bank") passed by the
      // charge flow, since NMI's token-sale response doesn't echo bank details.
      const isCheck =
        eventData.paymentType === "bank" ||
        eventData.type === "bank" ||
        !!(eventData.check_account || eventData.transaction?.check_account || eventData.account_type);
      const method = isCheck ? "ACH" : "Card";
      const last4 = eventData.last_4 || eventData.cc_number?.slice(-4) || "";
      const methodDetails = isCheck ? `Check ****${last4}` : `${eventData.card_type || "Card"} ****${last4}`;

      const batch: DonationBatch = await repos.donationBatch.getOrCreateCurrent(churchId);
      const refNumber = String(eventData.reference_number || eventData.id || eventData.transaction?.transaction_id || "");

      let donationDate: Date = new Date();
      const txTimestamp = eventData.transaction?.created_at || eventData.created_at || eventData.timestamp;
      if (txTimestamp) {
        const parsed = new Date(txTimestamp);
        if (!isNaN(parsed.getTime())) donationDate = parsed;
      }

      const donation: Donation = {
        churchId,
        batchId: batch.id,
        personId,
        transactionId: refNumber,
        donationDate,
        amount,
        method,
        methodDetails,
        notes: `KingdomFunding ref: ${refNumber}`,
      };

      const savedDonation = await repos.donation.save(donation);

      const fundsArray = eventData.subscriptionFunds || eventData.funds || [];
      if (fundsArray.length > 0) {
        for (const fund of fundsArray) {
          const fundDonation: FundDonation = {
            churchId,
            donationId: savedDonation.id,
            fundId: fund.fundId || fund.id || "",
            amount: fund.amount || 0,
          };
          await repos.fundDonation.save(fundDonation);
        }
      } else if (eventData.fundId) {
        const fundDonation: FundDonation = { churchId, donationId: savedDonation.id, fundId: eventData.fundId, amount };
        await repos.fundDonation.save(fundDonation);
      }

      return savedDonation;
    } catch (err) {
      console.error("KingdomFunding(NMI) logDonation error:", err);
      throw err;
    }
  }

  async updateDonationStatus(
    churchId: string,
    transactionId: string,
    status: "pending" | "complete" | "failed",
    repos: any
  ): Promise<void> {
    try {
      const donation = await repos.donation.loadByTransactionId(churchId, transactionId);
      if (donation) {
        await repos.donation.save({ ...donation, notes: `${donation.notes || ""} [status: ${status}]` });
      }
    } catch (err) {
      console.error("KingdomFunding(NMI) updateDonationStatus error:", err);
    }
  }
}

// ─── Module-level helpers ───────────────────────────────────

function safeJsonParse(s: string): any {
  try { return JSON.parse(s); } catch { return {}; }
}

/** Heuristic: distinguish a Collect.js payment_token from a numeric saved-id. */
function isLikelyToken(value: any): boolean {
  if (!value) return false;
  const s = String(value);
  // Collect.js tokens are long alphanumeric strings with dashes; saved ids are short/numeric/UUID.
  return s.length > 20 && /[A-Za-z]/.test(s) && /-/.test(s);
}

/**
 * Minimal extractor for repeated <tag>value</tag> pairs from NMI Query API XML.
 * Avoids adding an XML parser dependency for the few fields the UI needs.
 * Field coverage to be confirmed against sandbox responses (BCAI-6).
 */
function extractAll(xml: string, blockTag: string): string[] {
  const re = new RegExp(`<${blockTag}[\\s>][\\s\\S]*?</${blockTag}>`, "g");
  return xml.match(re) || [];
}
function tag(xml: string, name: string): string {
  const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return m ? m[1].trim() : "";
}

function parseNmiSubscriptions(xml: string): any[] {
  // NOTE: NMI Query API (query.php) XML tag names should be confirmed against a live
  // subscription list during sandbox webhook/recurring testing; these are best-effort.
  const freqFromTags = (block: string): string => {
    const month = tag(block, "month_frequency");
    const day = tag(block, "day_frequency");
    if (month) return month === "3" ? "quarterly" : month === "6" ? "biannually" : month === "12" ? "annually" : month === "2" ? "bimonthly" : "monthly";
    if (day) return day === "7" ? "weekly" : day === "14" ? "biweekly" : day === "1" ? "daily" : "monthly";
    return "monthly";
  };
  return extractAll(xml, "subscription").map((block) => ({
    id: tag(block, "subscription_id"),
    amount: tag(block, "plan_amount") || tag(block, "amount"),
    nextRunDate: tag(block, "next_charge_date"),
    status: tag(block, "subscription_status") || "active",
    frequency: freqFromTags(block),
    customer_vault_id: tag(block, "customer_vault_id"),
    raw: block,
  }));
}

function parseNmiVaultMethods(xml: string): any[] {
  return extractAll(xml, "billing").map((block) => ({
    id: tag(block, "billing_id"),
    last4: (tag(block, "cc_number") || tag(block, "check_account")).slice(-4),
    cardType: tag(block, "cc_type"),
    expiry: tag(block, "cc_exp"),
    type: tag(block, "account_type") ? "ach" : "card",
    raw: block,
  }));
}
