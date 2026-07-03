import { controller, httpPost, httpGet } from "inversify-express-utils";
import express from "express";
import { GivingBaseController } from "./GivingBaseController.js";
import { Permissions } from "../../../shared/helpers/Permissions.js";
import { GatewayService } from "../../../shared/helpers/GatewayService.js";
import { StripeHelper } from "../../../shared/helpers/StripeHelper.js";
import { EncryptionHelper, CurrencyHelper } from "@churchapps/apihelper";
import { Donation, FundDonation, DonationBatch, Subscription, SubscriptionFund } from "../models/index.js";
import { Environment } from "../../../shared/helpers/Environment.js";
import { TransactionalEmailHelper } from "../../../shared/helpers/TransactionalEmailHelper.js";
import Axios from "axios";
import dayjs from "dayjs";

@controller("/giving/donate")
export class DonateController extends GivingBaseController {

  /**
   * Get available payment gateways for a church
   */
  @httpGet("/gateways/:churchId")
  public async getGateways(req: express.Request<{ churchId: string }>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      // authz-exempt: public donation widget keyed by the public churchId in the URL
      const churchId = req.params.churchId;
      if (!churchId) return this.json({ error: "Missing churchId" }, 400);

      const gateways = (await this.repos.gateway.loadAll(churchId)) as any[];

      const publicGateways = gateways.map(gateway => {
        const base: any = {
          id: gateway.id,
          provider: gateway.provider,
          publicKey: gateway.publicKey,
          productId: gateway.productId,
          payFees: gateway.payFees,
          currency: gateway.currency,
          enabled: gateway.enabled,
          environment: gateway.environment || null
        };
        // Include non-sensitive settings for frontend (e.g. sandbox flag)
        if (gateway.settings) {
          try {
            const settings = typeof gateway.settings === "string" ? JSON.parse(gateway.settings) : gateway.settings;
            base.settings = { sandbox: settings.sandbox || false };
          } catch { /* ignore parse errors */ }
        }
        return base;
      });

      return { gateways: publicGateways };
    });
  }

  @httpPost("/client-token")
  public async clientToken(req: express.Request<{}, {}, { churchId?: string; provider?: string; gatewayId?: string }>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      try {
        // authz-exempt: public donate flow; cross-checked against au.churchId with a 403 on mismatch
        const churchId = req.body.churchId || au.churchId;
        if (!churchId) return this.json({ error: "Missing churchId" }, 400);
        if (au.churchId && au.churchId !== churchId) return this.json({ error: "Forbidden" }, 403);

        const gateway = await this.getGateway(churchId, req.body.provider, req.body.gatewayId);
        if (!gateway) return this.json({ error: "Gateway not found" }, 404);

        try {
          const clientToken = await GatewayService.generateClientToken(gateway);
          return { clientToken, provider: gateway.provider };
        } catch (e) {
          console.error("Client token error", e);
          return this.json({ error: "Failed to generate client token" }, 502);
        }
      } catch (e) {
        console.error(e);
        return this.json({ error: "Unexpected error" }, 500);
      }
    });
  }

  @httpPost("/create-order")
  public async createOrder(
    req: express.Request<{}, {}, {
      churchId?: string;
      provider?: string;
      gatewayId?: string;
      amount?: number;
      currency?: string;
      funds?: any[];
      notes?: string;
      description?: string
    }>,
    res: express.Response
  ): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      try {
        // authz-exempt: public donate flow; cross-checked against au.churchId with a 403 on mismatch
        const churchId = req.body.churchId || au.churchId;
        const amount = Number(req.body.amount);
        const currency = (req.body.currency || "USD").toUpperCase();
        if (!churchId) return this.json({ error: "Missing churchId" }, 400);
        if (au.churchId && au.churchId !== churchId) return this.json({ error: "Forbidden" }, 403);
        if (!amount || amount <= 0 || !/^[A-Z]{3}$/.test(currency)) return this.json({ error: "Invalid amount or currency" }, 400);

        const gateway = await this.getGateway(churchId, req.body.provider, req.body.gatewayId);
        if (!gateway) return this.json({ error: "Gateway not found" }, 404);

        const capabilities = GatewayService.getProviderCapabilities(gateway);
        if (!capabilities?.supportsOrders) {
          return this.json({ error: `${gateway.provider} does not support order-based checkout` }, 400);
        }

        const funds = Array.isArray(req.body.funds) ? req.body.funds : [];
        // PayPal custom_id limited (~127 chars); keep compact.
        let customId = "";
        try {
          const minimalFunds = funds.map((f: any) => ({ id: f.id, amount: f.amount }));
          const encoded = JSON.stringify(minimalFunds);
          customId = encoded.length <= 120 ? encoded : ""; // avoid exceeding limit
        } catch {
          customId = "";
        }

        try {
          const order = await GatewayService.createOrder(gateway, {
            amount,
            currency,
            description: req.body.description || "Donation",
            customId: customId || undefined
          });
          return { id: order.id, status: order.status, provider: gateway.provider };
        } catch (e) {
          console.error("Create order error", e);
          return this.json({ error: "Failed to create order" }, 502);
        }
      } catch (e) {
        console.error(e);
        return this.json({ error: "Unexpected error" }, 500);
      }
    });
  }
  @httpPost("/log")
  public async log(req: express.Request<{}, {}, { donation: Donation; fundData: { id: string; amount: number } }>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.donations.edit)) return this.json({}, 401);
      const { donation, fundData } = req.body;
      donation.churchId = au.churchId;
      return this.logDonation(donation, [fundData]);
    });
  }

  @httpPost("/webhook/:provider")
  public async webhook(req: express.Request<{ provider: string }, {}, any>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      // authz-exempt: provider webhook; churchId from query, request authenticated by gateway signature
      const churchId = req.query.churchId?.toString();
      if (!churchId) return this.json({ error: "Missing churchId parameter" }, 400);

      const gateways = (await this.repos.gateway.loadAll(churchId)) as any[];
      if (!gateways.length) return this.json({ error: "No gateway configured" }, 401);

      const provider = req.params.provider?.toLowerCase();
      const gateway = gateways.find(g => g.provider.toLowerCase() === provider);

      if (!gateway) {
        return this.json({ error: `No ${provider} gateway configured` }, 404);
      }

      try {
        const webhookResult = await GatewayService.verifyWebhook(gateway, req.headers, req.body);

        if (!webhookResult.success) {
          console.error(`${provider} webhook verification failed`);
          return this.json({ error: `Invalid ${provider} webhook signature` }, 401);
        }

        if (!webhookResult.shouldProcess) {
          return this.json({}, 200);
        }

        const existingEvent = await this.repos.eventLog.loadByProviderId(churchId, webhookResult.eventId!);

        if (!existingEvent) {
          await GatewayService.logEvent(gateway, churchId, req.body, webhookResult.eventData, this.repos);

          if (this.shouldProcessDonation(provider, webhookResult.eventType!)) {
            const isPending = this.isPendingPayment(provider, webhookResult.eventType!);
            const isCompleted = this.isCompletedPayment(provider, webhookResult.eventType!);
            // KingdomFunding puts the transaction ID at reference_number or transaction.id, not at
            // the top-level id. Check every candidate so the idempotency match is reliable even if
            // the webhook surfaces the id under a different field than the /charge response stored.
            const candidateIds = [
              webhookResult.eventData?.id,
              webhookResult.eventData?.reference_number,
              webhookResult.eventData?.transaction?.id
            ].map((v) => (v == null ? "" : String(v))).filter((v) => v !== "");

            // Idempotency: always check for an existing donation by transactionId before creating.
            // This protects against:
            //   - Same webhook delivered twice (Cloud Tasks retries with same body.id are caught
            //     by eventLog dedup above; retries with new delivery IDs are caught here)
            //   - Multiple status webhooks for the same transaction (e.g., ACH succeeded then settled)
            //   - The /donate/charge endpoint already logging the donation immediately, then the
            //     async webhook arriving later
            let existingDonation = null;
            let matchedId: string | undefined = candidateIds[0];
            for (const cid of candidateIds) {
              const found = await this.repos.donation.loadByTransactionId(churchId, cid);
              if (found) { existingDonation = found; matchedId = cid; break; }
            }
            const transactionId = matchedId;

            if (isCompleted && transactionId) {
              if (existingDonation) {
                // Update existing pending/in-flight donation to complete
                await GatewayService.updateDonationStatus(gateway, churchId, transactionId, "complete", this.repos);
              } else {
                // No prior donation found, create a new complete donation
                await GatewayService.logDonation(gateway, churchId, webhookResult.eventData, this.repos, "complete");
              }
            } else if (isPending) {
              if (existingDonation) {
                // Pending webhook for a transaction we already know about — no-op
                console.log(`KingdomFunding webhook: skipping duplicate pending event for txnId=${transactionId}`);
              } else {
                // Create a new pending donation for ACH payments awaiting settlement
                await GatewayService.logDonation(gateway, churchId, webhookResult.eventData, this.repos, "pending");
              }
            } else {
              // Regular completed donation (card payments, etc.)
              if (existingDonation && transactionId) {
                await GatewayService.updateDonationStatus(gateway, churchId, transactionId, "complete", this.repos);
              } else {
                await GatewayService.logDonation(gateway, churchId, webhookResult.eventData, this.repos, "complete");
              }
            }
          } else if (this.shouldCancelSubscription(provider, webhookResult.eventType!)) {
            await this.repos.subscription.delete(churchId, webhookResult.eventData.id);
          }
        }
      } catch (error) {
        console.error(`Webhook processing failed for ${provider}:`, error);
        return this.json({ error: "Webhook processing failed" }, 500);
      }

      return this.json({}, 200);
    });
  }

  private shouldProcessDonation(provider: string, eventType: string): boolean {
    const donationEvents: Record<string, string[]> = {
      // payment_intent.processing is for ACH payments that are pending
      // payment_intent.succeeded is the new standard for ACH payments via Payment Intents API
      // charge.succeeded is kept for backward compatibility during migration
      stripe: ["charge.succeeded", "invoice.paid", "payment_intent.succeeded", "payment_intent.processing"],
      paypal: ["PAYMENT.CAPTURE.COMPLETED"],
      // KingdomFunding webhook events: "succeeded.charge" for card/ACH, "status.settled" for ACH settlement
      kingdomfunding: ["succeeded.charge", "status.settled"]
    };
    return donationEvents[provider]?.includes(eventType) || false;
  }

  private isPendingPayment(provider: string, eventType: string): boolean {
    // ACH payments start in "processing" state and later transition to "succeeded"/"settled"
    if (provider === "stripe") return eventType === "payment_intent.processing";
    // KingdomFunding ACH: initial charge succeeds but needs settlement confirmation
    if (provider === "kingdomfunding") return eventType === "status.originated" || eventType === "status.pending";
    return false;
  }

  private isCompletedPayment(provider: string, eventType: string): boolean {
    if (provider === "stripe") return eventType === "payment_intent.succeeded";
    if (provider === "kingdomfunding") return eventType === "status.settled" || eventType === "succeeded.charge";
    return false;
  }

  private shouldCancelSubscription(provider: string, eventType: string): boolean {
    const cancellationEvents: Record<string, string[]> = {
      stripe: ["customer.subscription.deleted"],
      paypal: ["BILLING.SUBSCRIPTION.CANCELLED"]
    };
    return cancellationEvents[provider]?.includes(eventType) || false;
  }

  @httpPost("/replay-stripe-events")
  public async replayStripeEvents(
    req: express.Request<{}, {}, { startDate: string; endDate: string; dryRun?: boolean }>,
    res: express.Response
  ): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.donations.edit)) return this.json({ error: "Unauthorized" }, 401);

      const { startDate, endDate, dryRun = true } = req.body;
      if (!startDate || !endDate) {
        return this.json({ error: "startDate and endDate are required" }, 400);
      }

      const startTimestamp = Math.floor(new Date(startDate).getTime() / 1000);
      const endTimestamp = Math.floor(new Date(endDate).getTime() / 1000);

      if (isNaN(startTimestamp) || isNaN(endTimestamp)) {
        return this.json({ error: "Invalid date format" }, 400);
      }

      const gateways = (await this.repos.gateway.loadAll(au.churchId)) as any[];
      const stripeGateway = gateways.find((g) => g.provider.toLowerCase() === "stripe");

      if (!stripeGateway) {
        return this.json({ error: "No Stripe gateway configured" }, 404);
      }

      const secretKey = EncryptionHelper.decrypt(stripeGateway.privateKey);

      try {
        const events = await StripeHelper.listEvents(secretKey, {
          startDate: startTimestamp,
          endDate: endTimestamp,
          // Include payment_intent.succeeded for new ACH payments using Payment Intents API
          types: ["charge.succeeded", "invoice.paid", "payment_intent.succeeded"]
        });

        const results: {
          eventId: string;
          type: string;
          amount: number;
          created: Date;
          customer: string;
          status: "new" | "already_imported" | "imported" | "skipped" | "error";
          error?: string;
        }[] = [];

        for (const event of events) {
          const eventData = event.data.object as any;

          // Skip subscription events (they're handled separately)
          const isSubscriptionEvent = eventData.subscription || eventData.description?.toLowerCase().includes("subscription");
          if (event.type === "charge.succeeded" && isSubscriptionEvent) {
            results.push({
              eventId: event.id,
              type: event.type,
              amount: (eventData.amount || eventData.amount_paid || 0) / 100,
              created: new Date(event.created * 1000),
              customer: eventData.customer || "",
              status: "skipped",
              error: "Subscription event - handled by invoice.paid"
            });
            continue;
          }

          // Check if already processed via event log
          const existingEvent = await this.repos.eventLog.loadByProviderId(au.churchId, event.id);

          if (existingEvent) {
            results.push({
              eventId: event.id,
              type: event.type,
              amount: (eventData.amount || eventData.amount_paid || 0) / 100,
              created: new Date(event.created * 1000),
              customer: eventData.customer || "",
              status: "already_imported"
            });
            continue;
          }

          // Secondary check: look for matching donation by amount, date, and person
          const amount = (eventData.amount || eventData.amount_paid || 0) / 100;
          const donationDate = new Date(eventData.created * 1000);
          const customerData = eventData.customer ? await this.repos.customer.load(au.churchId, eventData.customer) as any : null;
          const personId = customerData?.personId || null;

          const existingDonation = await this.repos.donation.findMatchingDonation(au.churchId, amount, donationDate, personId);

          if (existingDonation) {
            results.push({
              eventId: event.id,
              type: event.type,
              amount,
              created: donationDate,
              customer: eventData.customer || "",
              status: "already_imported",
              error: "Matched existing donation by amount/date/person"
            });
            continue;
          }

          if (dryRun) {
            results.push({
              eventId: event.id,
              type: event.type,
              amount,
              created: donationDate,
              customer: eventData.customer || "",
              status: "new"
            });
          } else {
            // Actually import the event
            try {
              await StripeHelper.logEvent(au.churchId, event, eventData, this.repos);
              await StripeHelper.logDonation(secretKey, au.churchId, eventData, this.repos);

              results.push({
                eventId: event.id,
                type: event.type,
                amount,
                created: donationDate,
                customer: eventData.customer || "",
                status: "imported"
              });
            } catch (err: any) {
              results.push({
                eventId: event.id,
                type: event.type,
                amount,
                created: donationDate,
                customer: eventData.customer || "",
                status: "error",
                error: err.message || "Unknown error"
              });
            }
          }
        }

        const summary = {
          total: results.length,
          new: results.filter((r) => r.status === "new").length,
          alreadyImported: results.filter((r) => r.status === "already_imported").length,
          imported: results.filter((r) => r.status === "imported").length,
          skipped: results.filter((r) => r.status === "skipped").length,
          errors: results.filter((r) => r.status === "error").length
        };

        return { dryRun, summary, results };
      } catch (err: any) {
        console.error("Error replaying Stripe events:", err);
        return this.json({ error: err.message || "Failed to fetch Stripe events" }, 500);
      }
    });
  }

  // authz-exempt: self-service — donor charges their own supplied payment token, scoped to au.churchId (body churchId only a fallback)
  @httpPost("/charge")
  public async charge(req: express.Request<any>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const donationData = req.body;
      const churchId = au.churchId || donationData.churchId;

      // Validate required parameters
      if (!donationData.provider && !donationData.gatewayId) {
        return this.json({ error: "Either provider or gatewayId is required" }, 400);
      }

      const gateway = await this.getGateway(churchId, donationData.provider, donationData.gatewayId);
      if (!gateway) return this.json({ error: "Gateway not found" }, 404);

      const rawCurrency: string = donationData?.currency || gateway?.currency || "USD";
      const normalizedCurrency = rawCurrency.toLowerCase();
      donationData.currency = normalizedCurrency;

      try {
        // KF + saveCard: create customer → add payment method (nonce) → charge with pm-{id}. Uses GatewayService for credential handling.
        if (donationData.saveCard && gateway.provider?.toLowerCase() === "kingdomfunding") {
          try {
            const personEmail = donationData.person?.email || "";
            const personName = donationData.person?.name || donationData.name || "";
            const personId = donationData.person?.id;

            let customerId: string | undefined;
            if (personId) {
              const existingCustomer = await this.repos.customer.loadByPersonAndProvider(churchId, personId, "kingdomfunding") as any;
              if (existingCustomer) customerId = existingCustomer.id;
            }
            if (!customerId) {
              customerId = await GatewayService.createCustomer(gateway, personEmail, personName);
              if (customerId && personId) {
                await this.repos.customer.save({ id: customerId, churchId, personId, provider: "kingdomfunding" });
              }
            }

            if (customerId) {
              const nonceToken = donationData.token || donationData.id || "";
              const nonceSource = nonceToken.startsWith("nonce-") ? nonceToken : `nonce-${nonceToken}`;

              const attachOptions: any = {
                customerId,
                source: nonceSource,
                name: personName
              };
              if (donationData.expiry_month) attachOptions.expiry_month = Number(donationData.expiry_month);
              if (donationData.expiry_year) {
                let ey = Number(donationData.expiry_year);
                if (ey > 0 && ey < 100) ey += 2000;
                attachOptions.expiry_year = ey;
              }

              let pm: any;
              try {
                pm = await GatewayService.attachPaymentMethod(gateway, nonceSource, attachOptions);
              } catch (attachErr: any) {
                // Stale local customer record: recreate and retry.
                const status = attachErr.response?.status || attachErr.statusCode;
                if (status === 404) {
                  console.log(`Customer ${customerId} not found on Accept Blue, recreating...`);
                  customerId = await GatewayService.createCustomer(gateway, personEmail, personName);
                  if (customerId && personId) {
                    await this.repos.customer.save({ id: customerId, churchId, personId, provider: "kingdomfunding" });
                  }
                  if (customerId) {
                    attachOptions.customerId = customerId;
                    pm = await GatewayService.attachPaymentMethod(gateway, nonceSource, attachOptions);
                  } else {
                    throw attachErr;
                  }
                } else {
                  throw attachErr;
                }
              }

              const savedPmId = pm?.id;
              if (savedPmId) {
                const cardType = pm.card_type || donationData.cardBrand || "Card";
                const last4 = pm.last_4 || donationData.cardLast4 || "";
                await this.repos.gatewayPaymentMethod.save({
                  churchId,
                  gatewayId: gateway.id,
                  customerId,
                  externalId: String(savedPmId),
                  methodType: donationData.type === "check" ? "bank" : "card",
                  displayName: `${cardType} ****${last4}`,
                  metadata: { card_type: cardType, last_4: last4 }
                } as any);

                donationData.paymentMethodId = String(savedPmId);
                donationData.customerId = customerId;
                delete donationData.id;     // Remove nonce so processCharge uses pm-{id}
                delete donationData.token;
              }
            }
          } catch (saveCardErr: any) {
            // Never log raw response body; can contain donor PII (billing name, last_4, AVS zip).
            console.warn("Charge: Failed to save card before charge (non-fatal, charging with nonce):", saveCardErr.response?.status || "", saveCardErr.response?.data?.error_message || saveCardErr.message);
            // Fall through — charge will proceed with original nonce
          }
        }

        // KF saved payment method: frontend sends numeric ID (PM ID from Accept Blue). Detect and move to paymentMethodId so provider uses pm-{id} instead of nonce.
        if (gateway.provider?.toLowerCase() === "kingdomfunding" && donationData.id && !donationData.paymentMethodId) {
          const id = String(donationData.id);
          if (/^\d+$/.test(id)) {
            donationData.paymentMethodId = id;
            delete donationData.id;
          }
        }

        const chargeResult = await GatewayService.processCharge(gateway, donationData);

        if (!chargeResult.success) {
          return this.json({ error: chargeResult.data?.error || chargeResult.error || "Charge processing failed" }, 400);
        }

        // PayPal and KF: log donation immediately (no webhook flow).
        if (gateway.provider === "paypal" || gateway.provider?.toLowerCase() === "kingdomfunding") {
          try {
            await GatewayService.logEvent(gateway, churchId, chargeResult.data, chargeResult.data, this.repos);
            const logData = {
              ...chargeResult.data,
              amount: donationData.amount,
              funds: donationData.funds,
              person: donationData.person,
              notes: donationData.notes
            };
            await GatewayService.logDonation(gateway, churchId, logData, this.repos, "complete");
          } catch (logErr: any) {
            console.error("Charge: Failed to log donation:", logErr?.message || logErr, logErr?.stack);
          }
        }

        try {
          await this.sendEmails(donationData.person.email, donationData?.church, donationData.funds, donationData?.amount, donationData?.interval, donationData?.billing_cycle_anchor, "one-time", normalizedCurrency);
        } catch (emailErr) {
          console.warn("Charge: Failed to send confirmation email (non-fatal)", emailErr);
        }

        return { ...chargeResult.data, provider: gateway.provider };
      } catch (error) {
        console.error("Charge processing failed:", error);
        return this.json({ error: "Charge processing failed" }, 500);
      }
    });
  }

  @httpPost("/subscribe")
  public async subscribe(req: express.Request<any>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      // authz-exempt: public donate flow; churchId prefers au.churchId, body value only a fallback
      const {
        id, amount, customerId, type, billing_cycle_anchor, proration_behavior, interval, funds, person, notes,
        churchId: CHURCH_ID, provider, gatewayId, currency, expiry_month, expiry_year, routing_number,
        account_number, account_type, sec_code, name: bankName
      } = req.body;
      const churchId = au.churchId || CHURCH_ID;

      if (!provider && !gatewayId) {
        return this.json({ error: "Either provider or gatewayId is required" }, 400);
      }

      const gateway = await this.getGateway(churchId, provider, gatewayId);
      if (!gateway) return this.json({ error: "Gateway not found" }, 404);

      const capabilities = GatewayService.getProviderCapabilities(gateway);
      if (!capabilities?.supportsSubscriptions) {
        return this.json({ error: `${gateway.provider} does not support recurring subscriptions` }, 400);
      }

      const rawCurrency: string = currency || gateway?.currency || "USD";
      const normalizedCurrency = rawCurrency.toLowerCase();

      try {
        const subscriptionData = {
          id,
          amount,
          currency: normalizedCurrency,
          customerId,
          type,
          billing_cycle_anchor,
          proration_behavior,
          interval,
          notes,
          person,
          name: bankName || person?.name?.display || person?.name || "",
          email: person?.email || "",
          expiry_month,
          expiry_year,
          // ACH/bank fields for KingdomFunding recurring donations
          routing_number,
          account_number,
          account_type,
          sec_code
        };

        // For KF: pass existing local customer ID so provider can reuse it
        if (gateway.provider?.toLowerCase() === "kingdomfunding" && person?.id && !subscriptionData.customerId) {
          const existingKFCustomer = await this.repos.customer.loadByPersonAndProvider(churchId, person.id, "kingdomfunding") as any;
          if (existingKFCustomer?.id) subscriptionData.customerId = existingKFCustomer.id;
        }

        const subscriptionResult = await GatewayService.createSubscription(gateway, subscriptionData);

        if (!subscriptionResult.success) {
          return this.json({ error: "Subscription creation failed" }, 400);
        }

        // KF customer ID created during subscription on Accept Blue.
        const abCustomerId = subscriptionResult.data?.customerId ? String(subscriptionResult.data.customerId) : customerId;
        if (gateway.provider?.toLowerCase() === "kingdomfunding" && abCustomerId && person?.id) {
          try {
            await this.repos.customer.save({ id: abCustomerId, churchId, personId: person.id, provider: "kingdomfunding" });
          } catch { /* customer may already exist, ignore */ }
        }

        const subscription: Subscription = {
          id: subscriptionResult.subscriptionId,
          churchId,
          personId: person.id,
          customerId: abCustomerId || customerId
        };

        await this.repos.subscription.save(subscription);

        const promises: Promise<SubscriptionFund>[] = [];
        funds.forEach((fund: FundDonation) => {
          const subscriptionFund: SubscriptionFund = {
            churchId,
            subscriptionId: subscription.id,
            fundId: fund.id,
            amount: fund.amount
          };
          promises.push(this.repos.subscriptionFunds.save(subscriptionFund));
        });

        await Promise.all(promises);

        try {
          await this.sendEmails(person.email, req.body?.church, funds, amount, interval, billing_cycle_anchor, "recurring", normalizedCurrency);
        } catch (emailErr) {
          console.warn("Subscribe: Failed to send confirmation email (non-fatal)", emailErr);
        }

        // Normalize status for frontend compatibility
        const normalizedStatus = (subscriptionResult.data?.status || "active").toLowerCase();
        return { ...subscriptionResult.data, provider: gateway.provider, status: normalizedStatus };
      } catch (error) {
        console.error("Subscription creation failed:", error);
        return this.json({ error: "Subscription creation failed" }, 500);
      }
    });
  }

  @httpPost("/fee")
  public async calculateFee(req: express.Request<{}, {}, { type?: string; provider?: string; gatewayId?: string; amount: number; currency?: string }>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const { type, provider, gatewayId, amount, currency } = req.body;
      // authz-exempt: public donate widget; fee calc keyed by public churchId.
      const churchId = req.query.churchId?.toString();

      if (!churchId) {
        return this.json({ error: "Missing churchId parameter" }, 400);
      }

      try {
        let calculatedFee = 0;
        let gatewayProvider = null;
        const currencyToUse = (currency || "USD").toUpperCase();

        if (provider || gatewayId) {
          const gateway = await this.getGateway(churchId, provider, gatewayId);

          if (!gateway) {
            return this.json({ error: "Gateway not found" }, 404);
          }

          calculatedFee = await GatewayService.calculateFees(gateway, amount, churchId, currencyToUse);
          gatewayProvider = gateway.provider;
        } else {
          // Legacy type-based calculation for backward compatibility.
          if (type === "creditCard") {
            calculatedFee = await this.getCreditCardFees(amount, churchId, currencyToUse);
          } else if (type === "ach") {
            calculatedFee = await this.getACHFees(amount, churchId);
          }
        }

        return { calculatedFee, provider: gatewayProvider, currency: currencyToUse };
      } catch (error) {
        console.error("Fee calculation failed:", error);
        return { calculatedFee: 0 };
      }
    });
  }

  private sendEmails = async (
    to: string,
    church: { name?: string; subDomain?: string; churchURL?: string; logo?: string },
    funds: any[],
    amount?: number,
    interval?: { interval_count: number; interval: string },
    billingCycleAnchor?: number,
    donationType: "recurring" | "one-time" = "recurring",
    currency: string = "USD"
  ) => {
    if (!to) return;

    const contentRows: any[] = [];
    let totalFundAmount = 0;
    const currencyCode = (currency || "USD").toUpperCase();

    funds.forEach((fund, index) => {
      totalFundAmount += fund.amount;
      const formattedFund = CurrencyHelper.formatCurrencyWithLocale(fund.amount, currencyCode);
      if (donationType === "recurring") {
        const startDate = dayjs(billingCycleAnchor).format("MMM D, YYYY");
        contentRows.push(
          `<tr>${index === 0 ? `<td style="font-size: 15px" rowspan="${funds.length}">${interval!.interval_count} ${interval!.interval}<BR><span style="font-size: 13px">(from ${startDate})</span></td>` : ""}<td style="font-size: 15px; text-overflow: ellipsis; overflow: hidden;">${fund.name}</td><td style="font-size: 15px">${formattedFund}</td></tr>`
        );
      } else {
        contentRows.push(`<tr><td style="font-size: 15px; text-overflow: ellipsis; overflow: hidden;">${fund.name}</td><td style="font-size: 15px">${formattedFund}</td></tr>`);
      }
    });

    const transactionFee = amount! - totalFundAmount;
    const formattedFee = CurrencyHelper.formatCurrencyWithLocale(transactionFee, currencyCode);
    const formattedTotal = CurrencyHelper.formatCurrencyWithLocale(amount || 0, currencyCode);

    const domain = Environment.appEnv === "staging" ? `${church.subDomain}.staging.b1.church` : `${church.subDomain}.b1.church`;

    const title = `${church?.logo ? `<img src="${church.logo}" alt="Logo: " style="width: 100%" /> ` : ""}${church.name}`;

    const recurringDonationContent =
      `
      <h3 style="font-size: 20px;">Your recurring donation has been confirmed!</h3>
      <table role="presentation" style="text-align: center;" cellspacing="8" width="80%">
        <tablebody>
          <tr>
            <th style="font-size: 16px" width="30%">Interval</th>
            <th style="font-size: 16px" width="30%">Fund</th>
            <th style="font-size: 16px" width="30%">Amount</th>
          </tr>` +
      contentRows.join(" ") +
      `${
        transactionFee === 0
          ? ""
          : `
            <tr style="border-top: solid #dee2e6 1px">
              <td></td>
              <th style="font-size: 15px">Transaction Fee</th>
              <td>${formattedFee}</td>
            </tr>
            <tr style="border-top: solid #dee2e6 1px">
              <td></td>
              <th style="font-size: 15px">Total</th>
              <td>${formattedTotal}</td>
            </tr>
          `
      }
        </tablebody>
      </table>
      <br />
      <h4 style="font-size: 14px;">
        <a href="https://${domain}/member/donate" target="_blank" rel="noreferrer noopener">Modify your subscription here!</a>
      </h4>
    `;
    const oneTimeDonationContent =
      `
      <h3 style="font-size: 20px;">Your donation has been confirmed!</h3>
      <table role="presentation" style="text-align: center;" cellspacing="8" width="80%">
        <tablebody>
          <tr>
            <th style="font-size: 16px" width="50%">Fund</th>
            <th style="font-size: 16px" width="50%">Amount</th>
          </tr>` +
      contentRows.join(" ") +
      `${
        transactionFee === 0
          ? ""
          : `
            <tr style="border-top: solid #dee2e6 1px">
              <th style="font-size: 15px">Transaction Fee</th>
              <td>${formattedFee}</td>
            </tr>
            <tr style="border-top: solid #dee2e6 1px">
              <th style="font-size: 15px">Total</th>
              <td>${formattedTotal}</td>
            </tr>
          `
      }
        </tablebody>
      </table>
    `;

    const contents = donationType === "recurring" ? recurringDonationContent : oneTimeDonationContent;

    await TransactionalEmailHelper.sendTransactional(Environment.supportEmail, to, title, church.churchURL as string, "Thank You For Donating", contents, "ChurchEmailTemplate.html");
  };

  private logDonation = async (donationData: Donation, fundData: FundDonation[]) => {
    const batch: DonationBatch = await this.repos.donationBatch.getOrCreateCurrent(donationData.churchId as string);
    donationData.batchId = batch.id;
    const donation = await this.repos.donation.save(donationData);
    const promises: Promise<FundDonation>[] = [];
    fundData.forEach((fund: FundDonation) => {
      const fundDonation: FundDonation = {
        churchId: donation.churchId,
        amount: fund.amount,
        donationId: donation.id,
        fundId: fund.id
      };
      promises.push(this.repos.fundDonation.save(fundDonation));
    });
    return await Promise.all(promises);
  };


  // Legacy fee calculation methods for backward compatibility
  private getCreditCardFees = async (amount: number, churchId: string, currency: string = "USD") => {
    const gateways = (await this.repos.gateway.loadAll(churchId)) as any[];
    const stripeGateway = gateways.find((g) => g.provider.toLowerCase() === "stripe");
    if (stripeGateway) {
      return await GatewayService.calculateFees(stripeGateway, amount, churchId, currency);
    }

    let customFixedFee: number | null = null;
    let customPercentFee: number | null = null;
    if (churchId) {
      const response = await Axios.get(Environment.membershipApi + "/settings/public/" + churchId);
      const data = response.data;
      if (data?.flatRateCC && data.flatRateCC !== null && data.flatRateCC !== undefined && data.flatRateCC !== "") customFixedFee = +data.flatRateCC;
      if (data?.transFeeCC && data.transFeeCC !== null && data.transFeeCC !== undefined && data.transFeeCC !== "") customPercentFee = +data.transFeeCC / 100;
    }
    const fixedFee = customFixedFee ?? 0.3;
    // Clamp [0, 0.99] to avoid divide by zero or negative fees.
    const fixedPercent = Math.min(Math.max(customPercentFee ?? 0.029, 0), 0.99);
    return Math.round(((amount + fixedFee) / (1 - fixedPercent) - amount) * 100) / 100;
  };

  private getACHFees = async (amount: number, churchId: string) => {
    const gateways = (await this.repos.gateway.loadAll(churchId)) as any[];
    const stripeGateway = gateways.find((g) => g.provider.toLowerCase() === "stripe");
    if (stripeGateway) {
      return await GatewayService.calculateFees(stripeGateway, amount, churchId);
    }

    let customPercentFee: number | null = null;
    let customMaxFee: number | null = null;
    if (churchId) {
      const response = await Axios.get(Environment.membershipApi + "/settings/public/" + churchId);
      const data = response.data;
      if (data?.flatRateACH && data.flatRateACH !== null && data.flatRateACH !== undefined && data.flatRateACH !== "") customPercentFee = +data.flatRateACH / 100;
      if (data?.hardLimitACH && data.hardLimitACH !== null && data.hardLimitACH !== undefined && data.hardLimitACH !== "") customMaxFee = +data.hardLimitACH;
    }
    // Clamp [0, 0.99] to avoid divide by zero or negative fees.
    const fixedPercent = Math.min(Math.max(customPercentFee ?? 0.008, 0), 0.99);
    const fixedMaxFee = customMaxFee ?? 5.0;
    const fee = Math.round((amount / (1 - fixedPercent) - amount) * 100) / 100;
    return Math.min(fee, fixedMaxFee);
  };

  @httpPost("/captcha-verify")
  public async captchaVerify(req: express.Request<{}, {}, { token: string }>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      try {
        const { token } = req.body;
        const response = await Axios.post(`https://www.google.com/recaptcha/api/siteverify?secret=${Environment.googleRecaptchaSecretKey}&response=${token}`);
        const data = response.data;

        if (!data.success) {
          return { response: "robot" };
        }

        // if google's response already includes b1.church in hostname property, no need to check in the DB then
        if (data.hostname.includes("b1.church")) {
          return { response: "human" };
        }

        // if its a custom domain, verify the domain exist in the DB
        const domainData = await Axios.get(`${Environment.membershipApi}/domains/public/lookup/${data.hostname.replace(".localhost", "")}`);
        const domain: any = await domainData.data;

        if (domain) {
          return { response: "human" };
        }

        // if calls is made from localhost
        if (data.hostname.includes(".localhost")) {
          return { response: "human" };
        }

        return { response: "" };
      } catch {
        return this.json({ message: "Error verifying reCAPTCHA" }, 400);
      }
    });
  }


  /**
   * Get gateway by provider name or ID using the centralized helper
   */
  private async getGateway(churchId: string, provider?: string, gatewayId?: string): Promise<any> {
    try {
      return await GatewayService.getGatewayForChurch(churchId, {
        provider,
        gatewayId
      }, this.repos.gateway);
    } catch {
      return null;
    }
  }
}
