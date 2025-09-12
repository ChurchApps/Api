import { controller, httpPost } from "inversify-express-utils";
import express from "express";
import { GivingBaseController } from "./GivingBaseController";
import { GatewayService } from "../../../shared/helpers/GatewayService";
import { EncryptionHelper, EmailHelper, CurrencyHelper } from "@churchapps/apihelper";
import { Donation, FundDonation, DonationBatch, Subscription, SubscriptionFund } from "../models";
import { Environment } from "../../../shared/helpers/Environment";
import Axios from "axios";
import dayjs from "dayjs";
import { PayPalHelper } from "../../../shared/helpers/PayPalHelper";

@controller("/giving/donate")
export class DonateController extends GivingBaseController {
  @httpPost("/paypal/client-token")
  public async paypalClientToken(req: express.Request<{}, {}, { churchId?: string }>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      try {
        const churchId = req.body.churchId || au.churchId;
        if (!churchId) return this.json({ error: "Missing churchId" }, 400);
        if (au.churchId && au.churchId !== churchId) return this.json({ error: "Forbidden" }, 403);

        const gateways = (await this.repositories.gateway.loadAll(churchId)) as any[];
        if (!gateways.length) return this.json({ error: "No gateway configured" }, 401);
        const gateway = gateways[0];
        const clientId = gateway.publicKey;
        const clientSecret = EncryptionHelper.decrypt(gateway.privateKey);

        try {
          const clientToken = await PayPalHelper.generateClientToken(clientId, clientSecret);
          return { clientToken };
        } catch (e) {
          console.error("PayPal client token error", e);
          return this.json({ error: "Failed to generate client token" }, 502);
        }
      } catch (e) {
        console.error(e);
        return this.json({ error: "Unexpected error" }, 500);
      }
    });
  }

  @httpPost("/paypal/create-order")
  public async paypalCreateOrder(
    req: express.Request<{}, {}, { churchId?: string; amount?: number; currency?: string; funds?: any[]; notes?: string; description?: string }>,
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

        const gateways = (await this.repositories.gateway.loadAll(churchId)) as any[];
        if (!gateways.length) return this.json({ error: "No gateway configured" }, 401);
        const gateway = gateways[0];
        const clientId = gateway.publicKey;
        const clientSecret = EncryptionHelper.decrypt(gateway.privateKey);

        const notes = req.body.notes || "";
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
          const order = await PayPalHelper.createOrder(clientId, clientSecret, {
            amount,
            currency,
            description: req.body.description || "Donation",
            customId: customId || undefined
          });
          return { id: order.id, status: order.status };
        } catch (e) {
          console.error("PayPal create order error", e);
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
      const secretKey = await this.loadPrivateKey(req.body.donation.churchId as string);
      const { donation, fundData } = req.body;
      if (secretKey === "") return this.json({}, 401);
      return this.logDonation(donation, [fundData]);
    });
  }

  @httpPost("/webhook/:provider")
  public async webhook(req: express.Request<{ provider: string }, {}, any>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const churchId = req.query.churchId?.toString();
      if (!churchId) return this.json({ error: "Missing churchId parameter" }, 400);

      const gateways = (await this.repositories.gateway.loadAll(churchId)) as any[];
      if (!gateways.length) return this.json({ error: "No gateway configured" }, 401);

      const provider = req.params.provider?.toLowerCase();
      const gateway = gateways[0];

      try {
        const webhookResult = await GatewayService.verifyWebhook(gateway, req.headers, req.body);

        if (!webhookResult.success) {
          console.error(`${provider} webhook verification failed`);
          return this.json({ error: `Invalid ${provider} webhook signature` }, 401);
        }

        if (!webhookResult.shouldProcess) {
          return this.json({}, 200);
        }

        const existingEvent = await this.repositories.eventLog.load(churchId, webhookResult.eventId!);

        if (!existingEvent) {
          await GatewayService.logEvent(gateway, churchId, req.body, webhookResult.eventData, this.repositories);

          if (this.shouldProcessDonation(provider, webhookResult.eventType!)) {
            await GatewayService.logDonation(gateway, churchId, webhookResult.eventData, this.repositories);
          } else if (this.shouldCancelSubscription(provider, webhookResult.eventType!)) {
            await this.repositories.subscription.delete(churchId, webhookResult.eventData.id);
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
      const gateways = (await this.repositories.gateway.loadAll(churchId)) as any[];
      const gateway = gateways[0];

      if (!gateway) return this.json({ error: "No gateway configured" }, 400);

      try {
        const chargeResult = await GatewayService.processCharge(gateway, donationData);

        if (!chargeResult.success) {
          return this.json({ error: "Charge processing failed" }, 400);
        }

        // For PayPal, we need to log the events since it's captured immediately
        if (donationData.provider === "paypal") {
          await GatewayService.logEvent(gateway, churchId, chargeResult.data, chargeResult.data, this.repositories);
          await GatewayService.logDonation(gateway, churchId, chargeResult.data, this.repositories);
        }

        await this.sendEmails(donationData.person.email, donationData?.church, donationData.funds, donationData?.amount, donationData?.interval, donationData?.billing_cycle_anchor, "one-time");

        return chargeResult.data;
      } catch (error) {
        console.error("Charge processing failed:", error);
        return this.json({ error: "Charge processing failed" }, 500);
      }
    });
  }

  @httpPost("/subscribe")
  public async subscribe(req: express.Request<any>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const { id, amount, customerId, type, billing_cycle_anchor, proration_behavior, interval, funds, person, notes, churchId: CHURCH_ID } = req.body;
      const churchId = au.churchId || CHURCH_ID;
      const gateways = (await this.repositories.gateway.loadAll(churchId)) as any[];
      const gateway = gateways[0];

      if (!gateway) return this.json({ error: "No gateway configured" }, 400);

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
          customerId
        };

        await this.repositories.subscription.save(subscription);

        const promises: Promise<SubscriptionFund>[] = [];
        funds.forEach((fund: FundDonation) => {
          const subscriptionFund: SubscriptionFund = {
            churchId,
            subscriptionId: subscription.id,
            fundId: fund.id,
            amount: fund.amount
          };
          promises.push(this.repositories.subscriptionFunds.save(subscriptionFund));
        });

        await Promise.all(promises);
        await this.sendEmails(person.email, req.body?.church, funds, amount, interval, billing_cycle_anchor, "recurring");

        return subscriptionResult.data;
      } catch (error) {
        console.error("Subscription creation failed:", error);
        return this.json({ error: "Subscription creation failed" }, 500);
      }
    });
  }

  @httpPost("/fee")
  public async calculateFee(req: express.Request<{}, {}, { type?: string; provider?: string; amount: number }>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const { type, provider, amount } = req.body;
      const churchId = req.query.churchId?.toString() || "";

      try {
        let calculatedFee = 0;

        if (provider) {
          // Use gateway-specific fee calculation
          const gateways = await this.repositories.gateway.loadAll(churchId);
          const gateway = (gateways as any[]).find((g) => g.provider.toLowerCase() === provider.toLowerCase());

          if (gateway) {
            calculatedFee = await GatewayService.calculateFees(gateway, amount, churchId);
          }
        } else {
          // Legacy type-based calculation for backward compatibility
          if (type === "creditCard") {
            calculatedFee = await this.getCreditCardFees(amount, churchId);
          } else if (type === "ach") {
            calculatedFee = await this.getACHFees(amount, churchId);
          }
        }

        return { calculatedFee };
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
    const batch: DonationBatch = await this.repositories.donationBatch.getOrCreateCurrent(donationData.churchId as string);
    donationData.batchId = batch.id;
    const donation = await this.repositories.donation.save(donationData);
    const promises: Promise<FundDonation>[] = [];
    fundData.forEach((fund: FundDonation) => {
      const fundDonation: FundDonation = {
        churchId: donation.churchId,
        amount: fund.amount,
        donationId: donation.id,
        fundId: fund.id
      };
      promises.push(this.repositories.fundDonation.save(fundDonation));
    });
    return await Promise.all(promises);
  };

  private loadPrivateKey = async (churchId: string) => {
    const gateways = (await this.repositories.gateway.loadAll(churchId)) as any[];
    return (gateways as any[]).length === 0 ? "" : EncryptionHelper.decrypt((gateways as any[])[0].privateKey);
  };

  private getCreditCardFees = async (amount: number, churchId: string) => {
    let customFixedFee: number | null = null;
    let customPercentFee: number | null = null;
    if (churchId) {
      const response = await Axios.get(Environment.membershipApi + "/settings/public/" + churchId);
      const data = response.data;

      if (data?.flatRateCC && data.flatRateCC !== null && data.flatRateCC !== undefined && data.flatRateCC !== "") customFixedFee = +data.flatRateCC;
      if (data?.transFeeCC && data.transFeeCC !== null && data.transFeeCC !== undefined && data.transFeeCC !== "") customPercentFee = +data.transFeeCC / 100;
    }
    const fixedFee = customFixedFee ?? 0.3; // default to $0.30 if not provided
    const fixedPercent = customPercentFee ?? 0.029; // default to 2.9% if not provided

    return Math.round(((amount + fixedFee) / (1 - fixedPercent) - amount) * 100) / 100;
  };

  private getACHFees = async (amount: number, churchId: string) => {
    let customPercentFee: number | null = null;
    let customMaxFee: number | null = null;
    if (churchId) {
      const response = await Axios.get(Environment.membershipApi + "/settings/public/" + churchId);
      const data = response.data;

      if (data?.flatRateACH && data.flatRateACH !== null && data.flatRateACH !== undefined && data.flatRateACH !== "") customPercentFee = +data.flatRateACH / 100;
      if (data?.hardLimitACH && data.hardLimitACH !== null && data.hardLimitACH !== undefined && data.hardLimitACH !== "") customMaxFee = +data.hardLimitACH;
    }

    const fixedPercent = customPercentFee ?? 0.008; // default to 0.8% if not provided
    const fixedMaxFee = customMaxFee ?? 5.0; // default to $5 if not provided

    const fee = Math.round((amount / (1 - fixedPercent) - amount) * 100) / 100;
    return Math.min(fee, fixedMaxFee);
  };

  private getPayPalFees = async (amount: number, churchId: string) => {
    let customFixedFee: number | null = null;
    let customPercentFee: number | null = null;
    if (churchId) {
      const response = await Axios.get(Environment.membershipApi + "/settings/public/" + churchId);
      const data = response.data;
      if (data?.flatRatePayPal != null && data.flatRatePayPal !== "") customFixedFee = +data.flatRatePayPal;
      if (data?.transFeePayPal != null && data.transFeePayPal !== "") customPercentFee = +data.transFeePayPal / 100;
    }
    const fixedFee = customFixedFee ?? 0.3;
    const fixedPercent = customPercentFee ?? 0.029;
    return Math.round(((amount + fixedFee) / (1 - fixedPercent) - amount) * 100) / 100;
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
}
