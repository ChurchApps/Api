import express from "express";
import { GatewayConfig, IGatewayProvider, WebhookResult, ChargeResult, SubscriptionResult } from "./IGatewayProvider";

/**
 * Lightweight stub for feature-flagged providers that are not yet implemented.
 * Each method throws a descriptive error so accidental usage surfaces quickly.
 */
export abstract class AbstractExperimentalGatewayProvider implements IGatewayProvider {
  abstract readonly name: string;

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
    _body: any
  ): Promise<WebhookResult> {
    this.notImplemented("verifyWebhookSignature");
  }

  async processCharge(_config: GatewayConfig, _donationData: any): Promise<ChargeResult> {
    this.notImplemented("processCharge");
  }

  async createSubscription(_config: GatewayConfig, _subscriptionData: any): Promise<SubscriptionResult> {
    this.notImplemented("createSubscription");
  }

  async updateSubscription(_config: GatewayConfig, _subscriptionData: any): Promise<SubscriptionResult> {
    this.notImplemented("updateSubscription");
  }

  async cancelSubscription(_config: GatewayConfig, _subscriptionId: string, _reason?: string): Promise<void> {
    this.notImplemented("cancelSubscription");
  }

  async calculateFees(_amount: number, _churchId: string): Promise<number> {
    this.notImplemented("calculateFees");
  }

  async logEvent(_churchId: string, _event: any, _eventData: any, _repos: any): Promise<void> {
    this.notImplemented("logEvent");
  }

  async logDonation(_config: GatewayConfig, _churchId: string, _eventData: any, _repos: any): Promise<any> {
    this.notImplemented("logDonation");
  }

  async createProduct(_config: GatewayConfig, _churchId: string): Promise<string> {
    this.notImplemented("createProduct");
  }

  async createCustomer(_config: GatewayConfig, _email: string, _name: string): Promise<string> {
    this.notImplemented("createCustomer");
  }

  async getCustomerSubscriptions(_config: GatewayConfig, _customerId: string): Promise<any> {
    this.notImplemented("getCustomerSubscriptions");
  }

  async getCustomerPaymentMethods(_config: GatewayConfig, _customer: any): Promise<any> {
    this.notImplemented("getCustomerPaymentMethods");
  }

  async attachPaymentMethod(_config: GatewayConfig, _paymentMethodId: string, _options: any): Promise<any> {
    this.notImplemented("attachPaymentMethod");
  }

  async detachPaymentMethod(_config: GatewayConfig, _paymentMethodId: string): Promise<any> {
    this.notImplemented("detachPaymentMethod");
  }

  async updateCard(_config: GatewayConfig, _paymentMethodId: string, _cardData: any): Promise<any> {
    this.notImplemented("updateCard");
  }

  async createBankAccount(_config: GatewayConfig, _customerId: string, _options: any): Promise<any> {
    this.notImplemented("createBankAccount");
  }

  async updateBank(_config: GatewayConfig, _paymentMethodId: string, _bankData: any, _customerId: string): Promise<any> {
    this.notImplemented("updateBank");
  }

  async verifyBank(_config: GatewayConfig, _paymentMethodId: string, _amountData: any, _customerId: string): Promise<any> {
    this.notImplemented("verifyBank");
  }

  async deleteBankAccount(_config: GatewayConfig, _customerId: string, _bankAccountId: string): Promise<any> {
    this.notImplemented("deleteBankAccount");
  }

  async generateClientToken(_config: GatewayConfig): Promise<string> {
    this.notImplemented("generateClientToken");
  }

  async createOrder(_config: GatewayConfig, _orderData: any): Promise<any> {
    this.notImplemented("createOrder");
  }
}
