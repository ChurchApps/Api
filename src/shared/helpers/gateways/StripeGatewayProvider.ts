import express from "express";
import Axios from "axios";
import { StripeHelper } from "../StripeHelper";
import { Environment } from "../Environment";
import { IGatewayProvider, WebhookResult, ChargeResult, SubscriptionResult, GatewayConfig } from "./IGatewayProvider";

export class StripeGatewayProvider implements IGatewayProvider {
  readonly name = "stripe";

  async createWebhookEndpoint(config: GatewayConfig, webhookUrl: string): Promise<{ id: string; secret?: string }> {
    const webhook = await StripeHelper.createWebhookEndpoint(config.privateKey, webhookUrl);
    return { id: webhook.id, secret: webhook.secret };
  }

  async deleteWebhooksByChurchId(config: GatewayConfig, churchId: string): Promise<void> {
    await StripeHelper.deleteWebhooksByChurchId(config.privateKey, churchId);
  }

  async verifyWebhookSignature(config: GatewayConfig, headers: express.Request["headers"], body: any): Promise<WebhookResult> {
    try {
      const sig = headers["stripe-signature"]?.toString();
      if (!sig) {
        return { success: false, shouldProcess: false };
      }

      const stripeEvent = await StripeHelper.verifySignature(config.privateKey, { body } as any, sig, config.webhookKey);
      const eventData = stripeEvent.data.object as any;
      const subscriptionEvent = eventData.subscription || eventData.description?.toLowerCase().includes("subscription");

      // Skip processing subscription charge.succeeded events to avoid duplicates
      const shouldProcess = !(stripeEvent.type === "charge.succeeded" && subscriptionEvent);

      return {
        success: true,
        shouldProcess,
        eventType: stripeEvent.type,
        eventData,
        eventId: stripeEvent.id
      };
    } catch (_error) {
      return { success: false, shouldProcess: false };
    }
  }

  async processCharge(config: GatewayConfig, donationData: any): Promise<ChargeResult> {
    const paymentData = {
      amount: donationData.amount,
      currency: "usd",
      customer: donationData.customerId,
      metadata: { funds: JSON.stringify(donationData.funds), notes: donationData.notes }
    };

    if (donationData.type === "card") {
      (paymentData as any).payment_method = donationData.id;
      (paymentData as any).confirm = true;
      (paymentData as any).off_session = true;
    }
    if (donationData.type === "bank") {
      (paymentData as any).source = donationData.id;
    }

    const result = await StripeHelper.donate(config.privateKey, paymentData);
    return {
      success: !!result,
      transactionId: result?.id || "",
      data: result
    };
  }

  async createSubscription(config: GatewayConfig, subscriptionData: any): Promise<SubscriptionResult> {
    const paymentData = {
      payment_method_id: subscriptionData.id,
      amount: subscriptionData.amount,
      currency: "usd",
      customer: subscriptionData.customerId,
      type: subscriptionData.type,
      billing_cycle_anchor: subscriptionData.billing_cycle_anchor,
      proration_behavior: subscriptionData.proration_behavior,
      interval: subscriptionData.interval,
      metadata: { notes: subscriptionData.notes },
      productId: config.productId
    };

    const result = await StripeHelper.createSubscription(config.privateKey, paymentData);
    return {
      success: !!result,
      subscriptionId: result?.id || "",
      data: result
    };
  }

  async updateSubscription(config: GatewayConfig, subscriptionData: any): Promise<SubscriptionResult> {
    const result = await StripeHelper.updateSubscription(config.privateKey, subscriptionData);
    return {
      success: !!result,
      subscriptionId: result?.id || "",
      data: result
    };
  }

  async cancelSubscription(config: GatewayConfig, subscriptionId: string): Promise<void> {
    await StripeHelper.deleteSubscription(config.privateKey, subscriptionId);
  }

  async calculateFees(amount: number, churchId: string): Promise<number> {
    let customFixedFee: number | null = null;
    let customPercentFee: number | null = null;

    if (churchId) {
      const response = await Axios.get(Environment.membershipApi + "/settings/public/" + churchId);
      const data = response.data;
      if (data?.flatRateCC && data.flatRateCC !== null && data.flatRateCC !== undefined && data.flatRateCC !== "") {
        customFixedFee = +data.flatRateCC;
      }
      if (data?.transFeeCC && data.transFeeCC !== null && data.transFeeCC !== undefined && data.transFeeCC !== "") {
        customPercentFee = +data.transFeeCC / 100;
      }
    }

    const fixedFee = customFixedFee ?? 0.3;
    const fixedPercent = customPercentFee ?? 0.029;
    return Math.round(((amount + fixedFee) / (1 - fixedPercent) - amount) * 100) / 100;
  }

  async createProduct(config: GatewayConfig, churchId: string): Promise<string> {
    return await StripeHelper.createProduct(config.privateKey, churchId);
  }

  async logEvent(churchId: string, event: any, eventData: any, repos: any): Promise<void> {
    await StripeHelper.logEvent(churchId, event, eventData, repos);
  }

  async logDonation(config: GatewayConfig, churchId: string, eventData: any, repos: any): Promise<any> {
    return await StripeHelper.logDonation(config.privateKey, churchId, eventData, repos);
  }

  // Customer management
  async createCustomer(config: GatewayConfig, email: string, name: string): Promise<string> {
    return await StripeHelper.createCustomer(config.privateKey, email, name);
  }

  async getCustomerSubscriptions(config: GatewayConfig, customerId: string): Promise<any> {
    return await StripeHelper.getCustomerSubscriptions(config.privateKey, customerId);
  }

  async getCustomerPaymentMethods(config: GatewayConfig, customer: any): Promise<any> {
    return await StripeHelper.getCustomerPaymentMethods(config.privateKey, customer);
  }

  // Payment method management
  async attachPaymentMethod(config: GatewayConfig, paymentMethodId: string, options: any): Promise<any> {
    return await StripeHelper.attachPaymentMethod(config.privateKey, paymentMethodId, options);
  }

  async detachPaymentMethod(config: GatewayConfig, paymentMethodId: string): Promise<any> {
    return await StripeHelper.detachPaymentMethod(config.privateKey, paymentMethodId);
  }

  async updateCard(config: GatewayConfig, paymentMethodId: string, cardData: any): Promise<any> {
    return await StripeHelper.updateCard(config.privateKey, paymentMethodId, cardData);
  }

  async createBankAccount(config: GatewayConfig, customerId: string, options: any): Promise<any> {
    return await StripeHelper.createBankAccount(config.privateKey, customerId, options);
  }

  async updateBank(config: GatewayConfig, paymentMethodId: string, bankData: any, customerId: string): Promise<any> {
    return await StripeHelper.updateBank(config.privateKey, paymentMethodId, bankData, customerId);
  }

  async verifyBank(config: GatewayConfig, paymentMethodId: string, amountData: any, customerId: string): Promise<any> {
    return await StripeHelper.verifyBank(config.privateKey, paymentMethodId, amountData, customerId);
  }

  async deleteBankAccount(config: GatewayConfig, customerId: string, bankAccountId: string): Promise<any> {
    return await StripeHelper.deleteBankAccount(config.privateKey, customerId, bankAccountId);
  }

  async addCard(config: GatewayConfig, customerId: string, cardData: any): Promise<any> {
    return await StripeHelper.addCard(config.privateKey, customerId, cardData);
  }

  async getCharge(config: GatewayConfig, chargeId: string): Promise<any> {
    return await StripeHelper.getCharge(config.privateKey, chargeId);
  }
}
