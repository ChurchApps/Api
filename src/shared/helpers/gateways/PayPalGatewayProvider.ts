import express from "express";
import Axios from "axios";
import { PayPalHelper } from "../PayPalHelper.js";
import { Environment } from "../Environment.js";
import { IGatewayProvider, WebhookResult, ChargeResult, SubscriptionResult, GatewayConfig, ProviderCapabilities, WebhookEventClassification } from "./IGatewayProvider.js";

export class PayPalGatewayProvider implements IGatewayProvider {
  readonly name = "paypal";
  // Captures are money-in-hand at charge time; there is no later settlement webhook flow.
  readonly logsDonationsImmediately = true;
  readonly recreatesMissingCustomers = true;

  readonly capabilities: ProviderCapabilities = {
    supportsOneTimePayments: true,
    supportsSubscriptions: true,
    supportsVault: true,
    supportsACH: false,
    supportsRefunds: false,
    supportsPartialRefunds: false,
    supportsWebhooks: true,
    supportsOrders: true,
    supportedPaymentMethods: ["paypal", "card", "venmo", "pay_later"],
    supportedCurrencies: [
      "usd", "eur", "gbp", "cad", "aud", "jpy", "mxn", "nzd", "sgd"
    ],
    requiresPlansForSubscriptions: true,
    requiresCustomerForSubscription: false,
    supportsInstantCapture: true,
    supportsManualCapture: true,
    supportsSCA: true,
    maxRefundWindow: 180,
    minTransactionAmount: 100, // $1.00
    maxTransactionAmount: 1000000, // $10,000.00
    notes: ["Subscriptions require Billing Plans", "Order APIs power PayPal smart buttons"]
  };

  classifyWebhookEvent(eventType: string): WebhookEventClassification {
    if (eventType === "PAYMENT.CAPTURE.COMPLETED") return { action: "donation", status: "complete" };
    if (eventType === "BILLING.SUBSCRIPTION.CANCELLED") return { action: "cancel-subscription" };
    return { action: "ignore" };
  }

  // The attach flow keys saved methods to the provider-scoped customer, not the request-supplied id.
  async resolveCustomerForAttach(config: GatewayConfig, personId: string | undefined, _requestCustomerId: string | undefined, repos: any): Promise<string | undefined> {
    if (!personId) return undefined;
    const providerCustomer = await repos.customer.loadByPersonAndProvider(config.churchId, personId, this.name);
    return providerCustomer?.id || undefined;
  }

