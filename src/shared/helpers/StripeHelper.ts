import Stripe from "stripe";
import express from "express";
import { Donation, DonationBatch, EventLog, FundDonation, PaymentDetails } from "../../modules/giving/models";

export class StripeHelper {
  static donate = async (secretKey: string, payment: PaymentDetails) => {
    const stripe = StripeHelper.getStripeObj(secretKey);
    payment.amount = Math.trunc(Math.round(payment.amount * 100));
    try {
      if (payment?.payment_method) return await stripe.paymentIntents.create(payment);
      if (payment?.source) return await stripe.charges.create(payment);
    } catch (err) {
      return err;
    }
  };

  static createSubscription = async (secretKey: string, donationData: any) => {
    const stripe = StripeHelper.getStripeObj(secretKey);
    const { customer, metadata, productId, interval, amount, payment_method_id, type, billing_cycle_anchor } = donationData;
    const subscriptionData: any = {
      customer,
      metadata,
      items: [
        {
          price_data: {
            currency: "usd",
            product: productId,
            recurring: interval,
            unit_amount: Math.trunc(Math.round(amount * 100))
          }
        }
      ],
      proration_behavior: "none"
    };
    // billing_cycle_anchor: (billing_cycle_anchor && billing_cycle_anchor > new Date().getTime()) ? billing_cycle_anchor / 1000 : "now",
    if (billing_cycle_anchor && billing_cycle_anchor > new Date().getTime()) subscriptionData.billing_cycle_anchor = billing_cycle_anchor / 1000;
    if (type === "card") subscriptionData.default_payment_method = payment_method_id;
    if (type === "bank") subscriptionData.default_source = payment_method_id;
    return await stripe.subscriptions.create(subscriptionData);
  };

  static updateSubscription = async (secretKey: string, sub: any) => {
    const stripe = StripeHelper.getStripeObj(secretKey);
    const paymentMethod: any = {
      default_payment_method: sub.default_payment_method || null,
      default_source: sub.default_source || null
    };
    const priceData = {
      items: [
        {
          id: sub.items.data[0].id,
          price_data: {
            product: sub.plan.product,
            unit_amount: Math.trunc(Math.round(sub.plan.amount)),
            currency: "usd",
            recurring: {
              interval: sub.plan.interval,
              interval_count: sub.plan.interval_count
            }
          }
        }
      ]
    };
    return await stripe.subscriptions.update(sub.id, { ...paymentMethod, ...priceData });
  };

  static deleteSubscription = async (secretKey: string, subscriptionId: string) => {
    const stripe = StripeHelper.getStripeObj(secretKey);
    return await stripe.subscriptions.cancel(subscriptionId);
  };

  static getCustomerSubscriptions = async (secretKey: string, customerId: string) => {
    const stripe = StripeHelper.getStripeObj(secretKey);
    return await stripe.subscriptions.list({ customer: customerId });
  };

  static getCharge = async (secretKey: string, chargeId: string) => {
    const stripe = StripeHelper.getStripeObj(secretKey);
    return await stripe.charges.retrieve(chargeId);
  };

  static createProduct = async (secretKey: string, churchId: string) => {
    const stripe = StripeHelper.getStripeObj(secretKey);
    const product = await stripe.products.create({ name: "Donation", metadata: { churchId } });
    return product.id;
  };

  static createCustomer = async (secretKey: string, email: string, name: string) => {
    const stripe = StripeHelper.getStripeObj(secretKey);
    const customer = await stripe.customers.create({ email, name });
    return customer.id;
  };

  static async addCard(secretKey: string, customerId: string, paymentMethod: any) {
    const stripe = StripeHelper.getStripeObj(secretKey);
    // If paymentMethod is a string (token/payment method ID), attach it
    if (typeof paymentMethod === "string") {
      return await stripe.paymentMethods.attach(paymentMethod, { customer: customerId });
    }
    // Legacy support for source objects (will be deprecated)
    return await stripe.customers.createSource(customerId, paymentMethod);
  }

  static async createSetupIntent(secretKey: string, customerId?: string) {
    const stripe = StripeHelper.getStripeObj(secretKey);
    const params: any = {
      usage: "on_session",
      automatic_payment_methods: {
        enabled: true
      }
    };
    if (customerId) params.customer = customerId;
    return await stripe.setupIntents.create(params);
  }

  static async createPaymentMethod(secretKey: string, paymentMethodData: any) {
    const stripe = StripeHelper.getStripeObj(secretKey);
    return await stripe.paymentMethods.create(paymentMethodData);
  }

  static async confirmSetupIntent(secretKey: string, setupIntentId: string, paymentMethodId: string) {
    const stripe = StripeHelper.getStripeObj(secretKey);
    return await stripe.setupIntents.confirm(setupIntentId, {
      payment_method: paymentMethodId
    });
  }

  static async updateCard(secretKey: string, paymentMethodId: string, card: any) {
    const stripe = StripeHelper.getStripeObj(secretKey);
    return await stripe.paymentMethods.update(paymentMethodId, card);
  }

  static async attachPaymentMethod(secretKey: string, paymentMethodId: string, customer: any) {
    const stripe = StripeHelper.getStripeObj(secretKey);
    return await stripe.paymentMethods.attach(paymentMethodId, customer);
  }

  static async createBankAccount(secretKey: string, customerId: string, source: any) {
    const stripe = StripeHelper.getStripeObj(secretKey);
    return await stripe.customers.createSource(customerId, source);
  }

  static async updateBank(secretKey: string, paymentMethodId: string, bankData: any, customerId: string) {
    const stripe = StripeHelper.getStripeObj(secretKey);
    return await stripe.customers.updateSource(customerId, paymentMethodId, bankData);
  }

