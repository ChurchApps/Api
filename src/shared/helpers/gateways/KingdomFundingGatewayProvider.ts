import express from "express";
import crypto from "crypto";
import { AbstractExperimentalGatewayProvider } from "./AbstractExperimentalGatewayProvider.js";
import { GatewayConfig, WebhookResult, ChargeResult, SubscriptionResult } from "./IGatewayProvider.js";
import Axios from "axios";
import { Environment } from "../Environment.js";
import { Donation, DonationBatch, EventLog, FundDonation } from "../../../modules/giving/models/index.js";

/**
 * KingdomFunding payment gateway provider.
 *
 * Supports:
 * - One-time card charges (via hosted tokenization nonce)
 * - One-time ACH/check charges
 * - Recurring schedules (single-step, not plan+subscription)
 * - Customers with reusable saved payment methods
 * - Refunds (full + partial)
 * - Webhooks with HMAC-SHA256 signature verification
 *
 * DB column mapping:
 *   gateways.publicKey    = Tokenization Key (pk_...)
 *   gateways.privateKey   = API Source Key (encrypted)
 *   gateways.webhookKey   = Webhook signature secret (encrypted)
 *   gateways.settings     = { webhookId?, merchantId? }
 *
 * Auth: HTTP Basic — Authorization: Basic base64(sourceKey:pin)
 * PIN is optional for sandbox, required for production CC refunds.
 * We store the sourceKey in privateKey. PIN (if any) is in settings.pin.
 */
export class KingdomFundingGatewayProvider extends AbstractExperimentalGatewayProvider {
  readonly name = "kingdomfunding";

  async createProduct(_config: GatewayConfig, _churchId: string): Promise<string> {
    return "";
  }

  // ─── Helpers ──────────────────────────────────────────────

  private getBaseUrl(config: GatewayConfig): string {
    const key = config.privateKey || "";
    // Sandbox uses develop subdomain; production uses main API domain
    const isDev = config.environment === "sandbox"
      || (config.settings as any)?.sandbox === true
      || key.includes("sandbox") || key.includes("test") || key.includes("develop");
    return isDev
      ? "https://api.develop.accept.blue/api/v2"
      : "https://api.accept.blue/api/v2";
  }

  private getAuthHeader(config: GatewayConfig): string {
    const sourceKey = config.privateKey || "";
    const pin = (config.settings as any)?.pin || "";
    return "Basic " + Buffer.from(`${sourceKey}:${pin}`).toString("base64");
  }

  private axiosConfig(config: GatewayConfig) {
    return {
      headers: {
        "Authorization": this.getAuthHeader(config),
        "Content-Type": "application/json"
      }
    };
  }

  // ─── Webhook Management ───────────────────────────────────

  /**
   * Webhooks are configured in the Control Panel, not via API.
   * The API docs show webhook CRUD but we'll handle setup in the admin UI.
   * This method is a no-op placeholder; ensureWebhookExists() is the real entry point.
   */
  async createWebhookEndpoint(config: GatewayConfig, webhookUrl: string): Promise<{ id: string; secret?: string }> {
    // KingdomFunding webhook creation is done via the Control Panel
    // Return empty — the admin should set this up manually or via ensureWebhookExists
    console.log("KingdomFunding: createWebhookEndpoint called (webhooks configured via Control Panel)", { webhookUrl });
    return { id: "", secret: "" };
  }

  async deleteWebhooksByChurchId(_config: GatewayConfig, _churchId: string): Promise<void> {
    // No-op: webhooks managed via Control Panel
  }