  buildLocalMethodRecord(pm: any, body: any, tokenId: string): { methodType: string; displayName: string; metadata: any } | null {
    const paymentSource = pm?.payment_source || {};
    const card = paymentSource.card as { last4?: string; brand?: string } | undefined;
    const paypalSource = paymentSource.paypal as { email_address?: string } | undefined;
    const methodType = card ? "card" : paypalSource ? "paypal" : typeof pm?.type === "string" ? pm.type : "token";
    const displayName = card
      ? `${(card.brand || "Card").toUpperCase()} •••• ${card.last4 ?? ""}`.trim()
      : paypalSource?.email_address || `PayPal token ${tokenId.substring(0, 6)}...`;
    return {
      methodType,
      displayName,
      metadata: { status: pm?.status, brand: pm?.card_type || body?.cardBrand, last4: pm?.last_4 || body?.cardLast4 || "" }
    };
  }

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
    } catch {
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

  async pauseSubscription(_config: GatewayConfig, _subscriptionId: string): Promise<void> {
    throw new Error("PayPal does not support subscription pausing");
  }

  async resumeSubscription(_config: GatewayConfig, _subscriptionId: string): Promise<void> {
    throw new Error("PayPal does not support subscription resuming");
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

  async createProduct(_config: GatewayConfig, churchId: string): Promise<string> {
    // PayPal doesn't require product creation like Stripe, return a placeholder
    return `paypal-product-${churchId}`;
  }

  async logDonation(config: GatewayConfig, churchId: string, eventData: any, repos: any, _status?: "pending" | "complete"): Promise<any> {
    return await PayPalHelper.logDonation(config.publicKey, config.privateKey, churchId, eventData, repos);
  }

  // PayPal-specific functionality
  async generateClientToken(config: GatewayConfig): Promise<string> {
    return await PayPalHelper.generateClientToken(config.publicKey, config.privateKey);
  }

  async createOrder(config: GatewayConfig, orderData: any): Promise<any> {
    return await PayPalHelper.createOrder(config.publicKey, config.privateKey, orderData);
  }

  // PayPal Vault customer and payment method management
  async createCustomer(config: GatewayConfig, email: string, name: string): Promise<string> {
    const settings = (config.settings ?? {}) as Record<string, unknown>;
    return await PayPalHelper.createVaultCustomer(config.publicKey, config.privateKey, {
      email,
      name,
      returnUrl: typeof settings.returnUrl === "string" ? settings.returnUrl : undefined,
      cancelUrl: typeof settings.cancelUrl === "string" ? settings.cancelUrl : undefined
    });
  }

  async getCustomerSubscriptions(_config: GatewayConfig, _customerId: string): Promise<any> {
    // PayPal doesn't provide a direct API to list subscriptions by customer
    // This would need to be tracked in the database
    return [];
  }

  async getCustomerPaymentMethods(config: GatewayConfig, customer: any): Promise<any> {
    const customerId = typeof customer === "string" ? customer : customer?.id;
    if (!customerId) {
      throw new Error("PayPal customer id is required to list payment methods");
    }
    return await PayPalHelper.listVaultPaymentMethods(config.publicKey, config.privateKey, customerId);
  }

  async listNormalizedPaymentMethods(config: GatewayConfig, customer: any, repos: any): Promise<any[]> {
    const raw = await this.getCustomerPaymentMethods(config, customer);
    if (!Array.isArray(raw)) return [];
    const customerId = typeof customer === "string" ? customer : customer?.id;
    const stored = await repos.gatewayPaymentMethod.loadByCustomer(config.churchId, config.gatewayId, customerId);
    const lookup = new Map(stored.map((record: any) => [record.externalId, record]));
    return raw.map((method: any) => {
      const record: any = lookup.get(method?.id);
      return {
        id: method.id,
        type: "paypal",
        provider: this.name,
        name: record?.displayName || "PayPal",
        email: method.email,
        customerId: record?.customerId || customerId,
        gatewayId: config.gatewayId
      };
    });
  }

  async attachPaymentMethod(config: GatewayConfig, paymentMethodId: string, options: any): Promise<any> {
    const customerId = typeof options?.customer === "string" ? options.customer : options?.customer?.id;
    if (!customerId) {
      throw new Error("PayPal payment method attachment requires a customer identifier");
    }
    return await PayPalHelper.createVaultPaymentMethod(config.publicKey, config.privateKey, {
      customerId,
      token: paymentMethodId
    });
  }

  async detachPaymentMethod(config: GatewayConfig, paymentMethodId: string): Promise<any> {
    await PayPalHelper.deleteVaultPaymentMethod(config.publicKey, config.privateKey, paymentMethodId);
    return { success: true };
  }

  async updateCard(): Promise<any> {
    // PayPal Vault doesn't support direct card updates
    // Users need to add a new payment method and remove the old one
    throw new Error("PayPal does not support direct card updates. Please add a new payment method and remove the old one.");
  }

  async createBankAccount(): Promise<any> {
    throw new Error("PayPal does not support bank account creation through this API");
  }

  async updateBank(): Promise<any> {
    throw new Error("PayPal does not support bank account updates");
  }

  async verifyBank(): Promise<any> {
    throw new Error("PayPal does not support bank account verification through this API");
  }

  async deleteBankAccount(): Promise<any> {
    throw new Error("PayPal does not support bank account deletion through this API");
  }

  // PayPal-specific methods for subscription plans
  async createSubscriptionPlan(config: GatewayConfig, planData: any): Promise<string> {
    // Create product if it doesn't exist
    let productId = config.productId;
    if (!productId) {
      productId = await PayPalHelper.createProduct(config.publicKey, config.privateKey, {
        name: planData.productName || "Church Donation",
        description: planData.productDescription || "Recurring donation to church",
        category: "NONPROFIT"
      });
    }

    // Create subscription plan with the amount
    return await PayPalHelper.createSubscriptionPlan(config.publicKey, config.privateKey, {
      productId,
      name: planData.name || `Donation Plan $${planData.amount}`,
      amount: planData.amount,
      currency: planData.currency || "USD",
      interval: planData.interval || "MONTH",
      intervalCount: planData.intervalCount || 1
    });
  }

  async createSubscriptionWithPlan(config: GatewayConfig, subscriptionData: any): Promise<SubscriptionResult> {
    const paypalSub = await PayPalHelper.createSubscriptionWithVault(config.publicKey, config.privateKey, subscriptionData);

    return {
      success: !!paypalSub,
      subscriptionId: paypalSub?.id || "",
      data: paypalSub
    };
  }
}
