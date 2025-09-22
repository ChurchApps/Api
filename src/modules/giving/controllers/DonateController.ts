import { controller, httpPost, httpGet } from "inversify-express-utils";
import express from "express";
import { GivingCrudController } from "./GivingCrudController";
import { Permissions } from "../../../shared/helpers/Permissions";
import { GatewayService } from "../../../shared/helpers/GatewayService";
import { EmailHelper, CurrencyHelper } from "@churchapps/apihelper";
import { Donation, FundDonation, DonationBatch, Subscription, SubscriptionFund } from "../models";
import { Environment } from "../../../shared/helpers/Environment";
import Axios from "axios";
import dayjs from "dayjs";

@controller("/giving/donate")
export class DonateController extends GivingCrudController {
  protected crudSettings = {
    repoKey: "donation", // not used by base here
    permissions: { view: Permissions.donations.view, edit: Permissions.donations.edit },
    routes: [] as const // all CRUD endpoints disabled; custom routes only
  };

  /**
   * Get available payment gateways for a church
   */
  @httpGet("/gateways/:churchId")
  public async getGateways(req: express.Request<{ churchId: string }>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const churchId = req.params.churchId;
      if (!churchId) return this.json({ error: "Missing churchId" }, 400);

      const gateways = (await this.repos.gateway.loadAll(churchId)) as any[];

      // Return gateway info without sensitive data
      const publicGateways = gateways.map(gateway => ({
        id: gateway.id,
        provider: gateway.provider,
        publicKey: gateway.publicKey,
        productId: gateway.productId
      }));

      return { gateways: publicGateways };
    });
  }

  @httpPost("/client-token")
  public async clientToken(req: express.Request<{}, {}, { churchId?: string; provider?: string; gatewayId?: string }>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      try {
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
        const churchId = req.body.churchId || au.churchId;
        const amount = Number(req.body.amount);
        const currency = (req.body.currency || "USD").toUpperCase();
        if (!churchId) return this.json({ error: "Missing churchId" }, 400);
        if (au.churchId && au.churchId !== churchId) return this.json({ error: "Forbidden" }, 403);
        if (!amount || amount <= 0 || !/^[A-Z]{3}$/.test(currency)) return this.json({ error: "Invalid amount or currency" }, 400);

        const gateway = await this.getGateway(churchId, req.body.provider, req.body.gatewayId);
        if (!gateway) return this.json({ error: "Gateway not found" }, 404);

        // Check if provider supports orders (required for PayPal-style checkout)
        const capabilities = GatewayService.getProviderCapabilities(gateway);
        if (!capabilities?.supportsOrders) {
          return this.json({ error: `${gateway.provider} does not support order-based checkout` }, 400);
        }

        const funds = Array.isArray(req.body.funds) ? req.body.funds : [];
        // Warning: PayPal custom_id is limited (~127 chars). Keep it compact.
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
    return this.actionWrapperAnon(req, res, async () => {
      const gateways = (await this.repos.gateway.loadAll(req.body.donation.churchId as string)) as any[];
      const { donation, fundData } = req.body;
      if (gateways.length === 0) return this.json({}, 401);
      return this.logDonation(donation, [fundData]);
    });
  }

  @httpPost("/webhook/:provider")
  public async webhook(req: express.Request<{ provider: string }, {}, any>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
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

        const existingEvent = await this.repos.eventLog.load(churchId, webhookResult.eventId!);

        if (!existingEvent) {
          await GatewayService.logEvent(gateway, churchId, req.body, webhookResult.eventData, this.repos);

          if (this.shouldProcessDonation(provider, webhookResult.eventType!)) {
            await GatewayService.logDonation(gateway, churchId, webhookResult.eventData, this.repos);
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
    const donationEvents = {
      stripe: ["charge.succeeded", "invoice.paid"],
      paypal: ["PAYMENT.CAPTURE.COMPLETED"]
    };
    return donationEvents[provider as keyof typeof donationEvents]?.includes(eventType) || false;
  }

  private shouldCancelSubscription(provider: string, eventType: string): boolean {
    const cancellationEvents = {
      stripe: ["customer.subscription.deleted"],
      paypal: ["BILLING.SUBSCRIPTION.CANCELLED"]
    };
    return cancellationEvents[provider as keyof typeof cancellationEvents]?.includes(eventType) || false;
  }

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

      try {
        const chargeResult = await GatewayService.processCharge(gateway, donationData);

        if (!chargeResult.success) {
          return this.json({ error: "Charge processing failed" }, 400);
        }

        // For PayPal, we need to log the events since it's captured immediately
        if (gateway.provider === "paypal") {
          await GatewayService.logEvent(gateway, churchId, chargeResult.data, chargeResult.data, this.repos);
          await GatewayService.logDonation(gateway, churchId, chargeResult.data, this.repos);
        }

        await this.sendEmails(donationData.person.email, donationData?.church, donationData.funds, donationData?.amount, donationData?.interval, donationData?.billing_cycle_anchor, "one-time");

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
      const { id, amount, customerId, type, billing_cycle_anchor, proration_behavior, interval, funds, person, notes, churchId: CHURCH_ID, provider, gatewayId } = req.body;
      const churchId = au.churchId || CHURCH_ID;

      // Validate required parameters
      if (!provider && !gatewayId) {
        return this.json({ error: "Either provider or gatewayId is required" }, 400);
      }

      const gateway = await this.getGateway(churchId, provider, gatewayId);
      if (!gateway) return this.json({ error: "Gateway not found" }, 404);

      // Check if provider supports subscriptions
      const capabilities = GatewayService.getProviderCapabilities(gateway);
      if (!capabilities?.supportsSubscriptions) {
        return this.json({ error: `${gateway.provider} does not support recurring subscriptions` }, 400);
      }

      try {
        const subscriptionData = {
          id,
          amount,
          customerId,
          type,
          billing_cycle_anchor,
          proration_behavior,
          interval,
          notes
        };

        const subscriptionResult = await GatewayService.createSubscription(gateway, subscriptionData);

        if (!subscriptionResult.success) {
          return this.json({ error: "Subscription creation failed" }, 400);
        }

        const subscription: Subscription = {
          id: subscriptionResult.subscriptionId,
          churchId,
          personId: person.id,
          customerId,
          gatewayId: gateway.id
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
        await this.sendEmails(person.email, req.body?.church, funds, amount, interval, billing_cycle_anchor, "recurring");

        return { ...subscriptionResult.data, provider: gateway.provider };
      } catch (error) {
        console.error("Subscription creation failed:", error);
        return this.json({ error: "Subscription creation failed" }, 500);
      }
    });
  }

  @httpPost("/fee")
  public async calculateFee(req: express.Request<{}, {}, { type?: string; provider?: string; gatewayId?: string; amount: number }>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const { type, provider, gatewayId, amount } = req.body;
      const churchId = req.query.churchId?.toString();

      if (!churchId) {
        return this.json({ error: "Missing churchId parameter" }, 400);
      }

      try {
        let calculatedFee = 0;
        let gatewayProvider = null;

        if (provider || gatewayId) {
          // Use gateway-specific fee calculation
          const gateway = await this.getGateway(churchId, provider, gatewayId);

          if (!gateway) {
            return this.json({ error: "Gateway not found" }, 404);
          }

          calculatedFee = await GatewayService.calculateFees(gateway, amount, churchId);
          gatewayProvider = gateway.provider;
        } else {
          // Legacy type-based calculation for backward compatibility
          if (type === "creditCard") {
            calculatedFee = await this.getCreditCardFees(amount, churchId);
          } else if (type === "ach") {
            calculatedFee = await this.getACHFees(amount, churchId);
          }
        }

        return { calculatedFee, provider: gatewayProvider };
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
    donationType: "recurring" | "one-time" = "recurring"
  ) => {
    const contentRows: any[] = [];
    let totalFundAmount = 0;

    funds.forEach((fund, index) => {
      totalFundAmount += fund.amount;
      if (donationType === "recurring") {
        const startDate = dayjs(billingCycleAnchor).format("MMM D, YYYY");
        contentRows.push(
          `<tr>${index === 0 ? `<td style="font-size: 15px" rowspan="${funds.length}">${interval!.interval_count} ${interval!.interval}<BR><span style="font-size: 13px">(from ${startDate})</span></td>` : ""}<td style="font-size: 15px; text-overflow: ellipsis; overflow: hidden;">${fund.name}</td><td style="font-size: 15px">$${fund.amount}</td></tr>`
        );
      } else {
        contentRows.push(`<tr><td style="font-size: 15px; text-overflow: ellipsis; overflow: hidden;">${fund.name}</td><td style="font-size: 15px">$${fund.amount}</td></tr>`);
      }
    });

    const transactionFee = amount! - totalFundAmount;

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
              <td>$${CurrencyHelper.formatCurrency(transactionFee)}</td>
            </tr>
            <tr style="border-top: solid #dee2e6 1px">
              <td></td>
              <th style="font-size: 15px">Total</th>
              <td>$${amount}</td>
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
              <td>$${CurrencyHelper.formatCurrency(transactionFee)}</td>
            </tr>
            <tr style="border-top: solid #dee2e6 1px">
              <th style="font-size: 15px">Total</th>
              <td>$${amount}</td>
            </tr>
          `
      }
        </tablebody>
      </table>
    `;

    const contents = donationType === "recurring" ? recurringDonationContent : oneTimeDonationContent;

    await EmailHelper.sendTemplatedEmail(Environment.supportEmail, to, title, church.churchURL as string, "Thank You For Donating", contents, "ChurchEmailTemplate.html");
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
  private getCreditCardFees = async (amount: number, churchId: string) => {
    const gateways = (await this.repos.gateway.loadAll(churchId)) as any[];
    const stripeGateway = gateways.find((g) => g.provider.toLowerCase() === "stripe");
    if (stripeGateway) {
      return await GatewayService.calculateFees(stripeGateway, amount, churchId);
    }

    // Fallback to hardcoded calculation if no Stripe gateway found
    let customFixedFee: number | null = null;
    let customPercentFee: number | null = null;
    if (churchId) {
      const response = await Axios.get(Environment.membershipApi + "/settings/public/" + churchId);
      const data = response.data;
      if (data?.flatRateCC && data.flatRateCC !== null && data.flatRateCC !== undefined && data.flatRateCC !== "") customFixedFee = +data.flatRateCC;
      if (data?.transFeeCC && data.transFeeCC !== null && data.transFeeCC !== undefined && data.transFeeCC !== "") customPercentFee = +data.transFeeCC / 100;
    }
    const fixedFee = customFixedFee ?? 0.3;
    const fixedPercent = customPercentFee ?? 0.029;
    return Math.round(((amount + fixedFee) / (1 - fixedPercent) - amount) * 100) / 100;
  };

  private getACHFees = async (amount: number, churchId: string) => {
    // ACH is typically handled by Stripe, so find Stripe gateway
    const gateways = (await this.repos.gateway.loadAll(churchId)) as any[];
    const stripeGateway = gateways.find((g) => g.provider.toLowerCase() === "stripe");
    if (stripeGateway) {
      return await GatewayService.calculateFees(stripeGateway, amount, churchId);
    }

    // Fallback to hardcoded calculation if no Stripe gateway found
    let customPercentFee: number | null = null;
    let customMaxFee: number | null = null;
    if (churchId) {
      const response = await Axios.get(Environment.membershipApi + "/settings/public/" + churchId);
      const data = response.data;
      if (data?.flatRateACH && data.flatRateACH !== null && data.flatRateACH !== undefined && data.flatRateACH !== "") customPercentFee = +data.flatRateACH / 100;
      if (data?.hardLimitACH && data.hardLimitACH !== null && data.hardLimitACH !== undefined && data.hardLimitACH !== "") customMaxFee = +data.hardLimitACH;
    }
    const fixedPercent = customPercentFee ?? 0.008;
    const fixedMaxFee = customMaxFee ?? 5.0;
    const fee = Math.round((amount / (1 - fixedPercent) - amount) * 100) / 100;
    return Math.min(fee, fixedMaxFee);
  };

  @httpPost("/captcha-verify")
  public async captchaVerify(req: express.Request<{}, {}, { token: string }>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      try {
        // detecting if its a bot or a human
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
      // Return null for backward compatibility when gateway not found
      return null;
    }
  }
}
