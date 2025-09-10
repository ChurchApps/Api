import { GatewayFactory, IGatewayProvider, GatewayConfig } from "./gateways";
import { EncryptionHelper } from "@churchapps/apihelper";

export class GatewayService {
  static getGatewayConfig(gateway: any): GatewayConfig {
    console.log("Config.privateKey", gateway.privateKey);
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
    console.log("Provider", provider);
    const config = this.getGatewayConfig(gateway);
    console.log("Config", config);
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

  static async logEvent(gateway: any, churchId: string, event: any, eventData: any, repositories: any): Promise<void> {
    const provider = this.getProviderFromGateway(gateway);
    await provider.logEvent(churchId, event, eventData, repositories);
  }

  static async logDonation(gateway: any, churchId: string, eventData: any, repositories: any): Promise<any> {
    const provider = this.getProviderFromGateway(gateway);
    const config = this.getGatewayConfig(gateway);
    return await provider.logDonation(config, churchId, eventData, repositories);
  }
}