  /**
   * Verify KingdomFunding webhook signature using HMAC-SHA256.
   *
   * The gateway sends an `X-Signature` header containing the HMAC-SHA256 hash
   * of the raw request body, using the webhook endpoint's signature key as the secret.
   *
   * Webhook event types:
   *   Transaction: succeeded, updated, declined, error, status
   *   Batch: closed
   */
  async verifyWebhookSignature(
    config: GatewayConfig,
    headers: express.Request["headers"],
    body: any
  ): Promise<WebhookResult> {
    const signatureHeader = (headers["x-signature"] || "") as string;
    const webhookSecret = config.webhookKey;

    // No webhook secret configured at all — refuse to process (do not silently accept).
    // This forces churches to configure the webhook secret in B1Admin before
    // their Kingdom Funding webhooks can be processed.
    if (!webhookSecret) {
      console.error("KingdomFunding webhook: no webhook secret configured for this church; rejecting.");
      return { success: false, shouldProcess: false };
    }

    // Secret is configured — signature is REQUIRED on every incoming webhook.
    if (!signatureHeader) {
      console.error("KingdomFunding webhook: missing X-Signature header; rejecting.");
      return { success: false, shouldProcess: false };
    }

    // Verify HMAC-SHA256 signature
    const rawBody = typeof body === "string" ? body : JSON.stringify(body);
    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(rawBody, "utf-8")
      .digest("hex");

    let signatureMatches = false;
    try {
      // timingSafeEqual throws if buffers differ in length — guard with try/catch
      // so an attacker can't probe length via exception behavior.
      signatureMatches = crypto.timingSafeEqual(
        Buffer.from(signatureHeader, "hex"),
        Buffer.from(expectedSignature, "hex")
      );
    } catch {
      signatureMatches = false;
    }

    if (!signatureMatches) {
      console.error("KingdomFunding webhook: Signature mismatch");
      return { success: false, shouldProcess: false };
    }

    // Parse the event payload
    // KingdomFunding webhook schema: { type, subType, event, id, timestamp, data }
    const eventType = body.type || "";          // "succeeded", "declined", "error", "status", "updated", "closed"
    const eventSubType = body.subType || "";    // "charge", "credit", "refund", "adjust", "void", "settled", etc.
    const eventCategory = body.event || "";     // "transaction" or "batch"
    const eventId = body.id || "";
    const eventData = body.data || {};

    // Determine if we should process this as a donation
    const isTransactionEvent = eventCategory === "transaction";
    const shouldProcess = isTransactionEvent && (
      eventType === "succeeded" ||
      eventType === "status"    // ACH status updates (settled, returned, etc.)
    );

    return {
      success: true,
      shouldProcess,
      eventType: `${eventType}.${eventSubType}`,  // e.g. "succeeded.charge", "status.settled"
      eventId,
      eventData: {
        ...eventData,
        id: eventData.reference_number || eventData.transaction?.id || eventId,
        eventType: `${eventType}.${eventSubType}`,
        eventCategory,
        // Preserve original fields for downstream processing
        status: eventData.status,
        status_code: eventData.status_code,
        auth_amount: eventData.auth_amount,
        card_type: eventData.card_type,
        last_4: eventData.last_4,
      },
    };
  }

  // ─── Payment Processing ───────────────────────────────────

  /**
   * Process a one-time charge via KingdomFunding.
   *
   * Card charges use: source = "nonce-{token}" from hosted tokenization
   * Saved payment method charges use: source = "pm-{paymentMethodId}"
   * Check/ACH charges route to processBankCharge()
   */
  async processCharge(config: GatewayConfig, donationData: any): Promise<ChargeResult> {
    if (donationData.type === "bank" || donationData.paymentType === "bank") {
      return this.processBankCharge(config, donationData);
    }

    try {
      const baseUrl = this.getBaseUrl(config);

      // Determine the source: nonce token, saved payment method, or raw card token
      let source = "";
      if (donationData.paymentMethodId) {
        source = `pm-${donationData.paymentMethodId}`;
      } else if (donationData.token || donationData.id) {
        const token = donationData.token || donationData.id;
        source = token.startsWith("nonce-") ? token : `nonce-${token}`;
      }

      if (!source) {
        return { success: false, transactionId: "", data: { error: "Missing payment token or payment method" } };
      }

      const payload: any = {
        amount: donationData.amount,
        source,
        name: donationData.name || donationData.person?.name || "",
      };

      // Add expiry data if provided (required for nonce charges)
      // Normalize: expiry_month as integer 1-12, expiry_year as 4-digit integer
      if (donationData.expiry_month) payload.expiry_month = Number(donationData.expiry_month);
      if (donationData.expiry_year) {
        let ey = Number(donationData.expiry_year);
        if (ey > 0 && ey < 100) ey += 2000;
        payload.expiry_year = ey;
      }
      if (donationData.avs_zip) payload.avs_zip = donationData.avs_zip;

      // Add billing info if available
      if (donationData.billing_info || donationData.person) {
        const person = donationData.person || {};
        payload.billing_info = donationData.billing_info || {
          first_name: person.firstName || person.first_name || "",
          last_name: person.lastName || person.last_name || "",
          email: person.email || "",
        };
      }

      // Add customer reference if available (Accept Blue expects numeric customer_id)
      if (donationData.customerId) {
        const cid = Number(donationData.customerId);
        payload.customer_id = isNaN(cid) ? donationData.customerId : cid;
      }

      const response = await Axios.post(
        `${baseUrl}/transactions/charge`,
        payload,
        this.axiosConfig(config)
      );

      const result = response.data;

      if (result.status === "Approved" || result.status_code === "A") {
        return {
          success: true,
          transactionId: String(result.reference_number || result.transaction?.id || ""),
          data: {
            ...result,
            status: "active",
            reference_number: result.reference_number,
            auth_amount: result.auth_amount,
            card_type: result.card_type,
            last_4: result.last_4,
          }
        };
      }

      return {
        success: false,
        transactionId: "",
        data: { error: result.error_message || result.error_details || "Charge declined", ...result }
      };
    } catch (error: any) {
      const errData = error.response?.data || {};
      const status = error.response?.status;
      // Accept Blue sometimes returns HTML error pages (e.g. nginx 500/502/503)
      const isHtmlError = typeof errData === "string" && errData.includes("<html");
      const errorMsg = isHtmlError
        ? `Accept Blue server error (HTTP ${status}). Please try again.`
        : (errData.error_message || errData.error_details || error.message || "Charge failed");
      console.error("KingdomFunding processCharge error:", JSON.stringify({ status, isHtmlError, message: errorMsg }));
      return {
        success: false,
        transactionId: "",
        data: { error: errorMsg }
      };
    }
  }

