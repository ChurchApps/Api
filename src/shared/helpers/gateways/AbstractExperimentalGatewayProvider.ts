import express from "express";
import type Stripe from "stripe";
import type { Customer } from "../../../modules/giving/models/index.js";
import {
  GatewayConfig, IGatewayProvider, WebhookResult, ChargeResult, SubscriptionResult, ProviderCapabilities, GatewayPaymentRequest, GatewaySubscriptionUpdate,
  GatewayObject, GivingRepos, GatewayDonationLogResult, GatewaySubscriptionList, GatewayPaymentMethodList, GatewayAttachOptions, GatewayOrderRequest, GatewayBankAccountOptions
} from "./IGatewayProvider.js";

/**
 * Lightweight stub for feature-flagged providers that are not yet implemented.
 * Each method throws a descriptive error so accidental usage surfaces quickly.
 */
export abstract class AbstractExperimentalGatewayProvider implements IGatewayProvider {
  abstract readonly name: string;
  abstract readonly capabilities: ProviderCapabilities;

  protected notImplemented(method: string): never {
    throw new Error(`[${this.name}] ${method} is not implemented for this provider.`);
  }

  async createWebhookEndpoint(_config: GatewayConfig, _webhookUrl: string): Promise<{ id: string; secret?: string }> {
    this.notImplemented("createWebhookEndpoint");
  }

  async deleteWebhooksByChurchId(_config: GatewayConfig, _churchId: string): Promise<void> {
    this.notImplemented("deleteWebhooksByChurchId");
  }

  async verifyWebhookSignature(
    _config: GatewayConfig,
    _headers: express.Request["headers"],
    _body: unknown
  ): Promise<WebhookResult> {
    this.notImplemented("verifyWebhookSignature");
  }

  async processCharge(_config: GatewayConfig, _donationData: GatewayPaymentRequest): Promise<ChargeResult> {
    this.notImplemented("processCharge");
  }

  async createSubscription(_config: GatewayConfig, _subscriptionData: GatewayPaymentRequest): Promise<SubscriptionResult> {
    this.notImplemented("createSubscription");
  }

  async updateSubscription(_config: GatewayConfig, _subscriptionData: GatewaySubscriptionUpdate): Promise<SubscriptionResult> {
    this.notImplemented("updateSubscription");
  }

  async cancelSubscription(_config: GatewayConfig, _subscriptionId: string, _reason?: string): Promise<void> {
    this.notImplemented("cancelSubscription");
  }

  async pauseSubscription(_config: GatewayConfig, _subscriptionId: string): Promise<void> {
    this.notImplemented("pauseSubscription");
  }

  async resumeSubscription(_config: GatewayConfig, _subscriptionId: string): Promise<void> {
    this.notImplemented("resumeSubscription");
  }

  async calculateFees(_amount: number, _churchId: string): Promise<number> {
    this.notImplemented("calculateFees");
  }

  async logEvent(_churchId: string, _event: unknown, _eventData: GatewayObject, _repos: GivingRepos): Promise<void> {
    this.notImplemented("logEvent");
  }

  async logDonation(_config: GatewayConfig, _churchId: string, _eventData: GatewayObject, _repos: GivingRepos): Promise<GatewayDonationLogResult> {
    this.notImplemented("logDonation");
  }

  async createProduct(_config: GatewayConfig, _churchId: string): Promise<string> {
    this.notImplemented("createProduct");
  }

  async createCustomer(_config: GatewayConfig, _email: string, _name: string): Promise<string> {
    this.notImplemented("createCustomer");
  }

  async getCustomerSubscriptions(_config: GatewayConfig, _customerId: string): Promise<GatewaySubscriptionList> {
    this.notImplemented("getCustomerSubscriptions");
  }

  async getCustomerPaymentMethods(_config: GatewayConfig, _customer: Customer | string): Promise<GatewayPaymentMethodList> {
    this.notImplemented("getCustomerPaymentMethods");
  }

  async attachPaymentMethod(_config: GatewayConfig, _paymentMethodId: string, _options: GatewayAttachOptions): Promise<GatewayObject> {
    this.notImplemented("attachPaymentMethod");
  }

  async detachPaymentMethod(_config: GatewayConfig, _paymentMethodId: string): Promise<GatewayObject> {
    this.notImplemented("detachPaymentMethod");
  }

  async updateCard(_config: GatewayConfig, _paymentMethodId: string, _cardData: Stripe.PaymentMethodUpdateParams): Promise<GatewayObject> {
    this.notImplemented("updateCard");
  }

  async createBankAccount(_config: GatewayConfig, _customerId: string, _options: GatewayBankAccountOptions): Promise<GatewayObject> {
    this.notImplemented("createBankAccount");
  }

  async updateBank(_config: GatewayConfig, _paymentMethodId: string, _bankData: Stripe.CustomerUpdateSourceParams, _customerId: string): Promise<GatewayObject> {
    this.notImplemented("updateBank");
  }

  async verifyBank(_config: GatewayConfig, _paymentMethodId: string, _amountData: Stripe.CustomerVerifySourceParams, _customerId: string): Promise<GatewayObject> {
    this.notImplemented("verifyBank");
  }

  async deleteBankAccount(_config: GatewayConfig, _customerId: string, _bankAccountId: string): Promise<GatewayObject> {
    this.notImplemented("deleteBankAccount");
  }

  async generateClientToken(_config: GatewayConfig): Promise<string> {
    this.notImplemented("generateClientToken");
  }

  async createOrder(_config: GatewayConfig, _orderData: GatewayOrderRequest): Promise<GatewayObject> {
    this.notImplemented("createOrder");
  }
}
