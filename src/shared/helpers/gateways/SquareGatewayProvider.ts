import express from "express";
import Axios from "axios";
import { SquareHelper } from "../SquareHelper.js";
import { Environment } from "../Environment.js";
import { IGatewayProvider, WebhookResult, ChargeResult, SubscriptionResult, GatewayConfig } from "./IGatewayProvider.js";

export class SquareGatewayProvider implements IGatewayProvider {
  readonly name = "square";

  async createWebhookEndpoint(config: GatewayConfig, _webhookUrl: string): Promise<{ id: string }> {
    // TODO: Implement Square webhook creation when SDK is available
    // Square webhooks are configured through the Square Developer Dashboard
    // or via the Webhooks API
    return { id: `sq_webhook_${Date.now()}` };
  }

  async deleteWebhooksByChurchId(config: GatewayConfig, _churchId: string): Promise<void> {
    // TODO: Implement Square webhook deletion when SDK is available
    // Square webhooks would need to be identified and deleted via API
  }

  async verifyWebhookSignature(config: GatewayConfig, headers: express.Request["headers"], body: any): Promise<WebhookResult> {
    try {
      const signature = headers["x-square-signature"] as string;
      const isValid = await SquareHelper.validateWebhookSignature(
        JSON.stringify(body),
        signature,
        "", // notification URL
        config.webhookKey
      );

      if (!isValid) {
        return { success: false, shouldProcess: false };
      }

      return {
        success: true,
        shouldProcess: true,
        eventType: body.type,
        eventData: body.data?.object || body.data,
        eventId: body.event_id || body.id
      };
    } catch (_error) {
      return { success: false, shouldProcess: false };
    }
  }

  async processCharge(config: GatewayConfig, donationData: any): Promise<ChargeResult> {
    try {
      const settings = this.parseSettings(config);
      const environment = this.resolveEnvironment(config, settings);
      const locationId = settings.locationId as string | undefined;
      if (!locationId) {
        throw new Error("Square gateway configuration is missing settings.locationId");
      }

      const payment = await SquareHelper.createPayment(
        config.privateKey, // access token
        environment,
        {
          amount: donationData.amount,
          currency: donationData.currency || "USD",
          sourceId: donationData.sourceId || donationData.nonce,
          customerId: donationData.customerId,
          locationId,
          idempotencyKey: donationData.idempotencyKey || `${Date.now()}_${Math.random()}`,
          note: donationData.note
        }
      );

      return {
        success: !!payment,
        transactionId: payment?.id || "",
        data: payment
      };
    } catch (error) {
      console.error("Square charge processing failed:", error);
      return {
        success: false,
        transactionId: "",
        data: { error: error.message }
      };
    }
  }

  async createSubscription(config: GatewayConfig, subscriptionData: any): Promise<SubscriptionResult> {
    try {
      const settings = this.parseSettings(config);
      const environment = this.resolveEnvironment(config, settings);
      const locationId = settings.locationId as string | undefined;
      if (!locationId) {
        throw new Error("Square gateway configuration is missing settings.locationId");
      }

      const subscription = await SquareHelper.createSubscription(
        config.privateKey,
        environment,
        {
          customerId: subscriptionData.customerId,
          locationId,
          planId: subscriptionData.planId,
          cardId: subscriptionData.cardId,
          startDate: subscriptionData.startDate
        }
      );

      return {
        success: !!subscription,
        subscriptionId: subscription?.id || "",
        data: subscription
      };
    } catch (error) {
      console.error("Square subscription creation failed:", error);
      return {
        success: false,
        subscriptionId: "",
        data: { error: error.message }
      };
    }
  }

  async updateSubscription(config: GatewayConfig, _subscriptionData: any): Promise<SubscriptionResult> {
    // Square subscriptions are typically updated by canceling and creating new ones
    // TODO: Implement proper update logic when Square SDK is available
    throw new Error("Square subscription updates not yet implemented");
  }

  async cancelSubscription(config: GatewayConfig, subscriptionId: string, _reason?: string): Promise<void> {
    const settings = this.parseSettings(config);
    const environment = this.resolveEnvironment(config, settings);
    await SquareHelper.cancelSubscription(
      config.privateKey,
      environment,
      subscriptionId
    );
  }