  /**
   * Process a bank/ACH charge.
   * KingdomFunding handles check charges on the same /transactions/charge endpoint
   * with routing_number, account_number, account_type, sec_code fields.
   *
   * When using a saved check payment method, use source = "pm-{id}".
   * For tokenized bank data, the frontend should provide routing/account details
   * or a nonce token.
   */
  private async processBankCharge(config: GatewayConfig, donationData: any): Promise<ChargeResult> {
    try {
      const baseUrl = this.getBaseUrl(config);

      const payload: any = {
        amount: donationData.amount,
        name: donationData.name || donationData.person?.name || "",
      };

      if (donationData.paymentMethodId) {
        // Charge a saved check payment method
        payload.source = `pm-${donationData.paymentMethodId}`;
      } else if (donationData.token || donationData.id) {
        // Tokenized bank data
        const token = donationData.token || donationData.id;
        payload.source = token.startsWith("nonce-") ? token : `nonce-${token}`;
      } else if (donationData.routing_number && donationData.account_number) {
        // Raw bank fields
        payload.routing_number = donationData.routing_number;
        payload.account_number = donationData.account_number;
        payload.account_type = donationData.account_type || "checking";
        payload.sec_code = donationData.sec_code || "WEB";
      } else {
        return { success: false, transactionId: "", data: { error: "Missing bank payment data" } };
      }

      if (donationData.customerId) {
        payload.customer_id = donationData.customerId;
      }

      const response = await Axios.post(
        `${baseUrl}/transactions/charge`,
        payload,
        this.axiosConfig(config)
      );

      const result = response.data;

      if (result.status === "Approved" || result.status_code === "A") {
        return {
          success: true,
          transactionId: String(result.reference_number || result.transaction?.id || ""),
          data: {
            ...result,
            status: "active",
            reference_number: result.reference_number,
            auth_amount: result.auth_amount,
          }
        };
      }

      return {
        success: false,
        transactionId: "",
        data: { error: result.error_message || result.error_details || "ACH charge declined", ...result }
      };
    } catch (error: any) {
      const errData = error.response?.data || {};
      console.error("KingdomFunding processBankCharge error:", errData.error_message || error.message);
      return {
        success: false,
        transactionId: "",
        data: { error: errData.error_message || errData.error_details || error.message || "ACH charge failed" }
      };
    }
  }

  // ─── Recurring Schedules ──────────────────────────────────

  /**
   * Map our frontend interval format to KingdomFunding frequency strings.
   * KingdomFunding supports: daily, weekly, biweekly, monthly, bimonthly, quarterly, biannually, annually
   */
  private mapIntervalToFrequency(interval: any): string {
    if (!interval) return "monthly";

    // Handle string format directly
    const str = typeof interval === "string" ? interval : interval.interval || interval.frequency || "";
    const lower = str.toLowerCase();

    const map: Record<string, string> = {
      "one_week": "weekly",
      "two_week": "biweekly",
      "one_month": "monthly",
      "two_month": "bimonthly",
      "three_month": "quarterly",
      "six_month": "biannually",
      "one_year": "annually",
      // Direct KingdomFunding values pass through
      "daily": "daily",
      "weekly": "weekly",
      "biweekly": "biweekly",
      "monthly": "monthly",
      "bimonthly": "bimonthly",
      "quarterly": "quarterly",
      "biannually": "biannually",
      "annually": "annually",
      // Uppercase format fallback
      "DAILY": "daily",
      "WEEKLY": "weekly",
      "MONTHLY": "monthly",
      "QUARTERLY": "quarterly",
      "ANNUAL": "annually",
    };

    return map[lower] || map[str] || "monthly";
  }

