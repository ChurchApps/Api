import express from "express";
import Axios from "axios";
import { EPayMintsHelper } from "../EPayMintsHelper";
import { Environment } from "../Environment";
import { IGatewayProvider, WebhookResult, ChargeResult, SubscriptionResult, GatewayConfig } from "./IGatewayProvider";

export class EPayMintsGatewayProvider implements IGatewayProvider {
  readonly name = "epaymints";

  async createWebhookEndpoint(config: GatewayConfig, _webhookUrl: string): Promise<{ id: string }> {
    // TODO: Implement ePayMints webhook creation if supported
    // ePayMints may not support webhooks, requiring polling instead
    return { id: `epm_webhook_${Date.now()}` };
  }

  async deleteWebhooksByChurchId(config: GatewayConfig, _churchId: string): Promise<void> {
    // TODO: Implement ePayMints webhook deletion if supported
    // May be a no-op if webhooks aren't supported
  }

  async verifyWebhookSignature(config: GatewayConfig, headers: express.Request["headers"], body: any): Promise<WebhookResult> {
    try {
      // ePayMints may not support webhooks; this is a placeholder
      const signature = headers["x-epaymints-signature"] as string;
      const isValid = EPayMintsHelper.validateWebhookSignature(
        JSON.stringify(body),
        signature || "",
        config.webhookKey
      );

      if (!isValid) {
        return { success: false, shouldProcess: false };
      }

      return {
        success: true,
        shouldProcess: true,
        eventType: body.event_type || "transaction",
        eventData: body.data || body,
        eventId: body.transaction_id || body.id
      };
    } catch (_error) {
      return { success: false, shouldProcess: false };
    }
  }

  async processCharge(config: GatewayConfig, donationData: any): Promise<ChargeResult> {
    try {
      const settings = this.parseSettings(config);
      const environment = this.resolveEnvironment(config, settings);
      const terminalId = this.requireTerminalId(settings, config.gatewayId);
      let payment: any;

      if (donationData.paymentMethod === "ach" || donationData.achData) {
        // Process ACH payment
        payment = await EPayMintsHelper.createACHPayment(
          config.privateKey, // API key
          environment,
          {
            amount: donationData.amount,
            terminalId,
            routingNumber: donationData.achData?.routingNumber,
            accountNumber: donationData.achData?.accountNumber,
            accountType: donationData.achData?.accountType || "checking",
            customerId: donationData.customerId,
            description: donationData.description || "Donation"
          }
        );
      } else {
        // Process card payment
        payment = await EPayMintsHelper.createPayment(
          config.privateKey,
          environment,
          {
            amount: donationData.amount,
            currency: donationData.currency || "USD",
            terminalId,
            customerId: donationData.customerId,
            paymentMethod: "card",
            cardData: donationData.cardData,
            description: donationData.description || "Donation"
          }
        );
      }

      return {
        success: !!payment,
        transactionId: payment?.id || "",
        data: payment
      };
    } catch (error) {
      console.error("ePayMints charge processing failed:", error);
      return {
        success: false,
        transactionId: "",
        data: { error: error.message }
      };
    }
  }

  async createSubscription(config: GatewayConfig, _subscriptionData: any): Promise<SubscriptionResult> {
    // ePayMints typically doesn't support native subscriptions
    // This would need to be handled via scheduled payments or external logic
    throw new Error("ePayMints does not support native subscription creation. Use scheduled payments instead.");
  }

  async updateSubscription(config: GatewayConfig, _subscriptionData: any): Promise<SubscriptionResult> {
    throw new Error("ePayMints does not support subscription updates");
  }

  async cancelSubscription(config: GatewayConfig, _subscriptionId: string, _reason?: string): Promise<void> {
    throw new Error("ePayMints does not support subscription cancellation");
  }

  async calculateFees(amount: number, churchId: string): Promise<number> {
    let customFixedFee: number | null = null;
    let customPercentFee: number | null = null;
    let paymentMethod: "card" | "ach" = "card"; // Default to card

    if (churchId) {
      try {
        const response = await Axios.get(Environment.membershipApi + "/settings/public/" + churchId);
        const data = response.data;
        if (data?.flatRateEPayMints != null && data.flatRateEPayMints !== "") {
          customFixedFee = +data.flatRateEPayMints;
        }
        if (data?.transFeeEPayMints != null && data.transFeeEPayMints !== "") {
          customPercentFee = +data.transFeeEPayMints / 100;
        }
        // Check if this is for ACH processing
        if (data?.preferredMethodEPayMints === "ach") {
          paymentMethod = "ach";
        }
      } catch (_error) {
        // Use default fees if settings fetch fails
      }
    }

    return EPayMintsHelper.calculateFees(amount, paymentMethod, customFixedFee, customPercentFee);
  }

  async logEvent(churchId: string, event: any, eventData: any, repos: any): Promise<void> {
    await EPayMintsHelper.logEvent(churchId, event, eventData, repos);
  }

  async createProduct(config: GatewayConfig, churchId: string): Promise<string> {
    // ePayMints doesn't use product concepts like Stripe
    return `epaymints-terminal-${churchId}`;
  }

