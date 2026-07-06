import express from "express";
import crypto from "crypto";
import { AbstractExperimentalGatewayProvider } from "./AbstractExperimentalGatewayProvider.js";
import { GatewayConfig, WebhookResult, ChargeResult, SubscriptionResult, ProviderCapabilities, WebhookEventClassification } from "./IGatewayProvider.js";
import Axios from "axios";
import { Environment } from "../Environment.js";
import { Donation, DonationBatch, EventLog, FundDonation } from "../../../modules/giving/models/index.js";

/**
 * KingdomFunding payment gateway provider — backed by NMI (Network Merchants Inc.).
 *
 * Supports:
 * - One-time card + ACH charges via Collect.js single-use `payment_token`
 * - Customer Vault for reusable saved payment methods
 * - Recurring subscriptions (vault the method, optional charge-today, then schedule)
 * - Refund / void
 * - Webhooks with HMAC-SHA256 signature verification
 *
 * DB column mapping (unchanged from the prior backend — only the values are NMI's):
 *   gateways.publicKey  = NMI Collect.js tokenization key (public, browser-side)
 *   gateways.privateKey = NMI Security Key (server secret, encrypted)
 *   gateways.webhookKey = NMI webhook signing key (self-chosen in the NMI portal, encrypted)
 *
 * Sandbox vs. production is determined by the account behind the Security Key — the
 * same host serves both. NMI_API_URL / NMI_QUERY_URL allow a local test harness to
 * point at a mock host.
 */
export class KingdomFundingGatewayProvider extends AbstractExperimentalGatewayProvider {
  readonly name = "kingdomfunding";
  // Card charges are money-in-hand at charge time; webhooks only confirm ACH settlement.
  readonly logsDonationsImmediately = true;
  readonly recreatesMissingCustomers = true;

  readonly capabilities: ProviderCapabilities = {
    supportsOneTimePayments: true,
    supportsSubscriptions: true,
    supportsVault: true,
    supportsACH: true,
    supportsRefunds: false,
    supportsPartialRefunds: false,
    supportsWebhooks: true,
    supportsOrders: false,
    supportedPaymentMethods: ["card", "ach"],
    supportedCurrencies: ["usd"],
    requiresPlansForSubscriptions: false,
    requiresCustomerForSubscription: true,
    supportsInstantCapture: true,
    supportsManualCapture: false,
    supportsSCA: false,
    maxRefundWindow: 180,
    minTransactionAmount: 1,
    maxTransactionAmount: 2000000000,
    notes: ["Powered by KingdomFunding", "Reusable saved payment methods", "Single-step recurring schedules"]
  };

  classifyWebhookEvent(eventType: string): WebhookEventClassification {
    // "succeeded.charge" covers card + initial ACH; "status.settled" confirms ACH settlement.
    if (eventType === "succeeded.charge" || eventType === "status.settled") return { action: "donation", status: "complete" };
    return { action: "ignore" };
  }

  async createProduct(_config: GatewayConfig, _churchId: string): Promise<string> {
    return "";
  }

  // Charge-time vaulting: saveCard vaults the nonce (creating the vault customer in the same
  // call — a bare add_customer without payment data is rejected by NMI), then charges the
  // saved method; saved-method requests arrive as bare numeric PM ids.
  async prepareCharge(config: GatewayConfig, donationData: any, repos: any): Promise<void> {
    if (donationData.saveCard) {
      try {
        const personName = donationData.person?.name || donationData.name || "";
        const personId = donationData.person?.id;

        let customerId: string | undefined;
        if (personId) {
          const existingCustomer = await repos.customer.loadByPersonAndProvider(config.churchId, personId, this.name) as any;
          if (existingCustomer) customerId = existingCustomer.id;
        }

        const nonceToken = donationData.token || donationData.id || "";
        const nonceSource = nonceToken.startsWith("nonce-") ? nonceToken : `nonce-${nonceToken}`;

        const attachOptions: any = {
          source: nonceSource,
          name: personName,
          personId
        };
        if (customerId) attachOptions.customerId = customerId;
        if (donationData.expiry_month) attachOptions.expiry_month = Number(donationData.expiry_month);
        if (donationData.expiry_year) {
          let ey = Number(donationData.expiry_year);
          if (ey > 0 && ey < 100) ey += 2000;
          attachOptions.expiry_year = ey;
        }

        let pm: any;
        try {
          pm = await this.attachPaymentMethod(config, nonceSource, attachOptions);
        } catch (attachErr: any) {
          // Stale local customer record: retry without it so a fresh vault is created from the token.
          const status = attachErr.response?.status || attachErr.statusCode;
          if (status === 404 && customerId) {
            console.log(`Customer ${customerId} not found on the gateway, vaulting a fresh one...`);
            delete attachOptions.customerId;
            customerId = undefined;
            pm = await this.attachPaymentMethod(config, nonceSource, attachOptions);
          } else {
            throw attachErr;
          }
        }

        const savedPmId = pm?.id;
        if (savedPmId) {
          customerId = String(pm.customer_vault_id || customerId || savedPmId);
          if (personId) {
            await repos.customer.save({ id: customerId, churchId: config.churchId, personId, provider: this.name });
          }
          const cardType = pm.card_type || donationData.cardBrand || "Card";
          const last4 = pm.last_4 || donationData.cardLast4 || "";
          await repos.gatewayPaymentMethod.save({
            churchId: config.churchId,
            gatewayId: config.gatewayId,
            customerId,
            externalId: String(savedPmId),
            methodType: donationData.type === "check" ? "bank" : "card",
            displayName: `${cardType} ****${last4}`,
            metadata: { card_type: cardType, last_4: last4 }
          } as any);

          donationData.paymentMethodId = String(savedPmId);
          donationData.customerId = customerId;
          delete donationData.id; // Remove nonce so processCharge uses pm-{id}
          delete donationData.token;
        }
      } catch (saveCardErr: any) {
        // Never log raw response body; can contain donor PII (billing name, last_4, AVS zip).
        console.warn("Charge: Failed to save card before charge (non-fatal, charging with nonce):", saveCardErr.response?.status || "", saveCardErr.response?.data?.error_message || saveCardErr.message);
        // Fall through — charge will proceed with original nonce
      }
    }

    // Saved payment method: frontend sends a numeric PM id. Move it to paymentMethodId so
    // processCharge uses pm-{id} instead of treating it as a nonce.
    if (donationData.id && !donationData.paymentMethodId && /^\d+$/.test(String(donationData.id))) {
      donationData.paymentMethodId = String(donationData.id);
      delete donationData.id;
    }
  }