  /**
   * Create a recurring schedule in KingdomFunding.
   *
   * KingdomFunding uses a single-step model: POST /customers/:id/recurring-schedules
   * Required: title, amount, payment_method_id, frequency, next_run_date
   *
   * The customer and payment method must exist before creating a schedule.
   * If no customerId is provided, we'll create one first.
   */
  async createSubscription(config: GatewayConfig, subscriptionData: any): Promise<SubscriptionResult> {
    try {
      const baseUrl = this.getBaseUrl(config);
      const name = subscriptionData.name || subscriptionData.person?.name?.display || subscriptionData.person?.name || "Donor";
      const email = subscriptionData.email || subscriptionData.person?.email || "";
      const token = subscriptionData.token || subscriptionData.id;
      // Only treat as nonce if it's not a numeric saved-PM ID
      const isSavedPmId = token && /^\d+$/.test(String(token));
      const nonceSource = (!isSavedPmId && token) ? (String(token).startsWith("nonce-") ? String(token) : `nonce-${token}`) : "";

      // Normalize expiry year to 4-digit (accept.blue requires 2020-9999)
      let expiryYear = subscriptionData.expiry_year ? Number(subscriptionData.expiry_year) : undefined;
      if (expiryYear && expiryYear < 100) expiryYear += 2000;
      const expiryMonth = subscriptionData.expiry_month ? Number(subscriptionData.expiry_month) : undefined;

      // Step 1: Determine if the recurring donation starts today
      let startsToday = false;
      if (subscriptionData.billing_cycle_anchor) {
        let anchorMs = subscriptionData.billing_cycle_anchor;
        if (anchorMs < 10000000000) anchorMs = anchorMs * 1000;
        const anchorDate = new Date(anchorMs);
        const today = new Date();
        startsToday = anchorDate.toISOString().split("T")[0] === today.toISOString().split("T")[0]
          || anchorDate <= today;
      } else {
        startsToday = true; // No anchor = starts now
      }

      let customerId = subscriptionData.customerId;
      let referenceNumber: number | null = null;

      // Detect ACH/bank flow
      const isBank = subscriptionData.type === "bank"
        || (subscriptionData.routing_number && subscriptionData.account_number);

      // Step 2: If starts today, charge immediately first
      if (startsToday && (nonceSource || isBank)) {
        const chargePayload: any = {
          amount: subscriptionData.amount,
          name,
        };

        if (isBank) {
          chargePayload.routing_number = subscriptionData.routing_number;
          chargePayload.account_number = subscriptionData.account_number;
          chargePayload.account_type = subscriptionData.account_type || "checking";
          chargePayload.sec_code = subscriptionData.sec_code || "WEB";
        } else {
          chargePayload.source = nonceSource;
          if (expiryMonth) chargePayload.expiry_month = expiryMonth;
          if (expiryYear) chargePayload.expiry_year = expiryYear;
        }

        const chargeResponse = await Axios.post(
          `${baseUrl}/transactions/charge`,
          chargePayload,
          this.axiosConfig(config)
        );

        referenceNumber = chargeResponse.data?.reference_number;
        if (!referenceNumber) {
          const errMsg = chargeResponse.data?.error_message || "Initial charge failed";
          console.error("KingdomFunding: Initial recurring charge failed", chargeResponse.data);
          return { success: false, subscriptionId: "", data: { error: errMsg } };
        }
      }

      // Step 3: Create customer
      if (!customerId) {
        customerId = await this.createCustomer(config, email, name);
      }

      // Step 4: Create payment method on the customer
      let paymentMethodId = subscriptionData.paymentMethodId;

      // If the incoming id is a numeric Accept Blue PM ID (saved card), use it directly
      const rawId = subscriptionData.id ? String(subscriptionData.id) : "";
      if (!paymentMethodId && rawId && /^\d+$/.test(rawId) && !rawId.startsWith("nonce-")) {
        paymentMethodId = Number(rawId);
      }

      if (!paymentMethodId) {
        const pmPayload: any = {};

        if (referenceNumber) {
          // Create payment method from the transaction reference (works for both card and ACH)
          pmPayload.source = `ref-${referenceNumber}`;
          if (!isBank && expiryMonth) pmPayload.expiry_month = expiryMonth;
          if (!isBank && expiryYear) pmPayload.expiry_year = expiryYear;
        } else if (isBank) {
          // ACH future-dated subscription — create PM directly from routing/account
          pmPayload.routing_number = subscriptionData.routing_number;
          pmPayload.account_number = subscriptionData.account_number;
          pmPayload.account_type = subscriptionData.account_type || "checking";
        } else if (nonceSource) {
          // Create payment method from the nonce
          pmPayload.source = nonceSource;
          if (expiryMonth) pmPayload.expiry_month = expiryMonth;
          if (expiryYear) pmPayload.expiry_year = expiryYear;
        }

        if (name) pmPayload.name = name;

        try {
          const pmResponse = await Axios.post(
            `${baseUrl}/customers/${customerId}/payment-methods`,
            pmPayload,
            this.axiosConfig(config)
          );
          paymentMethodId = pmResponse.data?.id;
        } catch (pmErr: any) {
          // If the payment method already exists for this customer, reuse it
          const existingPm = pmErr.response?.data?.error_details?.payment_method;
          if (existingPm?.id) {
            console.log("KingdomFunding: Payment method already exists, reusing", { pmId: existingPm.id });
            paymentMethodId = existingPm.id;
          } else {
            console.error("KingdomFunding: Failed to create payment method", pmErr.response?.data || pmErr.message);
            return { success: false, subscriptionId: "", data: { error: "Failed to save payment method for recurring donation" } };
          }
        }

        if (!paymentMethodId) {
          console.error("KingdomFunding: No payment method ID obtained");
          return { success: false, subscriptionId: "", data: { error: "Failed to save payment method for recurring donation" } };
        }
      }

      // Step 5: Calculate next_run_date for the schedule
      // If we already charged today, next run should be the next cycle date
      const frequency = this.mapIntervalToFrequency(subscriptionData.interval);
      let nextRunDate: string;

      if (startsToday) {
        // Already charged today, schedule starts on the next cycle
        const next = new Date();
        switch (frequency) {
          case "daily": next.setDate(next.getDate() + 1); break;
          case "weekly": next.setDate(next.getDate() + 7); break;
          case "biweekly": next.setDate(next.getDate() + 14); break;
          case "monthly": next.setMonth(next.getMonth() + 1); break;
          case "bimonthly": next.setMonth(next.getMonth() + 2); break;
          case "quarterly": next.setMonth(next.getMonth() + 3); break;
          case "biannually": next.setMonth(next.getMonth() + 6); break;
          case "annually": next.setFullYear(next.getFullYear() + 1); break;
          default: next.setMonth(next.getMonth() + 1); break;
        }
        nextRunDate = next.toISOString().split("T")[0];
      } else {
        // Starts in the future
        let anchorMs = subscriptionData.billing_cycle_anchor;
        if (anchorMs < 10000000000) anchorMs = anchorMs * 1000;
        nextRunDate = new Date(anchorMs).toISOString().split("T")[0];
      }

      // Step 6: Create the recurring schedule
      const schedulePayload = {
        title: `Recurring Donation $${subscriptionData.amount}`,
        amount: subscriptionData.amount,
        payment_method_id: paymentMethodId,
        frequency,
        next_run_date: nextRunDate,
        num_left: 0,  // 0 = ongoing
        active: true,
      };

      const response = await Axios.post(
        `${baseUrl}/customers/${customerId}/recurring-schedules`,
        schedulePayload,
        this.axiosConfig(config)
      );

      const schedule = response.data;
      const scheduleId = String(schedule.id || "");

      if (!scheduleId) {
        console.error("KingdomFunding: Recurring schedule created but no ID returned", schedule);
        return { success: false, subscriptionId: "", data: { error: "Recurring schedule creation failed" } };
      }

      return {
        success: true,
        subscriptionId: scheduleId,
        data: {
          ...schedule,
          status: "active",
          customerId: String(customerId),
          paymentMethodId: String(paymentMethodId),
          frequency,
          nextRunDate,
          initialChargeRef: referenceNumber ? String(referenceNumber) : undefined,
        }
      };
    } catch (error: any) {
      const errData = error.response?.data || {};
      console.error("KingdomFunding createSubscription error:", errData.error_message || errData.message || error.message);
      if (error.response?.data) console.error("KingdomFunding createSubscription response data:", JSON.stringify(error.response.data));
      return {
        success: false,
        subscriptionId: "",
        data: { error: errData.error_message || errData.message || error.message || "Subscription creation failed" }
      };
    }
  }

