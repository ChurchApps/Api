import express from "express";
import Axios from "axios";
import { PayPalHelper } from "../PayPalHelper";
import { Environment } from "../Environment";
import { IGatewayProvider, WebhookResult, ChargeResult, SubscriptionResult, GatewayConfig } from "./IGatewayProvider";

export class PayPalGatewayProvider implements IGatewayProvider {
  readonly name = "paypal";

  async createWebhookEndpoint(config: GatewayConfig, webhookUrl: string): Promise<{ id: string }> {
    const webhook = await PayPalHelper.createWebhookEndpoint(config.publicKey, config.privateKey, webhookUrl);
    return { id: webhook.id };
  }

  async deleteWebhooksByChurchId(config: GatewayConfig, churchId: string): Promise<void> {
    await PayPalHelper.deleteWebhooksByChurchId(config.publicKey, config.privateKey, churchId);
  }

  async verifyWebhookSignature(config: GatewayConfig, headers: express.Request["headers"], body: any): Promise<WebhookResult> {
    try {
      await PayPalHelper.verifySignature(config.publicKey, config.privateKey, config.webhookKey, headers, body);

      return {
        success: true,
        shouldProcess: true,
        eventType: body.event_type,
        eventData: body.resource,
        eventId: body.id
      };
    } catch (_error) {
      return { success: false, shouldProcess: false };
    }
  }

  async processCharge(config: GatewayConfig, donationData: any): Promise<ChargeResult> {
    const capture = await PayPalHelper.captureOrder(config.publicKey, config.privateKey, donationData.id);
    const eventData = capture.purchase_units?.[0]?.payments?.captures?.[0] || capture;

    return {
      success: !!eventData,
      transactionId: eventData?.id || "",
      data: eventData
    };
  }

  async createSubscription(config: GatewayConfig, subscriptionData: any): Promise<SubscriptionResult> {
    const payPalSub = await PayPalHelper.getSubscriptionDetails(config.publicKey, config.privateKey, subscriptionData.id);

    return {
      success: !!payPalSub,
      subscriptionId: payPalSub?.id || "",
      data: payPalSub
    };
  }

  async updateSubscription(config: GatewayConfig, subscriptionData: any): Promise<SubscriptionResult> {
    const payPalSub = await PayPalHelper.updateSubscription(config.publicKey, config.privateKey, subscriptionData);

    return {
      success: !!payPalSub,
      subscriptionId: payPalSub?.id || "",
      data: payPalSub
    };
  }

  async cancelSubscription(config: GatewayConfig, subscriptionId: string, reason?: string): Promise<void> {
    await PayPalHelper.cancelSubscription(config.publicKey, config.privateKey, subscriptionId, reason);
  }

  async calculateFees(amount: number, churchId: string): Promise<number> {
    let customFixedFee: number | null = null;
    let customPercentFee: number | null = null;

    if (churchId) {
      const response = await Axios.get(Environment.membershipApi + "/settings/public/" + churchId);
      const data = response.data;
      if (data?.flatRatePayPal != null && data.flatRatePayPal !== "") {
        customFixedFee = +data.flatRatePayPal;
      }
      if (data?.transFeePayPal != null && data.transFeePayPal !== "") {
        customPercentFee = +data.transFeePayPal / 100;
      }
    }

    const fixedFee = customFixedFee ?? 0.3;
    const fixedPercent = customPercentFee ?? 0.029;
    return Math.round(((amount + fixedFee) / (1 - fixedPercent) - amount) * 100) / 100;
  }

  async logEvent(churchId: string, event: any, eventData: any, repos: any): Promise<void> {
    await PayPalHelper.logEvent(churchId, event, eventData, repos);
  }

  async createProduct(config: GatewayConfig, churchId: string): Promise<string> {
    // PayPal doesn't require product creation like Stripe, return a placeholder
    return `paypal-product-${churchId}`;
  }

  async logDonation(config: GatewayConfig, churchId: string, eventData: any, repos: any): Promise<any> {
    return await PayPalHelper.logDonation(config.publicKey, config.privateKey, churchId, eventData, repos);
  }

  // PayPal-specific functionality
  async generateClientToken(config: GatewayConfig): Promise<string> {
    return await PayPalHelper.generateClientToken(config.publicKey, config.privateKey);
  }

  async createOrder(config: GatewayConfig, orderData: any): Promise<any> {
    return await PayPalHelper.createOrder(config.publicKey, config.privateKey, orderData);
  }

  // PayPal doesn't have the same customer/payment method management as Stripe
  // These methods throw errors to indicate they're not supported
  async createCustomer(): Promise<string> {
    throw new Error("PayPal does not support customer creation");
  }

  async getCustomerSubscriptions(): Promise<any> {
    throw new Error("PayPal does not support customer subscription listing");
  }

  async getCustomerPaymentMethods(): Promise<any> {
    throw new Error("PayPal does not support payment method listing");
  }

  async attachPaymentMethod(): Promise<any> {
    throw new Error("PayPal does not support payment method attachment");
  }

  async detachPaymentMethod(): Promise<any> {
    throw new Error("PayPal does not support payment method detachment");
  }

  async updateCard(): Promise<any> {
    throw new Error("PayPal does not support card updates");
  }

  async createBankAccount(): Promise<any> {
    throw new Error("PayPal does not support bank account creation");
  }

  async updateBank(): Promise<any> {
    throw new Error("PayPal does not support bank account updates");
  }

  async verifyBank(): Promise<any> {
    throw new Error("PayPal does not support bank account verification");
  }

  async deleteBankAccount(): Promise<any> {
    throw new Error("PayPal does not support bank account deletion");
  }
}