  // Reuse the person's existing vault customer so schedules attach to it.
  async prepareSubscription(config: GatewayConfig, subscriptionData: any, person: any, repos: any): Promise<void> {
    if (person?.id && !subscriptionData.customerId) {
      const existing = await repos.customer.loadByPersonAndProvider(config.churchId, person.id, this.name) as any;
      if (existing?.id) subscriptionData.customerId = existing.id;
    }
  }

  // Persist the vault customer created during subscription; the returned id is stored on the local row.
  async finalizeSubscription(config: GatewayConfig, result: SubscriptionResult, subscriptionData: any, person: any, repos: any): Promise<string | undefined> {
    const customerId = result.data?.customerId ? String(result.data.customerId) : subscriptionData.customerId;
    if (customerId && person?.id) {
      try {
        await repos.customer.save({ id: customerId, churchId: config.churchId, personId: person.id, provider: this.name });
      } catch { /* customer may already exist, ignore */ }
    }
    return customerId;
  }

  async verifySubscriptionOwnership(config: GatewayConfig, subscriptionId: string, personId: string, repos: any): Promise<boolean> {
    const schedule = await this.getSubscription(config, subscriptionId).catch(() => null);
    const remoteCustomerId = schedule?.customer_id ? String(schedule.customer_id) : null;
    if (!remoteCustomerId) return false;
    const ownerCustomer = await repos.customer.loadByPersonAndProvider(config.churchId, personId, this.name).catch(() => null) as any;
    return !!ownerCustomer && String(ownerCustomer.id) === remoteCustomerId;
  }

  // The attach flow keys saved methods to the provider-scoped customer, not the request-supplied id.
  async resolveCustomerForAttach(config: GatewayConfig, personId: string | undefined, _requestCustomerId: string | undefined, repos: any): Promise<string | undefined> {
    if (!personId) return undefined;
    const providerCustomer = await repos.customer.loadByPersonAndProvider(config.churchId, personId, this.name) as any;
    return providerCustomer?.id || undefined;
  }

  buildAttachOptions(customerId: string, tokenId: string, body: any): any {
    const opts: any = { customer: customerId, customerId, personId: body.personId };
    if (body.routing_number && body.account_number) {
      opts.routing_number = body.routing_number;
      opts.account_number = body.account_number;
      opts.account_type = body.account_type || "checking";
      opts.name = body.name;
    } else {
      opts.source = tokenId;
      if (body.expiry_month) opts.expiry_month = body.expiry_month;
      if (body.expiry_year) opts.expiry_year = body.expiry_year;
      if (body.cardBrand) opts.cardBrand = body.cardBrand;
      if (body.cardLast4) opts.cardLast4 = body.cardLast4;
    }
    return opts;
  }

  buildLocalMethodRecord(pm: any, body: any, _tokenId: string): { methodType: string; displayName: string; metadata: any } | null {
    const isBank = pm?.type === "check"
      || pm?.account_type
      || !!pm?.routing_number
      || !!body?.routing_number
      || body?.type === "bank"; // Collect.js ACH token carries no raw bank fields, only the type flag

    if (isBank) {
      const acctType = pm?.account_type || body?.account_type || "checking";
      const last4 = pm?.last4
        || (pm?.account_number ? String(pm.account_number).slice(-4) : "")
        || (body?.account_number ? String(body.account_number).slice(-4) : "")
        || body?.cardLast4 || ""; // Collect.js ACH token sends the account last4 as cardLast4
      const acctLabel = acctType.charAt(0).toUpperCase() + acctType.slice(1);
      return {
        methodType: "bank",
        displayName: `Bank ${acctLabel} •••• ${last4}`.trim(),
        metadata: { status: pm?.status, brand: acctType || "Bank", last4 }
      };
    }

    const cardType = pm?.card_type || body?.cardBrand || "Card";
    const last4 = pm?.last_4 || body?.cardLast4 || "";
    return {
      methodType: "card",
      displayName: `${cardType} •••• ${last4}`.trim(),
      metadata: { status: pm?.status, brand: pm?.card_type || body?.cardBrand, last4 }
    };
  }

  ownsPaymentMethodId(id: string): boolean {
    // Numeric ids are vault payment-method ids on this gateway.
    return /^\d+$/.test(id);
  }