  async updateSubscription(config: GatewayConfig, subscriptionData: any): Promise<SubscriptionResult> {
    try {
      const baseUrl = this.getBaseUrl(config);
      const scheduleId = subscriptionData.subscriptionId || subscriptionData.id;

      if (!scheduleId) {
        return { success: false, subscriptionId: "", data: { error: "Missing recurring schedule ID" } };
      }

      const updatePayload: any = {};
      if (subscriptionData.amount) updatePayload.amount = subscriptionData.amount;
      if (subscriptionData.interval) updatePayload.frequency = this.mapIntervalToFrequency(subscriptionData.interval);
      if (subscriptionData.next_run_date) updatePayload.next_run_date = subscriptionData.next_run_date;
      if (subscriptionData.active !== undefined) updatePayload.active = subscriptionData.active;
      if (subscriptionData.paymentMethodId) updatePayload.payment_method_id = subscriptionData.paymentMethodId;

      const response = await Axios.patch(
        `${baseUrl}/recurring-schedules/${scheduleId}`,
        updatePayload,
        this.axiosConfig(config)
      );

      return {
        success: true,
        subscriptionId: String(scheduleId),
        data: response.data
      };
    } catch (error: any) {
      const errData = error.response?.data || {};
      console.error("KingdomFunding updateSubscription error:", errData.error_message || error.message);
      return {
        success: false,
        subscriptionId: subscriptionData.subscriptionId || "",
        data: { error: errData.error_message || error.message || "Subscription update failed" }
      };
    }
  }

