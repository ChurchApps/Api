import express from "express";

export interface WebhookResult {
  success: boolean;
  shouldProcess: boolean;
  eventType?: string;
  eventData?: any;
  eventId?: string;
}

export interface ChargeResult {
  success: boolean;
  transactionId: string;
  data: any;
}

export interface SubscriptionResult {
  success: boolean;
  subscriptionId: string;
  data: any;
}

export interface GatewayConfig {
  gatewayId: string;
  churchId: string;
  publicKey: string;
  privateKey: string;
  webhookKey: string;
  productId?: string;
  settings?: Record<string, unknown> | null;
  environment?: string | null;
}

export interface IGatewayProvider {
  readonly name: string;

  // Webhook management
  createWebhookEndpoint(config: GatewayConfig, webhookUrl: string): Promise<{ id: string; secret?: string }>;
  deleteWebhooksByChurchId(config: GatewayConfig, churchId: string): Promise<void>;
  verifyWebhookSignature(config: GatewayConfig, headers: express.Request["headers"], body: any): Promise<WebhookResult>;

  // Payment processing
  processCharge(config: GatewayConfig, donationData: any): Promise<ChargeResult>;
  createSubscription(config: GatewayConfig, subscriptionData: any): Promise<SubscriptionResult>;
  updateSubscription(config: GatewayConfig, subscriptionData: any): Promise<SubscriptionResult>;
  cancelSubscription(config: GatewayConfig, subscriptionId: string, reason?: string): Promise<void>;

  // Fee calculation
  calculateFees(amount: number, churchId: string): Promise<number>;

  // Product/service management
  createProduct?(config: GatewayConfig, churchId: string): Promise<string>;

  // Customer management
  createCustomer?(config: GatewayConfig, email: string, name: string): Promise<string>;
  getCustomerSubscriptions?(config: GatewayConfig, customerId: string): Promise<any>;
  getCustomerPaymentMethods?(config: GatewayConfig, customer: any): Promise<any>;

  // Payment method management
  attachPaymentMethod?(config: GatewayConfig, paymentMethodId: string, options: any): Promise<any>;
  detachPaymentMethod?(config: GatewayConfig, paymentMethodId: string): Promise<any>;
  updateCard?(config: GatewayConfig, paymentMethodId: string, cardData: any): Promise<any>;
  createBankAccount?(config: GatewayConfig, customerId: string, options: any): Promise<any>;
  updateBank?(config: GatewayConfig, paymentMethodId: string, bankData: any, customerId: string): Promise<any>;
  verifyBank?(config: GatewayConfig, paymentMethodId: string, amountData: any, customerId: string): Promise<any>;
  deleteBankAccount?(config: GatewayConfig, customerId: string, bankAccountId: string): Promise<any>;

  // Provider-specific functionality
  generateClientToken?(config: GatewayConfig): Promise<string>;
  createOrder?(config: GatewayConfig, orderData: any): Promise<any>;

  // Subscription plan management
  createSubscriptionPlan?(config: GatewayConfig, planData: any): Promise<string>;
  createSubscriptionWithPlan?(config: GatewayConfig, subscriptionData: any): Promise<SubscriptionResult>;

  // Event logging
  logEvent(churchId: string, event: any, eventData: any, repos: any): Promise<void>;
  logDonation(config: GatewayConfig, churchId: string, eventData: any, repos: any): Promise<any>;
}
