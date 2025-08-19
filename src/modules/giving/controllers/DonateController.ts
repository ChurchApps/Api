import { controller, httpPost, interfaces } from "inversify-express-utils";
import express from "express";
import Stripe from "stripe";
import { GivingBaseController } from "./GivingBaseController";
import { StripeHelper } from "../../../shared/helpers/StripeHelper";
import { EncryptionHelper, EmailHelper, CurrencyHelper } from "@churchapps/apihelper";
import { Donation, FundDonation, DonationBatch, PaymentDetails, Subscription, SubscriptionFund } from "../models";
import { Environment } from "../../../shared/helpers/Environment";
import Axios from "axios";
import dayjs from "dayjs";

@controller("/giving/donate")
export class DonateController extends GivingBaseController {
  @httpPost("/log")
  public async log(
    req: express.Request<{}, {}, { donation: Donation; fundData: { id: string; amount: number } }>,
    res: express.Response
  ): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const secretKey = await this.loadPrivateKey(req.body.donation.churchId as string);
      const { donation, fundData } = req.body;
      if (secretKey === "") return this.json({}, 401);
      return this.logDonation(donation, [fundData]);
    });
  }

  @httpPost("/webhook/:provider")
  public async webhook(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const churchId = req.query.churchId?.toString();
      if (!churchId) return this.json({ error: "Missing churchId parameter" }, 400);

      const repos = await this.getGivingRepositories();
      const gateways = (await repos.gateway.loadAll(churchId)) as any[];
      if (!gateways.length) return this.json({ error: "No gateway configured" }, 401);

      const secretKey = EncryptionHelper.decrypt((gateways as any[])[0].privateKey);
      if (secretKey === "") return this.json({ error: "Invalid gateway configuration" }, 401);

      const sig = req.headers["stripe-signature"]?.toString();
      if (!sig) return this.json({ error: "Missing stripe signature" }, 400);
      const webhookKey = EncryptionHelper.decrypt((gateways as any[])[0].webhookKey);
      const stripeEvent: Stripe.Event = await StripeHelper.verifySignature(secretKey, req, sig, webhookKey);
      const eventData = stripeEvent.data.object as any; // https://github.com/stripe/stripe-node/issues/758
      const subscriptionEvent = eventData.subscription || eventData.description?.toLowerCase().includes("subscription");
      if (stripeEvent.type === "charge.succeeded" && subscriptionEvent) return this.json({}, 200); // Ignore charge.succeeded from subscription events in place of invoice.paid for access to subscription id
      const existingEvent = await repos.eventLog.load(churchId, stripeEvent.id);
      if (!existingEvent) await StripeHelper.logEvent(churchId, stripeEvent, eventData, repos);
      if (!existingEvent && (stripeEvent.type === "charge.succeeded" || stripeEvent.type === "invoice.paid"))
        await StripeHelper.logDonation(secretKey, churchId, eventData, repos);
      return this.json({}, 200);
    });
  }

  @httpPost("/charge")
  public async charge(req: express.Request<any>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const donationData = req.body;
      const churchId = au.churchId || donationData.churchId;
      const secretKey = await this.loadPrivateKey(churchId);
      if (secretKey === "") return this.json({}, 401);

      const fundDonations: FundDonation[] = donationData.funds;
      const paymentData: PaymentDetails = {
        amount: donationData.amount,
        currency: "usd",
        customer: donationData.customerId,
        metadata: { funds: JSON.stringify(fundDonations), notes: donationData.notes }
      };
      if (donationData.type === "card") {
        paymentData.payment_method = donationData.id;
        paymentData.confirm = true;
        paymentData.off_session = true;
      }
      if (donationData.type === "bank") paymentData.source = donationData.id;
      const stripeDonation = await StripeHelper.donate(secretKey, paymentData);
      await this.sendEmails(
        donationData.person.email,
        donationData?.church,
        donationData.funds,
        donationData?.amount,
        donationData?.interval,
        donationData?.billing_cycle_anchor,
        "one-time"
      );
      return stripeDonation;
    });
  }

  @httpPost("/subscribe")
  public async subscribe(req: express.Request<any>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const {
        id,
        amount,
        customerId,
        type,
        billing_cycle_anchor,
        proration_behavior,
        interval,
        funds,
        person,
        notes,
        churchId: CHURCH_ID
      } = req.body;
      const churchId = au.churchId || CHURCH_ID;
      const secretKey = await this.loadPrivateKey(churchId);
      if (secretKey === "") return this.json({}, 401);

      const paymentData: PaymentDetails = {
        payment_method_id: id,
        amount,
        currency: "usd",
        customer: customerId,
        type,
        billing_cycle_anchor,
        proration_behavior,
        interval,
        metadata: { notes }
      };
      const repos = await this.getGivingRepositories();
      const gateways = (await repos.gateway.loadAll(churchId)) as any[];
      paymentData.productId = (gateways as any[])[0].productId;

      const stripeSubscription = await StripeHelper.createSubscription(secretKey, paymentData);
      const subscription: Subscription = { id: stripeSubscription.id, churchId, personId: person.id, customerId };
      await repos.subscription.save(subscription);

      const promises: Promise<SubscriptionFund>[] = [];
      funds.forEach((fund: FundDonation) => {
        const subscriptionFund: SubscriptionFund = {
          churchId,
          subscriptionId: subscription.id,
          fundId: fund.id,
          amount: fund.amount
        };
        promises.push(repos.subscriptionFund.save(subscriptionFund));
      });
      await Promise.all(promises);
      await this.sendEmails(person.email, req.body?.church, funds, amount, interval, billing_cycle_anchor, "recurring");
      return stripeSubscription;
    });
  }

  @httpPost("/fee")
  public async calculateFee(
    req: express.Request<{}, {}, { type: string; amount: number }>,
    res: express.Response
  ): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const { type, amount } = req.body;
      const { churchId } = req.query;
      if (type === "creditCard")
        return { calculatedFee: await this.getCreditCardFees(amount, churchId?.toString() as string) };
      else if (type === "ach") return { calculatedFee: await this.getACHFees(amount, churchId?.toString() as string) };
      else return { calculatedFee: 0 };
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
        contentRows.push(
          `<tr><td style="font-size: 15px; text-overflow: ellipsis; overflow: hidden;">${fund.name}</td><td style="font-size: 15px">$${fund.amount}</td></tr>`
        );
      }
    });

    const transactionFee = amount! - totalFundAmount;

    const domain =
      Environment.appEnv === "staging" ? `${church.subDomain}.staging.b1.church` : `${church.subDomain}.b1.church`;

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

    await EmailHelper.sendTemplatedEmail(
      Environment.supportEmail,
      to,
      title,
      church.churchURL as string,
      "Thank You For Donating",
      contents,
      "ChurchEmailTemplate.html"
    );
  };

  private logDonation = async (donationData: Donation, fundData: FundDonation[]) => {
    const repos = await this.getGivingRepositories();
    const batch: DonationBatch = await repos.donationBatch.getOrCreateCurrent(donationData.churchId as string);
    donationData.batchId = batch.id;
    const donation = await repos.donation.save(donationData);
    const promises: Promise<FundDonation>[] = [];
    fundData.forEach((fund: FundDonation) => {
      const fundDonation: FundDonation = {
        churchId: donation.churchId,
        amount: fund.amount,
        donationId: donation.id,
        fundId: fund.id
      };
      promises.push(repos.fundDonation.save(fundDonation));
    });
    return await Promise.all(promises);
  };

  private loadPrivateKey = async (churchId: string) => {
    const repos = await this.getGivingRepositories();
    const gateways = (await repos.gateway.loadAll(churchId)) as any[];
    return (gateways as any[]).length === 0 ? "" : EncryptionHelper.decrypt((gateways as any[])[0].privateKey);
  };

  private getCreditCardFees = async (amount: number, churchId: string) => {
    let customFixedFee: number | null = null;
    let customPercentFee: number | null = null;
    if (churchId) {
      const response = await Axios.get(Environment.membershipApi + "/settings/public/" + churchId);
      const data = response.data;

      if (data?.flatRateCC && data.flatRateCC !== null && data.flatRateCC !== undefined && data.flatRateCC !== "")
        customFixedFee = +data.flatRateCC;
      if (data?.transFeeCC && data.transFeeCC !== null && data.transFeeCC !== undefined && data.transFeeCC !== "")
        customPercentFee = +data.transFeeCC / 100;
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

      if (data?.flatRateACH && data.flatRateACH !== null && data.flatRateACH !== undefined && data.flatRateACH !== "")
        customPercentFee = +data.flatRateACH / 100;
      if (
        data?.hardLimitACH &&
        data.hardLimitACH !== null &&
        data.hardLimitACH !== undefined &&
        data.hardLimitACH !== ""
      )
        customMaxFee = +data.hardLimitACH;
    }

    const fixedPercent = customPercentFee ?? 0.008; // default to 0.8% if not provided
    const fixedMaxFee = customMaxFee ?? 5.0; // default to $5 if not provided

    const fee = Math.round((amount / (1 - fixedPercent) - amount) * 100) / 100;
    return Math.min(fee, fixedMaxFee);
  };

  @httpPost("/captcha-verify")
  public async captchaVerify(req: express.Request<{}, {}, { token: string }>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      try {
        // detecting if its a bot or a human
        const { token } = req.body;
        const response = await Axios.post(
          `https://www.google.com/recaptcha/api/siteverify?secret=${Environment.googleRecaptchaSecretKey}&response=${token}`
        );
        const data = response.data;

        if (!data.success) {
          return { response: "robot" };
        }

        // if google's response already includes b1.church in hostname property, no need to check in the DB then
        if (data.hostname.includes("b1.church")) {
          return { response: "human" };
        }

        // if its a custom domain, verify the domain exist in the DB
        const domainData = await Axios.get(
          `${Environment.membershipApi}/domains/public/lookup/${data.hostname.replace(".localhost", "")}`
        );
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
