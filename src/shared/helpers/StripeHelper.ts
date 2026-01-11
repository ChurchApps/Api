import Stripe from "stripe";
import express from "express";
import { Donation, DonationBatch, EventLog, FundDonation, PaymentDetails } from "../../modules/giving/models/index.js";

export class StripeHelper {
  static donate = async (secretKey: string, payment: PaymentDetails) => {
    const stripe = StripeHelper.getStripeObj(secretKey);
    if (payment.currency === "jpy") {
      payment.amount = Math.round(payment.amount * 1);
    } else {
      payment.amount = Math.trunc(Math.round(payment.amount * 100));
    }
    payment.currency = payment?.currency;
    try {
      // Use Payment Intents for all payment types (cards and ACH bank accounts)
      if (payment?.payment_method) return await stripe.paymentIntents.create(payment);
      // Legacy source-based payments (deprecated - will be removed after migration)
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
    // Use default_payment_method for both card and bank account types
    // (default_source is deprecated for ACH)
    if (type === "card" || type === "bank") subscriptionData.default_payment_method = payment_method_id;
    return await stripe.subscriptions.create(subscriptionData);
  };

  static updateSubscription = async (secretKey: string, sub: any) => {
    const stripe = StripeHelper.getStripeObj(secretKey);
    // Use default_payment_method for all payment types (default_source is deprecated)
    const paymentMethod: any = {
      default_payment_method: sub.default_payment_method || null
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

  // Create SetupIntent specifically for ACH bank account with Financial Connections
  static async createACHSetupIntent(secretKey: string, customerId: string) {
    const stripe = StripeHelper.getStripeObj(secretKey);
    return await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ["us_bank_account"],
      payment_method_options: {
        us_bank_account: {
          financial_connections: {
            permissions: ["payment_method"]
          }
        }
      }
    });
  }

  // Retrieve a SetupIntent by ID
  static async getSetupIntent(secretKey: string, setupIntentId: string) {
    const stripe = StripeHelper.getStripeObj(secretKey);
    return await stripe.setupIntents.retrieve(setupIntentId);
  }

  // Retrieve a PaymentIntent by ID (for webhook handling)
  static async getPaymentIntent(secretKey: string, paymentIntentId: string) {
    const stripe = StripeHelper.getStripeObj(secretKey);
    return await stripe.paymentIntents.retrieve(paymentIntentId);
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
    // Get modern PaymentMethods (cards and us_bank_account)
    const cards = await stripe.paymentMethods.list({ customer: customer.id, type: "card" });
    const bankPaymentMethods = await stripe.paymentMethods.list({ customer: customer.id, type: "us_bank_account" });

    // Also check for legacy bank account Sources (for backward compatibility during migration)
    let legacyBanks: Stripe.ApiList<Stripe.CustomerSource> = { data: [], has_more: false, object: "list", url: "" };
    try {
      legacyBanks = await stripe.customers.listSources(customer.id, { object: "bank_account" });
    } catch (e) {
      // Sources API may be deprecated - ignore errors
    }

    return [{
      cards,
      banks: bankPaymentMethods,
      legacyBanks,  // Will be empty after full migration
      customer
    }];
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
      enabled_events: [
        "invoice.paid",
        "payment_intent.succeeded",
        "payment_intent.payment_failed",
        "charge.succeeded",  // Keep for backward compatibility during migration
        "charge.failed"      // Keep for backward compatibility during migration
      ]
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
    let payment_method_details = eventData.payment_method_details;

    // Handle PaymentIntent events (payment_intent.succeeded)
    if (!payment_method_details && eventData.latest_charge) {
      const charge = await this.getCharge(secretKey, eventData.latest_charge);
      payment_method_details = charge.payment_method_details;
    }
    // Handle legacy Charge events (charge.succeeded)
    else if (!payment_method_details && eventData.charge) {
      const charge = await this.getCharge(secretKey, eventData.charge);
      payment_method_details = charge.payment_method_details;
    }

    const methodTypes: any = { ach_debit: "ACH Debit", us_bank_account: "ACH Debit", card: "Card" };
    const paymentType = payment_method_details?.type || "card";
    const details = payment_method_details?.[paymentType];
    return { method: methodTypes[paymentType] || "Card", methodDetails: details?.last4 || "" };
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
    // Handle both Charge events (amount) and PaymentIntent events (amount)
    // PaymentIntent amounts are in cents, same as Charge events
    const amount = (eventData.amount || eventData.amount_paid || eventData.amount_received) / 100;
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

    // Get funds from metadata, subscription, or fallback to general fund
    // PaymentIntent metadata is in eventData.metadata, same as Charge
    let funds: FundDonation[] = [];
    if (eventData.metadata?.funds) {
      funds = JSON.parse(eventData.metadata.funds);
    } else if (eventData.subscription && givingRepos.subscriptionFunds) {
      funds = await givingRepos.subscriptionFunds.loadForSubscriptionLog(churchId, eventData.subscription);
    }

    // If no funds found, allocate entire amount to general fund
    if (!funds || funds.length === 0) {
      const generalFund = await givingRepos.fund.getOrCreateGeneral(churchId);
      funds = [{ id: generalFund.id, amount }];
    }

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
