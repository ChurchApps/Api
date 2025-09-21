import {
  GatewayConfig,
  APIResponse,
  FeeResult,
  ChargeResult,
  SubscriptionResult,
  WebhookResult,
  CustomerResult,
  ClientTokenResult,
  ProductResult,
  DonationData,
  SubscriptionData,
  GatewayProvider
} from '../types/playground.types';

// Base URL for API calls (should point to your main API server)
const BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8084';

class PlaygroundApiService {
  private async makeAPICall<T>(endpoint: string, data?: any): Promise<T> {
    try {
      const options: RequestInit = {
        method: data ? 'POST' : 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      };

      if (data) {
        options.body = JSON.stringify(data);
      }

      const response = await fetch(`${BASE_URL}${endpoint}`, options);
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error?.message || result.message || 'API call failed');
      }

      return result;
    } catch (error) {
      throw new Error((error as Error).message);
    }
  }

  async calculateFees(provider: string, config: GatewayConfig, amount: number): Promise<APIResponse<FeeResult>> {
    return this.makeAPICall('/playground/gateway/calculate-fees', {
      provider,
      config,
      amount,
    });
  }

  async processCharge(provider: string, config: GatewayConfig, donationData: DonationData): Promise<APIResponse<ChargeResult>> {
    return this.makeAPICall('/playground/gateway/process-charge', {
      provider,
      config,
      donationData,
    });
  }

  async createCustomer(provider: string, config: GatewayConfig, email: string, name: string): Promise<APIResponse<CustomerResult>> {
    return this.makeAPICall('/playground/gateway/create-customer', {
      provider,
      config,
      email,
      name,
    });
  }

  async createSubscription(provider: string, config: GatewayConfig, subscriptionData: SubscriptionData): Promise<APIResponse<SubscriptionResult>> {
    return this.makeAPICall('/playground/gateway/create-subscription', {
      provider,
      config,
      subscriptionData,
    });
  }

  async updateSubscription(provider: string, config: GatewayConfig, subscriptionData: SubscriptionData): Promise<APIResponse<SubscriptionResult>> {
    return this.makeAPICall('/playground/gateway/update-subscription', {
      provider,
      config,
      subscriptionData,
    });
  }

  async cancelSubscription(provider: string, config: GatewayConfig, subscriptionId: string, reason?: string): Promise<APIResponse> {
    return this.makeAPICall('/playground/gateway/cancel-subscription', {
      provider,
      config,
      subscriptionId,
      reason,
    });
  }

  async generateClientToken(provider: string, config: GatewayConfig): Promise<APIResponse<ClientTokenResult>> {
    return this.makeAPICall('/playground/gateway/generate-client-token', {
      provider,
      config,
    });
  }

  async createWebhook(provider: string, config: GatewayConfig, webhookUrl: string): Promise<APIResponse<WebhookResult>> {
    return this.makeAPICall('/playground/gateway/create-webhook', {
      provider,
      config,
      webhookUrl,
    });
  }

  async createProduct(provider: string, config: GatewayConfig): Promise<APIResponse<ProductResult>> {
    return this.makeAPICall('/playground/gateway/create-product', {
      provider,
      config,
    });
  }

  async getCustomerPaymentMethods(provider: string, config: GatewayConfig, customer: any): Promise<APIResponse> {
    return this.makeAPICall('/playground/gateway/get-customer-payment-methods', {
      provider,
      config,
      customer,
    });
  }

  async attachPaymentMethod(provider: string, config: GatewayConfig, paymentMethodId: string, options: any): Promise<APIResponse> {
    return this.makeAPICall('/playground/gateway/attach-payment-method', {
      provider,
      config,
      paymentMethodId,
      options,
    });
  }

  async detachPaymentMethod(provider: string, config: GatewayConfig, paymentMethodId: string): Promise<APIResponse> {
    return this.makeAPICall('/playground/gateway/detach-payment-method', {
      provider,
      config,
      paymentMethodId,
    });
  }

  async createBankAccount(provider: string, config: GatewayConfig, customerId: string, options: any): Promise<APIResponse> {
    return this.makeAPICall('/playground/gateway/create-bank-account', {
      provider,
      config,
      customerId,
      options,
    });
  }

  async updateCard(provider: string, config: GatewayConfig, paymentMethodId: string, cardData: any): Promise<APIResponse> {
    return this.makeAPICall('/playground/gateway/update-card', {
      provider,
      config,
      paymentMethodId,
      cardData,
    });
  }

  async addCard(provider: string, config: GatewayConfig, customerId: string, cardData: any): Promise<APIResponse> {
    return this.makeAPICall('/playground/gateway/add-card', {
      provider,
      config,
      customerId,
      cardData,
    });
  }

  async getCharge(provider: string, config: GatewayConfig, chargeId: string): Promise<APIResponse> {
    return this.makeAPICall('/playground/gateway/get-charge', {
      provider,
      config,
      chargeId,
    });
  }

  async getAvailableProviders(): Promise<{ success: boolean; providers: GatewayProvider[] }> {
    return this.makeAPICall('/playground/gateway/providers');
  }
}

export const playgroundApi = new PlaygroundApiService();