  async cancelSubscription(config: GatewayConfig, subscriptionId: string, _reason?: string): Promise<void> {
    try {
      const baseUrl = this.getBaseUrl(config);
      console.log("KingdomFunding cancelSubscription: deactivating schedule", { subscriptionId, url: `${baseUrl}/recurring-schedules/${subscriptionId}` });

      // Deactivate by setting active: false
      const response = await Axios.patch(
        `${baseUrl}/recurring-schedules/${subscriptionId}`,
        { active: false },
        this.axiosConfig(config)
      );

      console.log("KingdomFunding: Recurring schedule deactivated", { subscriptionId, responseData: response.data });
    } catch (error: any) {
      console.error("KingdomFunding cancelSubscription error:", {
        subscriptionId,
        status: error.response?.status,
        data: error.response?.data,
        message: error.message
      });
      throw new Error(error.response?.data?.error_message || error.message || "Failed to cancel subscription");
    }
  }

  // ─── Refunds ──────────────────────────────────────────────

  /**
   * Refund a previously settled transaction.
   * POST /transactions/refund — body: { reference_number, amount? }
   * Omit amount for full refund.
   */
  async processRefund(config: GatewayConfig, refundData: any): Promise<ChargeResult> {
    try {
      const baseUrl = this.getBaseUrl(config);

      const payload: any = {
        reference_number: parseInt(refundData.reference_number || refundData.transactionId, 10),
      };

      // If amount provided, partial refund; otherwise full refund
      if (refundData.amount) {
        payload.amount = refundData.amount;
      }

      const response = await Axios.post(
        `${baseUrl}/transactions/refund`,
        payload,
        this.axiosConfig(config)
      );

      const result = response.data;

      if (result.status === "Approved" || result.status_code === "A") {
        return {
          success: true,
          transactionId: String(result.reference_number || ""),
          data: result
        };
      }

      return {
        success: false,
        transactionId: "",
        data: { error: result.error_message || "Refund failed", ...result }
      };
    } catch (error: any) {
      const errData = error.response?.data || {};
      console.error("KingdomFunding processRefund error:", errData.error_message || error.message);
      return {
        success: false,
        transactionId: "",
        data: { error: errData.error_message || error.message || "Refund failed" }
      };
    }
  }

  // ─── Fee Calculation ──────────────────────────────────────