  async logDonation(config: GatewayConfig, churchId: string, eventData: any, repos: any): Promise<any> {
    const settings = this.parseSettings(config);
    this.requireTerminalId(settings, config.gatewayId);
    const environment = this.resolveEnvironment(config, settings);
    return await EPayMintsHelper.logDonation(
      config.privateKey,
      environment,
      churchId,
      eventData,
      repos
    );
  }

  // Customer management (limited support)
  async createCustomer(config: GatewayConfig, customerData: any): Promise<string> {
    const settings = this.parseSettings(config);
    const environment = this.resolveEnvironment(config, settings);
    const terminalId = this.requireTerminalId(settings, config.gatewayId);
    return await EPayMintsHelper.createCustomer(
      config.privateKey,
      environment,
      {
        email: customerData.email,
        name: customerData.name,
        phone: customerData.phone,
        terminalId
      }
    );
  }

  async getCustomerSubscriptions(config: GatewayConfig, _customerId: string): Promise<any> {
    // ePayMints doesn't support native subscriptions
    return [];
  }

  async getCustomerPaymentMethods(config: GatewayConfig, _customerId: string): Promise<any> {
    // ePayMints doesn't support stored payment methods/vault
    return [];
  }

  // Payment method management (not supported)
  async attachPaymentMethod(): Promise<any> {
    throw new Error("ePayMints does not support payment method storage/vault");
  }

  async detachPaymentMethod(): Promise<any> {
    throw new Error("ePayMints does not support payment method storage/vault");
  }

  async updateCard(): Promise<any> {
    throw new Error("ePayMints does not support stored payment methods");
  }

  async createBankAccount(config: GatewayConfig, customerId: string, options: any): Promise<any> {
    // ePayMints supports ACH but not as stored payment methods
    // ACH details are passed per transaction
    const settings = this.parseSettings(config);
    return {
      id: `epm_ach_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      customerId,
      terminalId: settings.terminalId,
      type: "ach",
      // ACH details would be validated but not stored
      routing: options.routingNumber?.slice(-4) || "****",
      account: options.accountNumber?.slice(-4) || "****"
    };
  }

  async updateBank(): Promise<any> {
    throw new Error("ePayMints does not support bank account updates - ACH details are per-transaction");
  }

  async verifyBank(): Promise<any> {
    throw new Error("ePayMints bank account verification handled per-transaction");
  }

  async deleteBankAccount(): Promise<any> {
    throw new Error("ePayMints does not store bank accounts for deletion");
  }

  // ePayMints-specific functionality
  async generateClientToken(config: GatewayConfig): Promise<string> {
    // ePayMints may use terminal IDs or API keys for client-side integration
    const settings = this.parseSettings(config);
    const terminalId = (settings.terminalId as string | undefined) ?? "";
    return terminalId || config.publicKey;
  }

  async createOrder(): Promise<any> {
    throw new Error("ePayMints uses direct payment processing, not order-based flow");
  }

  // Subscription plan management (not supported)
  async createSubscriptionPlan(): Promise<string> {
    throw new Error("ePayMints does not support subscription plans");
  }

  async createSubscriptionWithPlan(): Promise<SubscriptionResult> {
    throw new Error("ePayMints does not support subscription creation");
  }

  // Transaction status checking
  async getTransactionStatus(config: GatewayConfig, transactionId: string): Promise<any> {
    const settings = this.parseSettings(config);
    const environment = this.resolveEnvironment(config, settings);
    const terminalId = this.requireTerminalId(settings, config.gatewayId);
    return await EPayMintsHelper.getTransactionStatus(
      config.privateKey,
      environment,
      terminalId,
      transactionId
    );
  }

  // Refund processing
  async createRefund(config: GatewayConfig, refundData: any): Promise<any> {
    const settings = this.parseSettings(config);
    const environment = this.resolveEnvironment(config, settings);
    const terminalId = this.requireTerminalId(settings, config.gatewayId);
    return await EPayMintsHelper.createRefund(
      config.privateKey,
      environment,
      {
        terminalId,
        transactionId: refundData.transactionId,
        amount: refundData.amount,
        reason: refundData.reason
      }
    );
  }

  private parseSettings(config: GatewayConfig): Record<string, unknown> {
    if (config.settings && typeof config.settings === "object") {
      return config.settings as Record<string, unknown>;
    }

    if (typeof config.productId === "string") {
      try {
        const parsed = JSON.parse(config.productId);
        if (parsed && typeof parsed === "object") {
          console.warn(
            "ePayMints gateway configuration found in productId. Please migrate values into settings.",
            { gatewayId: config.gatewayId }
          );
          return parsed;
        }
      } catch {
        // productId carries actual ePayMints product identifier – ignore
      }
    }

    return {};
  }

  private resolveEnvironment(config: GatewayConfig, settings: Record<string, unknown>): "production" | "sandbox" {
    const settingEnv = (settings.environment as string | undefined)?.toLowerCase();
    const gatewayEnv = config.environment?.toLowerCase();
    const environment = settingEnv || gatewayEnv;
    return environment === "production" || environment === "live" ? "production" : "sandbox";
  }

  private requireTerminalId(settings: Record<string, unknown>, gatewayId: string): string {
    const terminalId = settings.terminalId as string | undefined;
    if (!terminalId) {
      throw new Error(`ePayMints gateway ${gatewayId} is missing settings.terminalId`);
    }
    return terminalId;
  }
}
