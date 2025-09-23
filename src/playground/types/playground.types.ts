export interface GatewayConfig {
  gatewayId: string;
  churchId: string;
  publicKey: string;
  privateKey: string;
  webhookKey: string;
  productId?: string | null;
  environment?: string;
  settings?: Record<string, unknown> | null;
}

export interface GatewayProvider {
  name: string;
  displayName: string;
  supportedMethods: string[];
}

export interface DonationData {
  amount: number;
  currency: string;
  customer: {
    email: string;
  };
  customerId?: string;
  paymentMethodId: string;
  type?: string;
  id?: string;
  description?: string;
}

export interface SubscriptionData {
  amount: number;
  currency: string;
  interval: string;
  customerId: string;
  id?: string;
  subscriptionId?: string;
  description?: string;
}

export interface APIResponse<T = any> {
  success: boolean;
  method?: string;
  provider?: string;
  input?: any;
  result?: T;
  error?: string;
  message?: string;
}

export interface FeeResult {
  fees: number;
  total: number;
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

export interface WebhookResult {
  id: string;
  secret?: string;
}

export interface CustomerResult {
  customerId: string;
}

export interface ClientTokenResult {
  clientToken: string;
}

export interface ProductResult {
  productId: string;
}

export interface PlaygroundState {
  config: GatewayConfig | null;
  provider: string | null;
  providers: GatewayProvider[];
}

export type ResponseElementId =
  | "feesResponse"
  | "chargeResponse"
  | "customerResponse"
  | "subscriptionResponse"
  | "tokenResponse"
  | "webhookResponse"
  | "updateSubResponse"
  | "cancelSubResponse"
  | "productResponse";