  /**
   * Calculate transaction fees using KF-specific settings (flatRateKF / transFeeKF).
   * Fee calculation is our own logic, not provider-dependent.
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
        console.warn("KingdomFunding: Failed to load fee settings, using defaults", err);
      }
    }

    const fixedFee = customFixedFee ?? 0.3;
    const percentFee = customPercentFee ?? 0.029;
    return Math.round(((amount + fixedFee) / (1 - percentFee) - amount) * 100) / 100;
  }

  // ─── Customer Management ──────────────────────────────────

  /**
   * Create a customer in KingdomFunding.
   * POST /customers — body: { identifier, email, first_name, last_name, ... }
   * Returns the customer ID (integer).
   */
  async createCustomer(config: GatewayConfig, email: string, name: string): Promise<string> {
    try {
      const baseUrl = this.getBaseUrl(config);
      const nameParts = (name || "").split(" ");
      const firstName = nameParts[0] || "";
      const lastName = nameParts.slice(1).join(" ") || "";

      const payload = {
        identifier: email || name || "donor",
        email: email || undefined,
        first_name: firstName || undefined,
        last_name: lastName || undefined,
      };

      const response = await Axios.post(
        `${baseUrl}/customers`,
        payload,
        this.axiosConfig(config)
      );

      const customerId = response.data?.id;
      if (!customerId) {
        throw new Error("Customer creation returned no ID");
      }

      return String(customerId);
    } catch (error: any) {
      console.error("KingdomFunding createCustomer error:", error.response?.data || error.message);
      throw new Error(error.response?.data?.error_message || error.message || "Failed to create customer");
    }
  }

  async getCustomerSubscriptions(config: GatewayConfig, customerId: string): Promise<any> {
    try {
      const baseUrl = this.getBaseUrl(config);
      const response = await Axios.get(
        `${baseUrl}/customers/${customerId}/recurring-schedules`,
        { ...this.axiosConfig(config), timeout: 15000 }
      );
      return response.data || [];
    } catch (error: any) {
      console.error("KingdomFunding getCustomerSubscriptions error:", error.response?.data || error.message);
      return [];
    }
  }

  async getCustomerPaymentMethods(config: GatewayConfig, customer: any): Promise<any> {
    try {
      const baseUrl = this.getBaseUrl(config);
      const customerId = typeof customer === "string" ? customer : customer?.id || customer?.customerId;
      if (!customerId) return [];

      const response = await Axios.get(
        `${baseUrl}/customers/${customerId}/payment-methods`,
        this.axiosConfig(config)
      );
      return response.data || [];
    } catch (error: any) {
      console.error("KingdomFunding getCustomerPaymentMethods error:", error.response?.data || error.message);
      return [];
    }
  }

  // ─── Payment Method Management ────────────────────────────

  /**
   * Save a payment method to a customer in KingdomFunding.
   * For cards: POST /customers/:id/payment-methods — { card, expiry_month, expiry_year, name, avs_zip }
   * For checks: POST /customers/:id/payment-methods — { routing_number, account_number, account_type, name }
   * For source/nonce: POST /customers/:id/payment-methods — { source: "nonce-xxx" }
   */
  async attachPaymentMethod(config: GatewayConfig, paymentMethodId: string, options: any): Promise<any> {
    try {
      const baseUrl = this.getBaseUrl(config);
      const customerId = options.customerId;
      if (!customerId) throw new Error("customerId required to save payment method");

      const payload: any = {};

      const pmIdStr = paymentMethodId ? String(paymentMethodId) : "";
      if (options.source || pmIdStr.startsWith("nonce-") || pmIdStr.startsWith("ref-")) {
        // Save from a nonce token or transaction reference
        payload.source = options.source || pmIdStr;
        // Only auto-prefix with nonce- if it's not already prefixed
        if (!payload.source.startsWith("nonce-") && !payload.source.startsWith("ref-")) payload.source = `nonce-${payload.source}`;
        if (options.expiry_month) payload.expiry_month = options.expiry_month;
        if (options.expiry_year) payload.expiry_year = options.expiry_year;
      } else if (options.routing_number) {
        // Save a check/ACH payment method
        payload.routing_number = options.routing_number;
        payload.account_number = options.account_number;
        payload.account_type = options.account_type || "checking";
        payload.name = options.name || "";
        payload.sec_code = options.sec_code || "WEB";
      } else {
        // Save card data
        payload.card = options.card;
        payload.expiry_month = options.expiry_month;
        payload.expiry_year = options.expiry_year;
        payload.name = options.name || "";
        if (options.avs_zip) payload.avs_zip = options.avs_zip;
      }

      const response = await Axios.post(
        `${baseUrl}/customers/${customerId}/payment-methods`,
        payload,
        this.axiosConfig(config)
      );

      return response.data;
    } catch (error: any) {
      console.error("KingdomFunding attachPaymentMethod error:", JSON.stringify(error.response?.data) || error.message);
      throw new Error(error.response?.data?.error_message || error.message || "Failed to save payment method");
    }
  }

