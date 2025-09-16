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
  publicKey: string;
  privateKey: string;
  webhookKey: string;
  productId?: string;
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
  cancelSubscription(config: GatewayConfig, subscriptionId: string, reason?: string): Promise<void>;

  // Fee calculation
  calculateFees(amount: number, churchId: string): Promise<number>;

  // Product/service management
  createProduct?(config: GatewayConfig, churchId: string): Promise<string>;

  // Event logging
  logEvent(churchId: string, event: any, eventData: any, repos: any): Promise<void>;
  logDonation(config: GatewayConfig, churchId: string, eventData: any, repos: any): Promise<any>;
}
