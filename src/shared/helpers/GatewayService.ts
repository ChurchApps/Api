import { GatewayFactory, IGatewayProvider, GatewayConfig } from "./gateways";
import { validateGatewaySettings } from "./gateways/GatewaySettings";
import { GatewayRepo } from "../../modules/giving/repositories/GatewayRepo";
import { Gateway } from "../../modules/giving/models";
import { EncryptionHelper } from "@churchapps/apihelper";

export interface ProviderCapabilities {
  supportsOneTimePayments: boolean;
  supportsSubscriptions: boolean;
  supportsVault: boolean;
  supportsACH: boolean;
  supportsRefunds: boolean;
  supportsPartialRefunds: boolean;
  supportsWebhooks: boolean;
  supportsOrders: boolean;
  supportsInstantCapture: boolean;
  supportsManualCapture: boolean;
  supportsSCA: boolean;
  requiresPlansForSubscriptions: boolean;
  requiresCustomerForSubscription: boolean;
  supportedPaymentMethods: string[];
  supportedCurrencies: string[];
  maxRefundWindow?: number; // in days
  minTransactionAmount?: number; // in cents
  maxTransactionAmount?: number; // in cents
  notes?: string[];
}

export interface GetGatewayOptions {
  provider?: string;
  gatewayId?: string;
  environmentPreference?: string[];
}

type GatewayResolutionReason = "not-found" | "ambiguous" | null;

