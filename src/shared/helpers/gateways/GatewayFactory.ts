import { IGatewayProvider } from "./IGatewayProvider.js";
import { StripeGatewayProvider } from "./StripeGatewayProvider.js";
import { PayPalGatewayProvider } from "./PayPalGatewayProvider.js";
import { SquareGatewayProvider } from "./SquareGatewayProvider.js";
import { EPayMintsGatewayProvider } from "./EPayMintsGatewayProvider.js";

export interface GatewayFeatureFlags {
  enableSquare?: boolean;
  enableEPayMints?: boolean;
  enableCustomProviders?: boolean;
}

export class GatewayFactory {
  private static providers: Map<string, IGatewayProvider> = new Map();
  private static featureFlags: GatewayFeatureFlags = {};
  private static featureProviderKeys: Set<string> = new Set();

  static {
    // Always register production-ready providers
    this.providers.set("stripe", new StripeGatewayProvider());
    this.providers.set("paypal", new PayPalGatewayProvider());

    // Load feature flags from environment or config
    this.loadFeatureFlags();
    this.syncFeatureFlagProviders();
  }

  /**
   * Load feature flags from environment variables or configuration
   */
  private static loadFeatureFlags(): void {
    this.featureFlags = {
      enableSquare: process.env.ENABLE_SQUARE === "true",
      enableEPayMints: process.env.ENABLE_EPAYMINTS === "true",
      enableCustomProviders: process.env.ENABLE_CUSTOM_GATEWAY_PROVIDERS === "true"
    };
  }

  /**
   * Update feature flags at runtime
   */
  static setFeatureFlags(flags: GatewayFeatureFlags): void {
    this.featureFlags = { ...this.featureFlags, ...flags };
    this.syncFeatureFlagProviders();
  }

  /**
   * Get current feature flags
   */
  static getFeatureFlags(): GatewayFeatureFlags {
    return { ...this.featureFlags };
  }

  /**
   * Get a provider instance by name
   */
  static getProvider(providerName: string): IGatewayProvider {
    const provider = this.providers.get(providerName.toLowerCase());
    if (!provider) {
      throw new Error(`Unsupported payment gateway: ${providerName}. Available providers: ${this.getSupportedProviders().join(", ")}`);
    }
    return provider;
  }

  /**
   * Get list of currently supported providers
   */
  static getSupportedProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Register a custom provider (only if feature flag is enabled)
   */
  static registerProvider(name: string, provider: IGatewayProvider): void {
    if (!this.featureFlags.enableCustomProviders && !["stripe", "paypal"].includes(name.toLowerCase())) {
      throw new Error("Custom gateway providers are disabled. Enable via ENABLE_CUSTOM_GATEWAY_PROVIDERS environment variable.");
    }
    this.providers.set(name.toLowerCase(), provider);
  }

  private static syncFeatureFlagProviders(): void {
    this.toggleProvider("square", this.featureFlags.enableSquare, () => new SquareGatewayProvider());
    this.toggleProvider("epaymints", this.featureFlags.enableEPayMints, () => new EPayMintsGatewayProvider());
  }

  private static toggleProvider(
    name: string,
    enabled: boolean | undefined,
    factory: () => IGatewayProvider
  ): void {
    const key = name.toLowerCase();
    const currentlyRegistered = this.providers.get(key);

    if (enabled) {
      if (!currentlyRegistered) {
        this.providers.set(key, factory());
        this.featureProviderKeys.add(key);
      }
      return;
    }

    if (currentlyRegistered && this.featureProviderKeys.has(key)) {
      this.providers.delete(key);
      this.featureProviderKeys.delete(key);
    }
  }

  /**
   * Check if a provider is available
   */
  static isProviderAvailable(providerName: string): boolean {
    return this.providers.has(providerName.toLowerCase());
  }

  /**
   * Unregister a provider (mainly for testing)
   */
  static unregisterProvider(name: string): boolean {
    if (["stripe", "paypal"].includes(name.toLowerCase())) {
      console.warn(`Cannot unregister core provider: ${name}`);
      return false;
    }
    return this.providers.delete(name.toLowerCase());
  }
}