  // Detach, cascading active recurring schedules tied to the method when the gateway refuses.
  async deletePaymentMethod(config: GatewayConfig, paymentMethodId: string, customerId: string, repos: any): Promise<void> {
    try {
      await this.detachPaymentMethod(config, paymentMethodId);
    } catch (detachErr: any) {
      const msg = detachErr?.message || "";
      if (!msg.includes("active recurring")) throw detachErr;
      try {
        const schedules = await this.getCustomerSubscriptions(config, customerId);
        const activeSchedules = (schedules || []).filter((s: any) => s.payment_method_id?.toString() === paymentMethodId && s.active !== false);
        for (const schedule of activeSchedules) {
          try {
            await this.cancelSubscription(config, schedule.id.toString());
            await repos.subscription.delete(config.churchId, schedule.id.toString()).catch(() => { });
          } catch (cancelErr: any) {
            console.error("[PM Delete] Failed to cancel schedule", schedule.id, cancelErr.message);
          }
        }
        await this.detachPaymentMethod(config, paymentMethodId);
      } catch (retryErr: any) {
        // Could not delete from the gateway — proceed to clean up locally only
        console.warn("[PM Delete] Could not delete PM from provider, cleaning up local records only:", retryErr?.message || retryErr);
      }
    }

    // The vault is gone; drop the person→vault mapping too, or the next vaulting/subscribe
    // attempt reuses the dead vault id and fails.
    try {
      const customerRecord = await repos.customer.load(config.churchId, customerId) as any;
      if (customerRecord && (customerRecord.provider || "").toLowerCase() === this.name) {
        await repos.customer.delete(config.churchId, customerId);
      }
    } catch (cleanupErr: any) {
      console.warn("[PM Delete] Failed to remove local customer mapping:", cleanupErr?.message || cleanupErr);
    }
  }

  // Soft-delete model: a payment method only appears if it has a local gatewayPaymentMethods
  // record. Users can "delete" without revoking the card at the gateway (which would break
  // any other system using it).
  async listNormalizedPaymentMethods(config: GatewayConfig, customer: any, repos: any): Promise<any[]> {
    const raw = await this.getCustomerPaymentMethods(config, customer);
    if (!Array.isArray(raw)) return [];
    const customerId = typeof customer === "string" ? customer : customer?.id;
    const localRecords = await repos.gatewayPaymentMethod.loadByCustomer(config.churchId, config.gatewayId, customerId);
    const localExternalIds = new Set(localRecords.map((r: any) => String(r.externalId)));
    const normalized: any[] = [];
    for (const pm of raw) {
      const pmId = String(pm.id);
      if (!localExternalIds.has(pmId)) continue; // soft-deleted by user
      normalized.push({
        id: pmId,
        type: pm.type === "check" ? "bank" : "card",
        provider: this.name,
        name: pm.card_type || pm.type || "Card",
        last4: pm.last_4 || pm.last4 || "",
        customerId,
        gatewayId: config.gatewayId,
        status: "active"
      });
    }
    return normalized;
  }

  // Normalize NMI recurring schedules to the Stripe-like shape the UI expects.
  async listNormalizedSubscriptions(config: GatewayConfig, customerId: string): Promise<any[]> {
    const subs = await this.getCustomerSubscriptions(config, customerId);
    const normalized: any[] = [];
    for (const sub of (Array.isArray(subs) ? subs : [])) {
      // The gateway marks cancelled/expired schedules active:false — skip those.
      if (!sub.active) continue;
      const amountCents = Math.round((sub.amount || 0) * 100);
      // Use next_run_date so the "Start Date" column shows the next charge date.
      const anchorSrc = sub.next_run_date || sub.created_at;
      const freq = this.mapFrequency(sub.frequency);
      normalized.push({
        id: String(sub.id),
        status: "active",
        billing_cycle_anchor: anchorSrc
          ? Math.floor(new Date(anchorSrc).getTime() / 1000)
          : Math.floor(Date.now() / 1000),
        default_payment_method: sub.payment_method_id ? String(sub.payment_method_id) : undefined,
        plan: {
          amount: amountCents,
          interval: freq.interval,
          interval_count: freq.interval_count
        }
      });
    }
    return normalized;
  }

  private mapFrequency(frequency: string): { interval: string; interval_count: number } {
    switch (frequency?.toLowerCase()) {
      case "daily": return { interval: "day", interval_count: 1 };
      case "weekly": return { interval: "week", interval_count: 1 };
      case "biweekly": return { interval: "week", interval_count: 2 };
      case "monthly": return { interval: "month", interval_count: 1 };
      case "bimonthly": return { interval: "month", interval_count: 2 };
      case "quarterly": return { interval: "month", interval_count: 3 };
      case "biannually": return { interval: "month", interval_count: 6 };
      case "annually": return { interval: "year", interval_count: 1 };
      default: return { interval: "month", interval_count: 1 };
    }
  }

  private getApiUrl(): string {
    return process.env.NMI_API_URL || "https://secure.nmi.com/api/transact.php";
  }

  /** NMI Query API (read side: vault records, subscriptions). Returns XML. */
  private getQueryUrl(): string {
    return process.env.NMI_QUERY_URL || "https://secure.nmi.com/api/query.php";
  }