  /**
   * Remove a payment method from KingdomFunding.
   * DELETE /payment-methods/:id
   */
  async detachPaymentMethod(config: GatewayConfig, paymentMethodId: string, customerId?: string): Promise<any> {
    try {
      const baseUrl = this.getBaseUrl(config);
      console.log("KingdomFunding detachPaymentMethod:", { paymentMethodId, customerId });
      const response = await Axios.delete(
        `${baseUrl}/payment-methods/${paymentMethodId}`,
        this.axiosConfig(config)
      );
      return response.data;
    } catch (error: any) {
      console.error("KingdomFunding detachPaymentMethod error:", error.response?.data || error.message, { paymentMethodId, customerId });
      throw new Error(error.response?.data?.error_message || error.message || "Failed to remove payment method");
    }
  }

  // ─── Event Logging ────────────────────────────────────────

  async logEvent(churchId: string, event: any, eventData: any, repos: any): Promise<void> {
    try {
      const eventLog = new EventLog();
      eventLog.churchId = churchId;
      eventLog.eventType = eventData?.eventType || event?.type || "unknown";
      eventLog.provider = "kingdomfunding";
      eventLog.providerId = eventData?.id?.toString() || event?.id?.toString() || "";
      eventLog.message = JSON.stringify(event);
      await repos.eventLog.save(eventLog);
    } catch (err) {
      console.error("KingdomFunding logEvent error:", err);
    }
  }

  async logDonation(
    config: GatewayConfig,
    churchId: string,
    eventData: any,
    repos: any,
    status: "pending" | "complete" = "complete"
  ): Promise<any> {
    try {
      // Extract amount — KingdomFunding uses auth_amount or amount_details.amount
      let amount = eventData.auth_amount || eventData.amount || 0;
      if (eventData.transaction?.amount_details?.amount) {
        amount = eventData.transaction.amount_details.amount;
      }

      // Find person — from direct person data (charge flow) or from customer/transaction lookup (webhook flow)
      let personId: string | undefined;
      if (eventData.person?.id) {
        personId = eventData.person.id;
      } else {
        // Try customer_id from webhook body
        const customerId = eventData.customer?.customer_id || eventData.transaction?.customer?.customer_id;
        if (customerId) {
          const customer = await repos.customer.load(churchId, String(customerId));
          if (customer) personId = customer.personId;
        }

        // Fallback: look up by reference_number in existing donations (charge endpoint logs first)
        if (!personId) {
          const refNum = eventData.reference_number || eventData.transaction?.id;
          if (refNum) {
            const existingDonation = await repos.donation.loadByTransactionId(churchId, String(refNum));
            if (existingDonation?.personId) personId = existingDonation.personId;
          }
        }
      }

      // Determine payment method type
      const isCheck = !!eventData.transaction?.check_details?.routing_number;
      const method = isCheck ? "ACH" : "Card";
      const methodDetails = isCheck
        ? `Check ****${eventData.transaction?.check_details?.last4 || ""}`
        : `${eventData.card_type || "Card"} ****${eventData.last_4 || ""}`;

      const batch: DonationBatch = await repos.donationBatch.getOrCreateCurrent(churchId);

      const refNumber = String(eventData.reference_number || eventData.transaction?.id || eventData.id || "");

      // Use the actual transaction timestamp instead of "now" — webhooks may arrive much later
      // (ACH webhooks can be days delayed). Falls back to now if no timestamp is provided.
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

      // Allocate funds: subscription funds, charge funds array, or single fund fallback
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
        // Single fund donation — use the total amount
        const fundDonation: FundDonation = {
          churchId,
          donationId: savedDonation.id,
          fundId: eventData.fundId,
          amount,
        };
        await repos.fundDonation.save(fundDonation);
      }

      return savedDonation;
    } catch (err) {
      console.error("KingdomFunding logDonation error:", err);
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
        // Update the donation status
        // The method field can encode the status for now
        await repos.donation.save({ ...donation, notes: `${donation.notes || ""} [status: ${status}]` });
      }
    } catch (err) {
      console.error("KingdomFunding updateDonationStatus error:", err);
    }
  }
}