export class GatewayService {
  static getGatewayConfig(gateway: any): GatewayConfig {
    const decryptIfPresent = (value: string | null | undefined) => {
      if (!value) return "";
      try {
        return EncryptionHelper.decrypt(value);
      } catch (err) {
        console.error("Failed to decrypt gateway secret", { provider: gateway?.provider, gatewayId: gateway?.id, err });
        return "";
      }
    };

    return {
      gatewayId: gateway.id,
      churchId: gateway.churchId,
      publicKey: gateway.publicKey,
      privateKey: decryptIfPresent(gateway.privateKey),
      webhookKey: decryptIfPresent(gateway.webhookKey),
      productId: gateway.productId,
      settings: gateway.settings ?? null,
      environment: gateway.environment ?? null
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

  // Subscription plan management
  static async createSubscriptionPlan(gateway: any, planData: any): Promise<string | undefined> {
    const provider = this.getProviderFromGateway(gateway);
    if (provider.createSubscriptionPlan) {
      const config = this.getGatewayConfig(gateway);
      return await provider.createSubscriptionPlan(config, planData);
    }
    throw new Error(`${gateway.provider} does not support subscription plan creation`);
  }

  static async createSubscriptionWithPlan(gateway: any, subscriptionData: any): Promise<any> {
    const provider = this.getProviderFromGateway(gateway);
    if (provider.createSubscriptionWithPlan) {
      const config = this.getGatewayConfig(gateway);
      return await provider.createSubscriptionWithPlan(config, subscriptionData);
    }
    throw new Error(`${gateway.provider} does not support plan-based subscription creation`);
  }

  /**
   * Load and resolve the most appropriate gateway for the provided church.
   * Throws descriptive errors when the gateway cannot be resolved.
   */
  static async getGatewayForChurch(
    churchId: string,
    options: GetGatewayOptions = {},
    repo?: Pick<GatewayRepo, "loadAll" | "convertAllToModel">
  ): Promise<Gateway> {
    if (!churchId) throw new Error("churchId is required to resolve a payment gateway");

    const gatewayRepo = repo ?? new GatewayRepo();
    const rawGateways = await gatewayRepo.loadAll(churchId);
    const gateways = typeof gatewayRepo.convertAllToModel === "function"
      ? gatewayRepo.convertAllToModel(churchId, rawGateways)
      : (rawGateways as Gateway[]);

    if (!gateways || gateways.length === 0) {
      throw new Error(`No payment gateway configured for church ${churchId}.`);
    }

    const resolution = this.resolveGatewayFromList(gateways, options);
    const selected = resolution.gateway;

    if (!selected) {
      if (options.gatewayId) {
        throw new Error(`Gateway ${options.gatewayId} is not configured for church ${churchId}.`);
      }

      if (resolution.reason === "ambiguous") {
        const qualifier = options.provider ? `${options.provider} ` : "";
        throw new Error(
          `Multiple ${qualifier}payment gateways are configured for church ${churchId}. Provide a gatewayId or environment preference to disambiguate.`
        );
      }

      if (options.provider) {
        throw new Error(`No ${options.provider} gateway configured for church ${churchId}.`);
      }

      throw new Error(`No payment gateway configured for church ${churchId}.`);
    }

    return {
      ...selected,
      settings: this.validateSettings(selected)
    } as Gateway;
  }

  private static resolveGatewayFromList(
    gateways: Gateway[],
    options: GetGatewayOptions
  ): { gateway: Gateway | null; reason: GatewayResolutionReason } {
    const normalizedProvider = options.provider?.toLowerCase();
    const environmentOrder = options.environmentPreference || ["production", "live", "sandbox", "test"]; // fallback order

    const matches = gateways.filter((gateway) => {
      if (options.gatewayId && gateway.id === options.gatewayId) return true;
      if (normalizedProvider) {
        return gateway.provider?.toLowerCase() === normalizedProvider;
      }
      return !options.gatewayId;
    });

    if (options.gatewayId) {
      return { gateway: matches[0] || null, reason: matches[0] ? null : "not-found" };
    }

    if (normalizedProvider) {
      if (!matches.length) {
        return { gateway: null, reason: "not-found" };
      }

      const selected = this.pickByEnvironment(matches, environmentOrder);
      return { gateway: selected, reason: selected ? null : "ambiguous" };
    }

    if (gateways.length === 1) {
      return { gateway: gateways[0], reason: null };
    }

    const selected = this.pickByEnvironment(gateways, environmentOrder);
    return { gateway: selected, reason: selected ? null : "ambiguous" };
  }

  private static pickByEnvironment(gateways: Gateway[], environmentOrder: string[]): Gateway | null {
    if (!gateways.length) return null;

    const priorityLookup = environmentOrder.map((env, index) => ({ env, weight: index }));
    const weights = new Map(priorityLookup.map(({ env, weight }) => [env?.toLowerCase(), weight] as const));

    let selected: Gateway | null = null;
    let bestWeight = Number.MAX_SAFE_INTEGER;
    let ambiguous = false;

    gateways.forEach((gateway) => {
      const envKey = (gateway.environment || "").toLowerCase();
      const weight = weights.get(envKey) ?? environmentOrder.length;

      if (weight < bestWeight) {
        selected = gateway;
        bestWeight = weight;
        ambiguous = false;
        return;
      }

      if (weight === bestWeight) {
        ambiguous = true;
      }
    });

    return ambiguous ? null : selected;
  }

  /**
   * Get the capabilities of a specific payment provider
   * @param gatewayOrProvider Provider name (stripe, paypal, square, epaymints) or gateway object
   * @returns Provider capabilities or null if provider not found
   */
  static getProviderCapabilities(gatewayOrProvider: string | { provider?: string }): ProviderCapabilities | null {
    const provider = typeof gatewayOrProvider === "string" ? gatewayOrProvider : gatewayOrProvider?.provider;
    if (!provider) return null;

    const capabilities: Record<string, ProviderCapabilities> = {
      stripe: {
        supportsOneTimePayments: true,
        supportsSubscriptions: true,
        supportsVault: true,
        supportsACH: true,
        supportsRefunds: true,
        supportsPartialRefunds: true,
        supportsWebhooks: true,
        supportsOrders: false,
        supportedPaymentMethods: ["card", "ach_debit", "link", "apple_pay", "google_pay"],
        supportedCurrencies: ["usd", "eur", "gbp", "cad", "aud", "jpy", "mxn", "nzd", "sgd"],
        requiresPlansForSubscriptions: false,
        requiresCustomerForSubscription: true,
        supportsInstantCapture: true,
        supportsManualCapture: true,
        supportsSCA: true,
        maxRefundWindow: 180,
        minTransactionAmount: 50, // 50 cents
        maxTransactionAmount: 99999999, // $999,999.99
        notes: ["Supports ACH via Plaid or micro-deposits", "Ideal for card + bank payments"]
      },
      paypal: {
        supportsOneTimePayments: true,
        supportsSubscriptions: true,
        supportsVault: true,
        supportsACH: false,
        supportsRefunds: true,
        supportsPartialRefunds: true,
        supportsWebhooks: true,
        supportsOrders: true,
        supportedPaymentMethods: ["paypal", "card", "venmo", "pay_later"],
        supportedCurrencies: ["usd", "eur", "gbp", "cad", "aud", "jpy", "mxn", "nzd", "sgd"],
        requiresPlansForSubscriptions: true,
        requiresCustomerForSubscription: false,
        supportsInstantCapture: true,
        supportsManualCapture: true,
        supportsSCA: true,
        maxRefundWindow: 180,
        minTransactionAmount: 100, // $1.00
        maxTransactionAmount: 1000000, // $10,000.00
        notes: ["Subscriptions require Billing Plans", "Order APIs power PayPal smart buttons"]
      },
      square: {
        supportsOneTimePayments: true,
        supportsSubscriptions: true,
        supportsVault: true,
        supportsACH: true,
        supportsRefunds: true,
        supportsPartialRefunds: true,
        supportsWebhooks: true,
        supportsOrders: false,
        supportedPaymentMethods: ["card", "apple_pay", "google_pay", "ach_debit", "gift_card"],
        supportedCurrencies: ["usd", "cad", "gbp", "aud", "jpy", "eur"],
        requiresPlansForSubscriptions: false,
        requiresCustomerForSubscription: true,
        supportsInstantCapture: true,
        supportsManualCapture: true,
        supportsSCA: true,
        maxRefundWindow: 120,
        minTransactionAmount: 100, // $1.00
        maxTransactionAmount: 5000000, // $50,000.00
        notes: ["ACH support requires Square bank on file", "Subscriptions available with catalog plans"]
      },
      epaymints: {
        supportsOneTimePayments: true,
        supportsSubscriptions: false,
        supportsVault: false,
        supportsACH: true,
        supportsRefunds: true,
        supportsPartialRefunds: false,
        supportsWebhooks: false,
        supportsOrders: false,
        supportedPaymentMethods: ["card", "ach"],
        supportedCurrencies: ["usd"],
        requiresPlansForSubscriptions: false,
        requiresCustomerForSubscription: false,
        supportsInstantCapture: true,
        supportsManualCapture: false,
        supportsSCA: false,
        maxRefundWindow: 90,
        minTransactionAmount: 100, // $1.00
        maxTransactionAmount: 10000000, // $100,000.00
        notes: ["Webhooks limited; polling recommended", "ACH available via tokenised transactions"]
      }
    };

    return capabilities[provider.toLowerCase()] || null;
  }

  /**
   * Validate gateway settings based on provider type
   * @param gateway Gateway object with provider and settings
   * @returns Validated settings or null if invalid
   */
  static validateSettings(gateway: any): any {
    if (!gateway.settings) return null;
    return validateGatewaySettings(gateway.provider, gateway.settings);
  }
}