  static async verifyBank(secretKey: string, paymentMethodId: string, amountData: any, customerId: string) {
    const stripe = StripeHelper.getStripeObj(secretKey);
    return await stripe.customers.verifySource(customerId, paymentMethodId, amountData);
  }

  static async getCustomerPaymentMethods(secretKey: string, customer: any) {
    const stripe = StripeHelper.getStripeObj(secretKey);
    const paymentMethods = await stripe.paymentMethods.list({ customer: customer.id, type: "card" });
    const bankAccounts = await stripe.customers.listSources(customer.id, { object: "bank_account" });
    return [{ cards: paymentMethods, banks: bankAccounts, customer }];
  }

  static async detachPaymentMethod(secretKey: string, paymentMethodId: string) {
    const stripe = StripeHelper.getStripeObj(secretKey);
    return await stripe.paymentMethods.detach(paymentMethodId);
  }

  static async deleteBankAccount(secretKey: string, customerId: string, paymentMethodId: string) {
    const stripe = StripeHelper.getStripeObj(secretKey);
    return await stripe.customers.deleteSource(customerId, paymentMethodId);
  }

  static async viewWebhooks(secretKey: string) {
    const stripe = StripeHelper.getStripeObj(secretKey);
    return await stripe.webhookEndpoints.list({ limit: 1 });
  }

  static async createWebhookEndpoint(secretKey: string, webhookUrl: string) {
    const stripe = StripeHelper.getStripeObj(secretKey);
    return await stripe.webhookEndpoints.create({
      url: webhookUrl,
      enabled_events: ["invoice.paid", "charge.succeeded", "charge.failed"]
    });
  }

  static async deleteWebhooksByChurchId(secretKey: string, churchId: string) {
    if (churchId.length === 11) {
      const stripe = StripeHelper.getStripeObj(secretKey);
      const hooks = await stripe.webhookEndpoints.list();
      for (const h of hooks.data) {
        if (h.url.indexOf(churchId) > -1) await stripe.webhookEndpoints.del(h.id);
      }
    }
  }

  static async verifySignature(secretKey: string, request: express.Request, sig: string, endpointSecret: string) {
    const stripe = StripeHelper.getStripeObj(secretKey);
    return await stripe.webhooks.constructEvent(request.body, sig, endpointSecret);
  }

  static async getPaymentDetails(secretKey: string, eventData: any) {
    const { payment_method_details } = eventData.payment_method_details ? eventData : await this.getCharge(secretKey, eventData.charge);
    const methodTypes: any = { ach_debit: "ACH Debit", card: "Card" };
    const paymentType = payment_method_details.type;
    return { method: methodTypes[paymentType], methodDetails: payment_method_details[paymentType].last4 };
  }

  // Note: These methods use dependency injection with repository parameters

  static async logEvent(churchId: string, stripeEvent: any, eventData: any, givingRepos: any) {
    const { billing_reason, status, failure_message, outcome, created, customer } = eventData;
    let message = billing_reason + " " + status;
    if (!billing_reason) message = failure_message ? failure_message + " " + outcome.seller_message : outcome.seller_message;
    const eventLog: EventLog = {
      id: "", // Let the repository create() method generate the ID
      churchId,
      customerId: customer,
      provider: "Stripe",
      providerId: stripeEvent.id, // Store the Stripe event ID here
      eventType: stripeEvent.type,
      status,
      message,
      created: new Date(created * 1000)
    };
    return givingRepos.eventLog.save(eventLog);
  }

  static async logDonation(secretKey: string, churchId: string, eventData: any, givingRepos: any) {
    const amount = (eventData.amount || eventData.amount_paid) / 100;
    const customerData = (await givingRepos.customer.load(churchId, eventData.customer)) as any;
    const personId = customerData?.personId;
    const { method, methodDetails } = await this.getPaymentDetails(secretKey, eventData);
    const batch: DonationBatch = await givingRepos.donationBatch.getOrCreateCurrent(churchId);
    const donationData: Donation = {
      batchId: batch.id,
      amount,
      churchId,
      personId,
      method,
      methodDetails,
      donationDate: new Date(eventData.created * 1000),
      notes: eventData?.metadata?.notes
    };
    const funds = eventData.metadata.funds ? JSON.parse(eventData.metadata.funds) : await givingRepos.subscriptionFund.loadForSubscriptionLog(churchId, eventData.subscription);
    const donation: Donation = await givingRepos.donation.save(donationData);
    const promises: Promise<FundDonation>[] = [];
    funds.forEach((fund: FundDonation) => {
      const fundDonation: FundDonation = { churchId, amount: fund.amount, donationId: donation.id, fundId: fund.id };
      promises.push(givingRepos.fundDonation.save(fundDonation));
    });
    return await Promise.all(promises);
  }

  static async listEvents(secretKey: string, options: {
    startDate: number;
    endDate: number;
    types: string[];
  }): Promise<Stripe.Event[]> {
    const stripe = StripeHelper.getStripeObj(secretKey);
    const allEvents: Stripe.Event[] = [];
    let hasMore = true;
    let startingAfter: string | undefined;

    while (hasMore) {
      const params: Stripe.EventListParams = {
        created: {
          gte: options.startDate,
          lte: options.endDate
        },
        types: options.types,
        limit: 100
      };
      if (startingAfter) params.starting_after = startingAfter;

      const response = await stripe.events.list(params);
      allEvents.push(...response.data);
      hasMore = response.has_more;
      if (response.data.length > 0) {
        startingAfter = response.data[response.data.length - 1].id;
      }
    }

    return allEvents;
  }

  private static getStripeObj = (secretKey: string) => {
    return new Stripe(secretKey, { apiVersion: "2025-02-24.acacia" });
  };
}
