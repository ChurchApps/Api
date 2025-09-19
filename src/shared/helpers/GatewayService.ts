import { GatewayFactory, IGatewayProvider, GatewayConfig } from "./gateways";
import { EncryptionHelper } from "@churchapps/apihelper";

export class GatewayService {
  static getGatewayConfig(gateway: any): GatewayConfig {
    return {
      publicKey: gateway.publicKey,
      privateKey: EncryptionHelper.decrypt(gateway.privateKey),
      webhookKey: EncryptionHelper.decrypt(gateway.webhookKey),
      productId: gateway.productId
    };
  }

  static getProviderFromGateway(gateway: any): IGatewayProvider {
    return GatewayFactory.getProvider(gateway.provider);
  }

  static async createWebhook(gateway: any, webhookUrl: string): Promise<{ id: string; secret?: string }> {
    const provider = this.getProviderFromGateway(gateway);
    const config = this.getGatewayConfig(gateway);
    return await provider.createWebhookEndpoint(config, webhookUrl);
  }

  static async deleteWebhooks(gateway: any, churchId: string): Promise<void> {
    const provider = this.getProviderFromGateway(gateway);
    const config = this.getGatewayConfig(gateway);
    await provider.deleteWebhooksByChurchId(config, churchId);
  }

  static async verifyWebhook(gateway: any, headers: any, body: any) {
    const provider = this.getProviderFromGateway(gateway);
    const config = this.getGatewayConfig(gateway);
    return await provider.verifyWebhookSignature(config, headers, body);
  }

  static async processCharge(gateway: any, donationData: any) {
    const provider = this.getProviderFromGateway(gateway);
    const config = this.getGatewayConfig(gateway);
    return await provider.processCharge(config, donationData);
  }

  static async createSubscription(gateway: any, subscriptionData: any) {
    const provider = this.getProviderFromGateway(gateway);
    const config = this.getGatewayConfig(gateway);
    return await provider.createSubscription(config, subscriptionData);
  }

  static async updateSubscription(gateway: any, subscriptionData: any) {
    const provider = this.getProviderFromGateway(gateway);
    const config = this.getGatewayConfig(gateway);
    return await provider.updateSubscription(config, subscriptionData);
  }

  static async cancelSubscription(gateway: any, subscriptionId: string, reason?: string): Promise<void> {
    const provider = this.getProviderFromGateway(gateway);
    const config = this.getGatewayConfig(gateway);
    await provider.cancelSubscription(config, subscriptionId, reason);
  }

  static async calculateFees(gateway: any, amount: number, churchId: string): Promise<number> {
    const provider = this.getProviderFromGateway(gateway);
    return await provider.calculateFees(amount, churchId);
  }

  static async createProduct(gateway: any, churchId: string): Promise<string | undefined> {
    const provider = this.getProviderFromGateway(gateway);
    if (provider.createProduct) {
      const config = this.getGatewayConfig(gateway);
      return await provider.createProduct(config, churchId);
    }
    return undefined;
  }

  static async logEvent(gateway: any, churchId: string, event: any, eventData: any, repos: any): Promise<void> {
    const provider = this.getProviderFromGateway(gateway);
    await provider.logEvent(churchId, event, eventData, repos);
  }

  static async logDonation(gateway: any, churchId: string, eventData: any, repos: any): Promise<any> {
    const provider = this.getProviderFromGateway(gateway);
    const config = this.getGatewayConfig(gateway);
    return await provider.logDonation(config, churchId, eventData, repos);
  }

  // Customer management
  static async createCustomer(gateway: any, email: string, name: string): Promise<string | undefined> {
    const provider = this.getProviderFromGateway(gateway);
    if (provider.createCustomer) {
      const config = this.getGatewayConfig(gateway);
      return await provider.createCustomer(config, email, name);
    }
    return undefined;
  }

