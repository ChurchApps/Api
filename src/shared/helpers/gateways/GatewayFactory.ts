import { IGatewayProvider } from "./IGatewayProvider";
import { StripeGatewayProvider } from "./StripeGatewayProvider";
import { PayPalGatewayProvider } from "./PayPalGatewayProvider";

export class GatewayFactory {
  private static providers: Map<string, IGatewayProvider> = new Map();

  static {
    this.providers.set("stripe", new StripeGatewayProvider());
    this.providers.set("paypal", new PayPalGatewayProvider());
  }

  static getProvider(providerName: string): IGatewayProvider {
    const provider = this.providers.get(providerName.toLowerCase());
    if (!provider) {
      throw new Error(`Unsupported payment gateway: ${providerName}`);
    }
    return provider;
  }

  static getSupportedProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  static registerProvider(name: string, provider: IGatewayProvider): void {
    this.providers.set(name.toLowerCase(), provider);
  }
}