  async calculateFees(amount: number, churchId: string): Promise<number> {
    let customFixedFee: number | null = null;
    let customPercentFee: number | null = null;

    if (churchId) {
      try {
        const response = await Axios.get(Environment.membershipApi + "/settings/public/" + churchId);
        const data = response.data;
        if (data?.flatRateSquare != null && data.flatRateSquare !== "") {
          customFixedFee = +data.flatRateSquare;
        }
        if (data?.transFeeSquare != null && data.transFeeSquare !== "") {
          customPercentFee = +data.transFeeSquare / 100;
        }
      } catch (_error) {
        // Use default fees if settings fetch fails
      }
    }

    return SquareHelper.calculateFees(amount, customFixedFee, customPercentFee);
  }

  async logEvent(churchId: string, event: any, eventData: any, repos: any): Promise<void> {
    await SquareHelper.logEvent(churchId, event, eventData, repos);
  }

  async createProduct(config: GatewayConfig, churchId: string): Promise<string> {
    // Square uses catalog items/plans instead of products
    // TODO: Implement catalog item creation when Square SDK is available
    return `square-catalog-${churchId}`;
  }

  async logDonation(config: GatewayConfig, churchId: string, eventData: any, repos: any, _status?: "pending" | "complete"): Promise<any> {
    const settings = this.parseSettings(config);
    const environment = this.resolveEnvironment(config, settings);
    return await SquareHelper.logDonation(
      config.privateKey,
      environment,
      churchId,
      eventData,
      repos
    );
  }

  // Customer management
  async createCustomer(config: GatewayConfig, customerData: any): Promise<string> {
    const settings = this.parseSettings(config);
    const environment = this.resolveEnvironment(config, settings);
    return await SquareHelper.createCustomer(
      config.privateKey,
      environment,
      customerData
    );
  }

  async getCustomerSubscriptions(config: GatewayConfig, _customerId: string): Promise<any> {
    // TODO: Implement when Square SDK is available
    // Square doesn't have a direct API to list subscriptions by customer
    return [];
  }

  async getCustomerPaymentMethods(config: GatewayConfig, customerId: string): Promise<any> {
    const settings = this.parseSettings(config);
    const environment = this.resolveEnvironment(config, settings);
    return await SquareHelper.listCards(
      config.privateKey,
      environment,
      customerId
    );
  }

  // Payment method management
  async attachPaymentMethod(config: GatewayConfig, paymentData: any): Promise<any> {
    const settings = this.parseSettings(config);
    const environment = this.resolveEnvironment(config, settings);
    return await SquareHelper.createCard(
      config.privateKey,
      environment,
      paymentData
    );
  }

  async detachPaymentMethod(config: GatewayConfig, paymentMethodId: string): Promise<any> {
    const settings = this.parseSettings(config);
    const environment = this.resolveEnvironment(config, settings);
    await SquareHelper.deleteCard(
      config.privateKey,
      environment,
      paymentMethodId
    );
    return { success: true };
  }

  async updateCard(): Promise<any> {
    throw new Error("Square does not support direct card updates. Please add a new card and remove the old one.");
  }

  async createBankAccount(): Promise<any> {
    throw new Error("Square bank account creation not implemented in this API");
  }

  async updateBank(): Promise<any> {
    throw new Error("Square does not support bank account updates through this API");
  }

  async verifyBank(): Promise<any> {
    throw new Error("Square bank account verification not implemented in this API");
  }

  async deleteBankAccount(): Promise<any> {
    throw new Error("Square bank account deletion not implemented in this API");
  }

  // Square-specific functionality
  async generateClientToken(config: GatewayConfig): Promise<string> {
    // Square uses application ID for client-side initialization
    return config.publicKey; // Application ID
  }

  async createOrder(): Promise<any> {
    throw new Error("Square uses direct payment creation, not order-based flow");
  }

  // Subscription plan management
  async createSubscriptionPlan(config: GatewayConfig, _planData: any): Promise<string> {
    // TODO: Implement Square catalog plan creation when SDK is available
    // Square subscriptions use catalog objects (items/variations) as plans
    return `sq_plan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async createSubscriptionWithPlan(config: GatewayConfig, subscriptionData: any): Promise<SubscriptionResult> {
    return await this.createSubscription(config, subscriptionData);
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
            "Square gateway configuration found in productId. Consider migrating these values into the settings column.",
            { gatewayId: config.gatewayId }
          );
          return parsed;
        }
      } catch {
        // productId is a true Square catalog identifier, which is fine
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
}