  static async getCustomerSubscriptions(gateway: any, customerId: string): Promise<any> {
    const provider = this.getProviderFromGateway(gateway);
    if (provider.getCustomerSubscriptions) {
      const config = this.getGatewayConfig(gateway);
      return await provider.getCustomerSubscriptions(config, customerId);
    }
    return [];
  }

  static async getCustomerPaymentMethods(gateway: any, customer: any): Promise<any> {
    const provider = this.getProviderFromGateway(gateway);
    if (provider.getCustomerPaymentMethods) {
      const config = this.getGatewayConfig(gateway);
      return await provider.getCustomerPaymentMethods(config, customer);
    }
    return [];
  }

  // Payment method management
  static async attachPaymentMethod(gateway: any, paymentMethodId: string, options: any): Promise<any> {
    const provider = this.getProviderFromGateway(gateway);
    if (provider.attachPaymentMethod) {
      const config = this.getGatewayConfig(gateway);
      return await provider.attachPaymentMethod(config, paymentMethodId, options);
    }
    throw new Error(`${gateway.provider} does not support payment method attachment`);
  }

  static async detachPaymentMethod(gateway: any, paymentMethodId: string): Promise<any> {
    const provider = this.getProviderFromGateway(gateway);
    if (provider.detachPaymentMethod) {
      const config = this.getGatewayConfig(gateway);
      return await provider.detachPaymentMethod(config, paymentMethodId);
    }
    throw new Error(`${gateway.provider} does not support payment method detachment`);
  }

  static async updateCard(gateway: any, paymentMethodId: string, cardData: any): Promise<any> {
    const provider = this.getProviderFromGateway(gateway);
    if (provider.updateCard) {
      const config = this.getGatewayConfig(gateway);
      return await provider.updateCard(config, paymentMethodId, cardData);
    }
    throw new Error(`${gateway.provider} does not support card updates`);
  }

  static async createBankAccount(gateway: any, customerId: string, options: any): Promise<any> {
    const provider = this.getProviderFromGateway(gateway);
    if (provider.createBankAccount) {
      const config = this.getGatewayConfig(gateway);
      return await provider.createBankAccount(config, customerId, options);
    }
    throw new Error(`${gateway.provider} does not support bank account creation`);
  }

  static async updateBank(gateway: any, paymentMethodId: string, bankData: any, customerId: string): Promise<any> {
    const provider = this.getProviderFromGateway(gateway);
    if (provider.updateBank) {
      const config = this.getGatewayConfig(gateway);
      return await provider.updateBank(config, paymentMethodId, bankData, customerId);
    }
    throw new Error(`${gateway.provider} does not support bank account updates`);
  }

  static async verifyBank(gateway: any, paymentMethodId: string, amountData: any, customerId: string): Promise<any> {
    const provider = this.getProviderFromGateway(gateway);
    if (provider.verifyBank) {
      const config = this.getGatewayConfig(gateway);
      return await provider.verifyBank(config, paymentMethodId, amountData, customerId);
    }
    throw new Error(`${gateway.provider} does not support bank account verification`);
  }

  static async deleteBankAccount(gateway: any, customerId: string, bankAccountId: string): Promise<any> {
    const provider = this.getProviderFromGateway(gateway);
    if (provider.deleteBankAccount) {
      const config = this.getGatewayConfig(gateway);
      return await provider.deleteBankAccount(config, customerId, bankAccountId);
    }
    throw new Error(`${gateway.provider} does not support bank account deletion`);
  }

  // Provider-specific functionality
  static async generateClientToken(gateway: any): Promise<string | undefined> {
    const provider = this.getProviderFromGateway(gateway);
    if (provider.generateClientToken) {
      const config = this.getGatewayConfig(gateway);
      return await provider.generateClientToken(config);
    }
    return undefined;
  }

  static async createOrder(gateway: any, orderData: any): Promise<any> {
    const provider = this.getProviderFromGateway(gateway);
    if (provider.createOrder) {
      const config = this.getGatewayConfig(gateway);
      return await provider.createOrder(config, orderData);
    }
    throw new Error(`${gateway.provider} does not support order creation`);
  }
}