  /**
   * POST a form-urlencoded request to the NMI Payment API and parse the
   * url-encoded response into a flat string map. security_key is always injected
   * from config.privateKey. NMI returns HTTP 200 with response=2/3 for declines,
   * so only transport failures throw.
   */
  private async nmiPost(config: GatewayConfig, params: Record<string, any>): Promise<Record<string, string>> {
    const body = new URLSearchParams();
    body.set("security_key", config.privateKey || "");
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null || v === "") continue;
      body.set(k, String(v));
    }

    const response = await Axios.post(this.getApiUrl(), body.toString(), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      timeout: 30000
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
      email: email || undefined
    };
  }

  /** NMI expects amounts as a decimal string with 2 places, e.g. "10.00". */
  private formatAmount(amount: any): string {
    const n = Number(amount);
    return (isNaN(n) ? 0 : n).toFixed(2);
  }

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
   * `body` must be the RAW request body (string/Buffer) — a re-serialized JSON
   * object will not reproduce the signature. DonateController passes the raw body.
   *
   * NMI event types are normalized here to the canonical strings DonateController
   * already keys on (`succeeded.charge`, `status.settled`, `status.originated`) so
   * the controllers stay provider-agnostic.
   */
  async verifyWebhookSignature(
    config: GatewayConfig,
    headers: express.Request["headers"],
    body: any
  ): Promise<WebhookResult> {
    const signatureHeader = (headers["webhook-signature"] || "") as string;
    const webhookSecret = config.webhookKey;

    if (!webhookSecret) {
      console.error("KingdomFunding(NMI) webhook: no signing key configured for this church; rejecting.");
      return { success: false, shouldProcess: false };
    }
    if (!signatureHeader) {
      console.error("KingdomFunding(NMI) webhook: missing Webhook-Signature header; rejecting.");
      return { success: false, shouldProcess: false };
    }

    // Parse `t=<nonce>,s=<sig>`
    const sigParts: Record<string, string> = {};
    for (const seg of signatureHeader.split(",")) {
      const idx = seg.indexOf("=");
      if (idx > 0) sigParts[seg.slice(0, idx).trim()] = seg.slice(idx + 1).trim();
    }
    const nonce = sigParts.t;
    const provided = sigParts.s;
    if (!nonce || !provided) {
      console.error("KingdomFunding(NMI) webhook: malformed Webhook-Signature header; rejecting.");
      return { success: false, shouldProcess: false };
    }

    const rawBody = typeof body === "string" ? body : Buffer.isBuffer(body) ? body.toString("utf8") : JSON.stringify(body ?? {});
    const expected = crypto.createHmac("sha256", webhookSecret).update(`${nonce}.${rawBody}`, "utf-8").digest("hex");

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

    // NMI webhook payload: { event_id, event_type, event_body }.
    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      console.error("KingdomFunding(NMI) webhook: malformed JSON payload; rejecting.");
      return { success: false, shouldProcess: false };
    }

    const nmiType: string = payload?.event_type || ""; // e.g. "transaction.sale.success", "check.status.settled"
    const eventId: string = payload?.event_id || "";
    const eventBody: any = payload?.event_body || {};
    const [category, action, result] = nmiType.split(".");

    // Map NMI event types onto the canonical strings DonateController keys on:
    //   succeeded.charge  -> card/ACH token sale accepted (treated complete)
    //   status.settled    -> ACH settled (complete)
    //   status.originated -> ACH still in flight (pending; not yet processed)
    let canonicalType = nmiType;
    if (category === "transaction" && (action === "sale" || action === "auth") && result === "success") {
      canonicalType = "succeeded.charge";
    } else if (category === "check") {
      if (result === "settled") canonicalType = "status.settled";
      else if (result === "pending" || result === "processing" || result === "originated") canonicalType = "status.originated";
      else canonicalType = `status.${result || action || "update"}`;
    }

    const shouldProcess = canonicalType === "succeeded.charge" || canonicalType === "status.settled";

    const txn = eventBody.transaction || eventBody;
    const transactionId = txn.transaction_id || txn.transactionid || eventBody.transaction_id || eventId;
    const isCheck = category === "check" || !!txn.check_account;
    const last4 = txn.cc_last_4 || txn.cc_number_masked?.slice(-4) || (txn.check_account ? String(txn.check_account).slice(-4) : "");

    return {
      success: true,
      shouldProcess,
      eventType: canonicalType,
      eventId,
      eventData: {
        ...eventBody,
        id: transactionId,
        reference_number: transactionId,
        customer_vault_id: txn.customer_vault_id || eventBody.customer_vault_id,
        auth_amount: txn.amount || eventBody.amount,
        amount: txn.amount || eventBody.amount,
        last_4: last4,
        card_type: txn.cc_type || txn.card_type,
        paymentType: isCheck ? "bank" : "card",
        check_account: txn.check_account,
        created_at: txn.created_at || payload.event_time,
        eventType: canonicalType,
        eventCategory: category
      }
    };
  }

  /**
   * Process a one-time charge via NMI.
   *
   * Payment source resolution (explicit, no heuristics — NMI Collect.js tokens and
   * vault ids are both GUID-shaped, so the caller must disambiguate):
   *   1. saved method → customer_vault_id (donationData.paymentMethodId)
   *   2. Collect.js   → payment_token (donationData.token / donationData.id)
   *   3. raw bank     → processBankCharge (routing/account fields)
   *
   * A Collect.js payment_token already encodes card vs. ACH, so both flow through here.
   */
  async processCharge(config: GatewayConfig, donationData: any): Promise<ChargeResult> {
    const hasRawBank = donationData.routing_number && donationData.account_number;
    if ((donationData.type === "bank" || donationData.paymentType === "bank") && hasRawBank && !donationData.paymentMethodId) {
      return this.processBankCharge(config, donationData);
    }

    try {
      const params: Record<string, any> = {
        type: "sale",
        amount: this.formatAmount(donationData.amount),
        ...this.billingFields(donationData)
      };

      const vaultId = donationData.paymentMethodId;
      const token = donationData.token || donationData.id;

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
            // Carry the payment type so logDonation labels ACH correctly — NMI's
            // token-sale response doesn't echo bank details to infer it from.
            paymentType: donationData.type === "bank" ? "bank" : "card"
          }
        };
      }

      console.error("KingdomFunding(NMI) processCharge declined:", this.errorText(resp));
      return { success: false, transactionId: "", data: { error: this.errorText(resp), ...resp } };
    } catch (error: any) {
      const msg = error.response?.data || error.message || "Charge failed";
      console.error("KingdomFunding(NMI) processCharge error:", typeof msg === "string" ? msg.slice(0, 200) : JSON.stringify(msg));
      return { success: false, transactionId: "", data: { error: "Charge failed. Please try again." } };
    }
  }

  /**
   * Process a bank/ACH charge from RAW routing/account details.
   * Token-based ACH goes through processCharge with a Collect.js payment_token;
   * this raw path exists only as a legacy fallback for callers that send bank
   * numbers directly (no client-side tokenization).
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
        account_type: donationData.account_type || "checking",
        account_holder_type: donationData.account_holder_type || "personal",
        sec_code: donationData.sec_code || "WEB",
        ...this.billingFields(donationData)
      };

      const resp = await this.nmiPost(config, params);

      if (this.isApproved(resp)) {
        return {
          success: true,
          transactionId: resp.transactionid || "",
          data: { ...resp, status: "active", reference_number: resp.transactionid, auth_amount: params.amount, paymentType: "bank" }
        };
      }
      console.error("KingdomFunding(NMI) processBankCharge declined:", this.errorText(resp));
      return { success: false, transactionId: "", data: { error: this.errorText(resp), ...resp } };
    } catch (error: any) {
      console.error("KingdomFunding(NMI) processBankCharge error:", error.message);
      return { success: false, transactionId: "", data: { error: "ACH charge failed. Please try again." } };
    }
  }

  /**
   * Normalize an interval into a count + unit. The frontend sends an object
   * `{ interval_count, interval: "week"|"month"|"year"|"day" }` (bare unit, see
   * DonationHelper.getInterval); legacy callers may send a string like "biweekly"
   * or "one_month". Both must map correctly — getting this wrong bills donors at
   * the wrong cadence.
   */
  private normalizeInterval(interval: any): { count: number; unit: "day" | "week" | "month" | "year" } {
    if (interval && typeof interval === "object") {
      const count = Math.max(1, Math.round(Number(interval.interval_count) || 1));
      return { count, unit: this.normalizeUnit(interval.interval || interval.frequency) };
    }
    const s = String(interval || "").toLowerCase();
    const legacy: Record<string, { count: number; unit: "day" | "week" | "month" | "year" }> = {
      daily: { count: 1, unit: "day" },
      weekly: { count: 1, unit: "week" },
      one_week: { count: 1, unit: "week" },
      biweekly: { count: 2, unit: "week" },
      two_week: { count: 2, unit: "week" },
      monthly: { count: 1, unit: "month" },
      one_month: { count: 1, unit: "month" },
      bimonthly: { count: 2, unit: "month" },
      two_month: { count: 2, unit: "month" },
      quarterly: { count: 3, unit: "month" },
      three_month: { count: 3, unit: "month" },
      biannually: { count: 6, unit: "month" },
      six_month: { count: 6, unit: "month" },
      annually: { count: 1, unit: "year" },
      annual: { count: 1, unit: "year" },
      one_year: { count: 1, unit: "year" }
    };
    return legacy[s] || { count: 1, unit: this.normalizeUnit(s) };
  }

  private normalizeUnit(unit: any): "day" | "week" | "month" | "year" {
    const s = String(unit || "").toLowerCase().replace(/s$/, "");
    if (s === "day") return "day";
    if (s === "week") return "week";
    if (s === "year") return "year";
    return "month";
  }

  /**
   * Map our frontend interval to NMI recurring frequency fields.
   * NMI uses EITHER day_frequency OR (month_frequency + day_of_month) — never both.
   */
  private mapIntervalToNmi(interval: any, anchorDate: Date): Record<string, any> {
    const { count, unit } = this.normalizeInterval(interval);
    const dayOfMonth = anchorDate.getDate();
    switch (unit) {
      case "day": return { day_frequency: count };
      case "week": return { day_frequency: 7 * count };
      case "year": return { month_frequency: 12 * count, day_of_month: dayOfMonth };
      default: return { month_frequency: count, day_of_month: dayOfMonth };
    }
  }

  /** Format a Date as NMI's YYYYMMDD start_date. */
  private nmiDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}${m}${day}`;
  }

  /** Advance a date by one interval (used to schedule the next run after charging today). */
  private advance(from: Date, interval: any): Date {
    const { count, unit } = this.normalizeInterval(interval);
    const next = new Date(from);
    switch (unit) {
      case "day": next.setDate(next.getDate() + count); break;
      case "week": next.setDate(next.getDate() + 7 * count); break;
      case "year": next.setFullYear(next.getFullYear() + count); break;
      default: next.setMonth(next.getMonth() + count); break;
    }
    return next;
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
      ...await this.lookupBillingAddress(config.churchId, opts.subscriptionData?.person?.id)
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
    return resp.customer_vault_id || vaultId;
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
      const token = subscriptionData.token || subscriptionData.id;
      const isBank = subscriptionData.type === "bank" || (subscriptionData.routing_number && subscriptionData.account_number);

      // Determine start timing.
      let startsToday = true;
      let anchorDate = new Date();
      if (subscriptionData.billing_cycle_anchor) {
        let anchorMs = subscriptionData.billing_cycle_anchor;
        if (anchorMs < 10000000000) anchorMs = anchorMs * 1000;
        anchorDate = new Date(anchorMs);
        const today = new Date();
        startsToday = anchorDate.toISOString().split("T")[0] === today.toISOString().split("T")[0] || anchorDate <= today;
      }

      // Step 1: obtain a vault id. A fresh Collect.js token (or raw bank) means the donor
      // entered a new method for this gift, so vault it — even if they already have a saved
      // customer on file (DonateController pre-loads it). Only reuse a saved vault id when no
      // new method was supplied.
      const hasFreshMethod = !!token || (isBank && subscriptionData.routing_number && subscriptionData.account_number);
      const customerVaultId: string | undefined = hasFreshMethod
        ? await this.vaultPaymentMethod(config, { token, isBank, name, subscriptionData })
        : subscriptionData.paymentMethodId || subscriptionData.customerId;
      if (!customerVaultId) {
        console.error("KingdomFunding(NMI) createSubscription: no vaulted payment method available");
        return { success: false, subscriptionId: "", data: { error: "Failed to save payment method for recurring donation" } };
      }

      // Step 2: if it starts today, charge the vault now.
      let initialTxnId: string | undefined;
      if (startsToday) {
        const chargeResp = await this.nmiPost(config, {
          type: "sale",
          amount,
          customer_vault_id: customerVaultId,
          ...this.billingFields(subscriptionData)
        });
        if (!this.isApproved(chargeResp)) {
          console.error("KingdomFunding(NMI) createSubscription initial charge declined:", this.errorText(chargeResp));
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
        ...freq
      });

      if (!this.isApproved(subResp) || !subResp.subscription_id) {
        console.error("KingdomFunding(NMI) createSubscription schedule declined:", this.errorText(subResp));
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
          initialChargeRef: initialTxnId
        }
      };
    } catch (error: any) {
      console.error("KingdomFunding(NMI) createSubscription error:", error.message);
      return { success: false, subscriptionId: "", data: { error: "Subscription creation failed. Please try again." } };
    }
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
        console.error("KingdomFunding(NMI) updateSubscription declined:", this.errorText(resp));
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

  /**
   * Refund (settled) or void (unsettled) a transaction. Pass type:"void" to force a
   * void; omit amount for a full refund.
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

  /**
   * Calculate transaction fees using KF-specific settings (flatRateKF / transFeeKF).
   * Fee logic is our own, not gateway-dependent.
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
    // Clamp to [0, 0.99] so a misconfigured fee (>=100%) can't divide by zero or go negative.
    const percentFee = Math.min(Math.max(customPercentFee ?? 0.029, 0), 0.99);
    return Math.round(((amount + fixedFee) / (1 - percentFee) - amount) * 100) / 100;
  }

  /**
   * The donor's billing address from their person record; some NMI merchant accounts
   * reject vault writes without one. Best-effort — returns {} when unavailable.
   */
  private async lookupBillingAddress(churchId: string, personId?: string): Promise<Record<string, any>> {
    if (!personId) return {};
    try {
      // Lazy import avoids a static cycle between the gateway layer and module repos.
      const { RepoManager } = await import("../../infrastructure/RepoManager.js");
      const membershipRepos = await RepoManager.getRepos<any>("membership");
      const person = await membershipRepos.person.load(churchId, personId);
      const contact = person?.contactInfo || {};
      const fields: Record<string, any> = {
        address1: contact.address1 || undefined,
        address2: contact.address2 || undefined,
        city: contact.city || undefined,
        state: contact.state || undefined,
        zip: contact.zip || undefined
      };
      Object.keys(fields).forEach((k) => fields[k] === undefined && delete fields[k]);
      return fields;
    } catch (err: any) {
      console.warn("KingdomFunding(NMI): billing address lookup failed (continuing without):", err?.message || err);
      return {};
    }
  }

  /**
   * Create a bare Customer Vault record (contact info only). A payment method is
   * attached separately via attachPaymentMethod. Returns the customer_vault_id.
   * Pass options.personId so the donor's billing address is included — some NMI
   * accounts reject vault records that carry neither payment data nor an address.
   */
  async createCustomer(config: GatewayConfig, email: string, name: string, options?: { personId?: string }): Promise<string> {
    const vaultId = crypto.randomUUID();
    const billing = await this.lookupBillingAddress(config.churchId, options?.personId);
    const resp = await this.nmiPost(config, {
      customer_vault: "add_customer",
      customer_vault_id: vaultId,
      email: email || undefined,
      ...this.splitName(name),
      ...billing
    });
    if (!this.isApproved(resp)) {
      throw new Error(this.errorText(resp) || "Failed to create customer");
    }
    return resp.customer_vault_id || vaultId;
  }

  /**
   * Attach a payment method to a customer vault.
   * - With options.customerId → add_billing to that vault.
   * - Without → add_customer creating a new vault record from the token/bank.
   *
   * The persisted "payment method id" is the customer_vault_id, since a sale charges
   * by customer_vault_id. (One chargeable method per donor vault — multiple cards
   * would need billing_id selection at charge time; add when donors ask.)
   */
  async attachPaymentMethod(config: GatewayConfig, paymentMethodId: string, options: any): Promise<any> {
    // Strip any legacy "nonce-" prefix (an Accept Blue convention the controllers still add);
    // NMI Collect.js payment_tokens are raw and a prefixed value is rejected.
    const rawToken = options.source || options.token || paymentMethodId;
    const token = rawToken ? String(rawToken).replace(/^nonce-/, "") : rawToken;

    const methodParams: Record<string, any> = {};
    if (options.routing_number) {
      methodParams.payment = "check";
      methodParams.checkname = options.name || "";
      methodParams.checkaba = options.routing_number;
      methodParams.checkaccount = options.account_number;
      methodParams.account_type = options.account_type || "checking";
      methodParams.sec_code = options.sec_code || "WEB";
    } else if (token) {
      methodParams.payment_token = token;
    } else {
      throw new Error("attachPaymentMethod requires a payment_token or bank details");
    }
    Object.assign(methodParams, this.splitName(options.name || ""));
    // Billing address (explicit or looked up from the person record) — some NMI
    // accounts reject vault writes without it.
    if (options.address1) {
      for (const k of ["address1", "address2", "city", "state", "zip"]) {
        if (options[k]) methodParams[k] = options[k];
      }
    } else {
      Object.assign(methodParams, await this.lookupBillingAddress(config.churchId, options.personId));
    }

    let resp: Record<string, string>;
    let vaultId: string;
    let billingId: string | undefined;

    if (options.customerId) {
      billingId = crypto.randomUUID();
      resp = await this.nmiPost(config, {
        customer_vault: "add_billing",
        customer_vault_id: options.customerId,
        billing_id: billingId,
        ...methodParams
      });
      vaultId = options.customerId;
    } else {
      vaultId = crypto.randomUUID();
      resp = await this.nmiPost(config, {
        customer_vault: "add_customer",
        customer_vault_id: vaultId,
        ...methodParams
      });
      vaultId = resp.customer_vault_id || vaultId;
    }

    if (!this.isApproved(resp)) {
      throw new Error(this.errorText(resp) || "Failed to save payment method");
    }

    // Echo back card metadata the caller passed (NMI's vault response omits it) so the
    // saved-method record gets a useful displayName.
    return {
      id: vaultId,
      customer_vault_id: vaultId,
      billing_id: billingId,
      card_type: options.cardBrand,
      last_4: options.cardLast4,
      ...resp
    };
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

  // NMI Query API returns XML; use light tag extraction to avoid an XML parser dependency.
  async getSubscription(config: GatewayConfig, subscriptionId: string): Promise<any> {
    try {
      const resp = await Axios.get(this.getQueryUrl(), {
        params: { security_key: config.privateKey, report_type: "recurring", subscription_id: subscriptionId },
        timeout: 15000
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
      const resp = await Axios.get(this.getQueryUrl(), {
        params: { security_key: config.privateKey, report_type: "recurring", customer_vault_id: customerId },
        timeout: 15000
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
      const resp = await Axios.get(this.getQueryUrl(), {
        params: { security_key: config.privateKey, report_type: "customer_vault", customer_vault_id: customerId },
        timeout: 15000
      });
      // The persisted method id is the customer_vault_id (one chargeable method per donor
      // vault) — also what we charge by — so key the returned method on the queried vault id,
      // matching the stored gatewayPaymentMethods row rather than the inner billing_id.
      return parseNmiVaultMethods(typeof resp.data === "string" ? resp.data : "", String(customerId));
    } catch (error: any) {
      console.error("KingdomFunding(NMI) getCustomerPaymentMethods error:", error.message);
      return [];
    }
  }

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

  /**
   * Recover fund allocation for a webhook-created donation (recurring auto-charge or ACH
   * settlement) that arrives with no fund data. Looks up the donor's subscription via the
   * gateway customer (vault) id and uses its designated funds; falls back to the General
   * Fund so a donation is never recorded unallocated.
   */
  private async recoverFunds(
    churchId: string,
    eventData: any,
    amount: number,
    repos: any
  ): Promise<Array<{ fundId: string; amount: number }>> {
    try {
      const customerId = eventData.customer_vault_id
        || eventData.transaction?.customer_vault_id
        || eventData.customer?.customer_id
        || eventData.customer_id;
      if (customerId) {
        const subs = await repos.subscription.loadByCustomerId(churchId, String(customerId));
        const candidates = Array.isArray(subs) ? subs : subs ? [subs] : [];
        let best: { funds: Array<{ fundId: string; amount: number }>; gap: number } | null = null;
        for (const sub of candidates) {
          if (!sub?.id) continue;
          const sfRaw = await repos.subscriptionFunds.loadBySubscriptionId(churchId, String(sub.id));
          const funds = (sfRaw || [])
            .filter((f: any) => f.fundId)
            .map((f: any) => ({ fundId: String(f.fundId), amount: Number(f.amount) || 0 }));
          if (!funds.length) continue;
          const total = funds.reduce((s, f) => s + f.amount, 0);
          // The charged amount may exceed the designated total when the donor covers fees;
          // pick the subscription whose fund total best fits within the charge.
          const gap = amount - total;
          if (gap >= -0.01 && (best === null || gap < best.gap)) best = { funds, gap };
        }
        if (best) return best.funds;
      }
    } catch (err) {
      console.error("KingdomFunding(NMI) recoverFunds: subscription lookup failed", err);
    }
    try {
      const general = await repos.fund.getOrCreateGeneral(churchId);
      if (general?.id) return [{ fundId: String(general.id), amount }];
    } catch (err) {
      console.error("KingdomFunding(NMI) recoverFunds: General Fund fallback failed", err);
    }
    return [];
  }

  async logDonation(
    _config: GatewayConfig,
    churchId: string,
    eventData: any,
    repos: any,
    status: "pending" | "complete" = "complete"
  ): Promise<any> {
    try {
      const amount = Number(eventData.auth_amount || eventData.amount || eventData.transaction?.amount || 0);

      // Find person — from direct person data (charge flow) or from customer/transaction lookup (webhook flow).
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

      // Payment method type. Prefer the explicit paymentType ("bank") set by the charge
      // flow / webhook normalization, since NMI's token-sale response omits bank details.
      const isCheck = eventData.paymentType === "bank"
        || eventData.type === "bank"
        || !!(eventData.check_account || eventData.transaction?.check_account || eventData.account_type);
      const method = isCheck ? "ACH" : "Card";
      const last4 = eventData.last_4 || eventData.cc_number?.slice(-4) || "";
      const methodDetails = isCheck ? `Check ****${last4}` : `${eventData.card_type || "Card"} ****${last4}`;

      const batch: DonationBatch = await repos.donationBatch.getOrCreateCurrent(churchId);
      const refNumber = String(eventData.reference_number || eventData.id || eventData.transaction?.transaction_id || "");

      // Use the actual transaction timestamp instead of "now" — ACH webhooks can arrive
      // days after the charge. Falls back to now if no timestamp is provided.
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
        status
      };

      const savedDonation = await repos.donation.save(donation);

      // Allocate funds from the synchronous /charge path (subscriptionFunds/funds/fundId).
      // Webhook-created donations (recurring auto-charges, ACH settlements) carry none, so
      // recover from the originating subscription — otherwise the money is recorded but left
      // unallocated and fund reports undercount.
      let fundsArray: any[] = eventData.subscriptionFunds || eventData.funds || [];
      if (fundsArray.length === 0 && eventData.fundId) {
        fundsArray = [{ fundId: eventData.fundId, amount }];
      }
      if (fundsArray.length === 0) {
        fundsArray = await this.recoverFunds(churchId, eventData, amount, repos);
      }
      for (const fund of fundsArray) {
        const fundDonation: FundDonation = {
          churchId,
          donationId: savedDonation.id,
          fundId: fund.fundId || fund.id || "",
          amount: fund.amount || 0
        };
        if (fundDonation.fundId) await repos.fundDonation.save(fundDonation);
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
      await repos.donation.updateStatus(churchId, transactionId, status);
    } catch (err) {
      console.error("KingdomFunding(NMI) updateDonationStatus error:", err);
    }
  }
}

// Light XML extractors for NMI Query API responses.
function extractAll(xml: string, blockTag: string): string[] {
  const re = new RegExp(`<${blockTag}[\\s>][\\s\\S]*?</${blockTag}>`, "g");
  return xml.match(re) || [];
}

function tag(xml: string, name: string): string {
  const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return m ? m[1].trim() : "";
}

function parseNmiSubscriptions(xml: string): any[] {
  const freqFromTags = (block: string): string => {
    const month = tag(block, "month_frequency");
    const day = tag(block, "day_frequency");
    if (month) return month === "3" ? "quarterly" : month === "6" ? "biannually" : month === "12" ? "annually" : month === "2" ? "bimonthly" : "monthly";
    if (day) return day === "7" ? "weekly" : day === "14" ? "biweekly" : day === "1" ? "daily" : "monthly";
    return "monthly";
  };
  return extractAll(xml, "subscription").map((block) => {
    const vaultId = tag(block, "customer_vault_id");
    const nextRun = tag(block, "next_charge_date");
    const status = tag(block, "subscription_status") || "active";
    const terminal = ["cancelled", "canceled", "deleted", "expired", "complete", "completed"].includes(status.toLowerCase());
    // Emit the field names the giving controllers already read (CustomerController reads
    // active / next_run_date / payment_method_id; SubscriptionController reads customer_id)
    // so those controllers stay provider-agnostic.
    return {
      id: tag(block, "subscription_id"),
      amount: Number(tag(block, "plan_amount") || tag(block, "amount")) || 0,
      frequency: freqFromTags(block),
      status,
      active: !terminal,
      next_run_date: nextRun,
      nextRunDate: nextRun,
      payment_method_id: vaultId,
      customer_id: vaultId,
      customer_vault_id: vaultId
    };
  });
}

function parseNmiVaultMethods(xml: string, vaultId: string): any[] {
  if (!vaultId || !xml) return [];
  // One chargeable method per donor vault: read the primary billing block (or the whole
  // response) and key it on the vault id we queried, so it matches the stored externalId.
  const block = extractAll(xml, "billing")[0] || xml;
  const cc = tag(block, "cc_number");
  const check = tag(block, "check_account");
  if (!cc && !check) return []; // no stored method
  const isAch = !!tag(block, "account_type") || !!check;
  return [
    {
      id: vaultId,
      type: isAch ? "check" : "card",
      last_4: (cc || check).slice(-4),
      card_type: tag(block, "cc_type") || (isAch ? "Bank" : "Card"),
      expiry: tag(block, "cc_exp")
    }
  ];
}
