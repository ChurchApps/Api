import { GatewayFactory, IGatewayProvider, GatewayConfig } from "./gateways/index.js";
import type { ProviderCapabilities, WebhookEventClassification, ReplayEvent, SubscriptionResult } from "./gateways/index.js";
import { validateGatewaySettings } from "./gateways/GatewaySettings.js";
import { GatewayRepo } from "../../modules/giving/repositories/GatewayRepo.js";
import { Gateway } from "../../modules/giving/models/index.js";
import { EncryptionHelper } from "@churchapps/apihelper";

export type { ProviderCapabilities } from "./gateways/index.js";

export interface GetGatewayOptions {
  provider?: string;
  gatewayId?: string;
  environmentPreference?: string[];
  // Restrict resolution to gateways whose provider has this capability.
  requiredCapability?: keyof ProviderCapabilities;
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

    const privateKey = decryptIfPresent(gateway.privateKey);

    if (!privateKey && gateway.provider?.toLowerCase() === "stripe") {
      console.error("Gateway privateKey is missing or failed to decrypt", {
        provider: gateway.provider,
        gatewayId: gateway.id,
        churchId: gateway.churchId,
        hasPrivateKey: !!gateway.privateKey
      });
    }

    return {
      gatewayId: gateway.id,
      churchId: gateway.churchId,
      publicKey: gateway.publicKey,
      privateKey,
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

  static classifyWebhookEvent(gateway: any, eventType: string): WebhookEventClassification {
    const provider = this.getProviderFromGateway(gateway);
    return provider.classifyWebhookEvent?.(eventType) || { action: "ignore" };
  }

  static logsDonationsImmediately(gateway: any): boolean {
    return !!this.getProviderFromGateway(gateway).logsDonationsImmediately;
  }

  static async prepareCharge(gateway: any, donationData: any, repos: any): Promise<void> {
    const provider = this.getProviderFromGateway(gateway);
    if (provider.prepareCharge) {
      const config = this.getGatewayConfig(gateway);
      await provider.prepareCharge(config, donationData, repos);
    }
  }

  static async processCharge(gateway: any, donationData: any) {
    const provider = this.getProviderFromGateway(gateway);
    const config = this.getGatewayConfig(gateway);
    return await provider.processCharge(config, donationData);
  }

  static async prepareSubscription(gateway: any, subscriptionData: any, person: any, repos: any): Promise<void> {
    const provider = this.getProviderFromGateway(gateway);
    if (provider.prepareSubscription) {
      const config = this.getGatewayConfig(gateway);
      await provider.prepareSubscription(config, subscriptionData, person, repos);
    }
  }

  static async finalizeSubscription(gateway: any, result: SubscriptionResult, subscriptionData: any, person: any, repos: any): Promise<string | undefined> {
    const provider = this.getProviderFromGateway(gateway);
    if (provider.finalizeSubscription) {
      const config = this.getGatewayConfig(gateway);
      return await provider.finalizeSubscription(config, result, subscriptionData, person, repos);
    }
    return undefined;
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

  static async pauseSubscription(gateway: any, subscriptionId: string): Promise<void> {
    const provider = this.getProviderFromGateway(gateway);
    const config = this.getGatewayConfig(gateway);
    await provider.pauseSubscription(config, subscriptionId);
  }

  static async resumeSubscription(gateway: any, subscriptionId: string): Promise<void> {
    const provider = this.getProviderFromGateway(gateway);
    const config = this.getGatewayConfig(gateway);
    await provider.resumeSubscription(config, subscriptionId);
  }

  static async calculateFees(gateway: any, amount: number, churchId: string, currency?: string, paymentType?: "card" | "bank"): Promise<number> {
    const provider = this.getProviderFromGateway(gateway);
    const currencyToUse = currency || gateway.currency || "USD";
    return await provider.calculateFees(amount, churchId, currencyToUse, paymentType);
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

  static async logDonation(gateway: any, churchId: string, eventData: any, repos: any, status: "pending" | "complete" = "complete"): Promise<any> {
    const provider = this.getProviderFromGateway(gateway);
    const config = this.getGatewayConfig(gateway);
    return await provider.logDonation(config, churchId, eventData, repos, status);
  }

  static async updateDonationStatus(gateway: any, churchId: string, transactionId: string, status: "pending" | "complete" | "failed", repos: any): Promise<void> {
    const provider = this.getProviderFromGateway(gateway);
    if (provider.updateDonationStatus) {
      await provider.updateDonationStatus(churchId, transactionId, status, repos);
    }
  }

  static async createCustomer(gateway: any, email: string, name: string, options?: { personId?: string }): Promise<string | undefined> {
    const provider = this.getProviderFromGateway(gateway);
    if (provider.createCustomer) {
      const config = this.getGatewayConfig(gateway);
      return await provider.createCustomer(config, email, name, options);
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

  static async getSubscription(gateway: any, subscriptionId: string): Promise<any> {
    const provider = this.getProviderFromGateway(gateway);
    if (typeof provider.getSubscription === "function") {
      const config = this.getGatewayConfig(gateway);
      return await provider.getSubscription(config, subscriptionId);
    }
    return null;
  }

  static async getCustomerPaymentMethods(gateway: any, customer: any): Promise<any> {
    const provider = this.getProviderFromGateway(gateway);
    if (provider.getCustomerPaymentMethods) {
      const config = this.getGatewayConfig(gateway);
      return await provider.getCustomerPaymentMethods(config, customer);
    }
    return [];
  }

  static async listNormalizedPaymentMethods(gateway: any, customer: any, repos: any): Promise<any[]> {
    const provider = this.getProviderFromGateway(gateway);
    if (provider.listNormalizedPaymentMethods) {
      const config = this.getGatewayConfig(gateway);
      return await provider.listNormalizedPaymentMethods(config, customer, repos);
    }
    return [];
  }

  static async listNormalizedSubscriptions(gateway: any, customerId: string): Promise<any[]> {
    const provider = this.getProviderFromGateway(gateway);
    const config = this.getGatewayConfig(gateway);
    if (provider.listNormalizedSubscriptions) {
      return await provider.listNormalizedSubscriptions(config, customerId);
    }
    // Providers whose raw subscriptions already match the UI shape (or return { data: [...] }).
    const raw = provider.getCustomerSubscriptions ? await provider.getCustomerSubscriptions(config, customerId) : [];
    return Array.isArray(raw) ? raw : raw?.data || [];
  }

  static validateAttachToken(gateway: any, id: string): string | null {
    const provider = this.getProviderFromGateway(gateway);
    return provider.validateAttachToken ? provider.validateAttachToken(id) : null;
  }

  static async resolveCustomerForAttach(gateway: any, personId: string | undefined, requestCustomerId: string | undefined, repos: any): Promise<string | undefined> {
    const provider = this.getProviderFromGateway(gateway);
    if (provider.resolveCustomerForAttach) {
      const config = this.getGatewayConfig(gateway);
      return await provider.resolveCustomerForAttach(config, personId, requestCustomerId, repos);
    }
    return requestCustomerId;
  }

  static recreatesMissingCustomers(gateway: any): boolean {
    return !!this.getProviderFromGateway(gateway).recreatesMissingCustomers;
  }

  static buildAttachOptions(gateway: any, customerId: string, tokenId: string, body: any): any {
    const provider = this.getProviderFromGateway(gateway);
    return provider.buildAttachOptions ? provider.buildAttachOptions(customerId, tokenId, body) : { customer: customerId };
  }

  static buildLocalMethodRecord(gateway: any, pm: any, body: any, tokenId: string): { methodType: string; displayName: string; metadata: any } | null {
    const provider = this.getProviderFromGateway(gateway);
    return provider.buildLocalMethodRecord ? provider.buildLocalMethodRecord(pm, body, tokenId) : null;
  }

  // Infers the owning provider from an opaque payment-method id via registered providers.
  static inferProviderFromMethodId(id: string): string | null {
    for (const name of GatewayFactory.getSupportedProviders()) {
      const provider = GatewayFactory.getProvider(name);
      if (provider.ownsPaymentMethodId?.(id)) return name;
    }
    return null;
  }

  static async verifyMethodOwnership(gateway: any, paymentMethodId: string, customerId: string, repos: any): Promise<boolean> {
    const provider = this.getProviderFromGateway(gateway);
    const config = this.getGatewayConfig(gateway);
    if (provider.verifyMethodOwnership) {
      return await provider.verifyMethodOwnership(config, paymentMethodId, customerId, repos);
    }
    // Default: the method's local record must belong to the customer.
    const record = await repos.gatewayPaymentMethod.loadByExternalId(gateway.churchId, gateway.id, paymentMethodId)
      || await repos.gatewayPaymentMethod.loadByExternalIdAcrossGateways(gateway.churchId, paymentMethodId);
    return !!record && String(record.customerId) === String(customerId);
  }

  static async deletePaymentMethod(gateway: any, paymentMethodId: string, customerId: string, repos: any): Promise<void> {
    const provider = this.getProviderFromGateway(gateway);
    const config = this.getGatewayConfig(gateway);
    if (provider.deletePaymentMethod) {
      await provider.deletePaymentMethod(config, paymentMethodId, customerId, repos);
    } else {
      await this.detachPaymentMethod(gateway, paymentMethodId);
    }
    // Clean up the local display record; a no-op for providers that keep none.
    await repos.gatewayPaymentMethod.deleteByExternalId(gateway.churchId, gateway.id, paymentMethodId);
  }

  static async verifySubscriptionOwnership(gateway: any, subscriptionId: string, personId: string, repos: any): Promise<boolean> {
    const provider = this.getProviderFromGateway(gateway);
    if (provider.verifySubscriptionOwnership) {
      const config = this.getGatewayConfig(gateway);
      return await provider.verifySubscriptionOwnership(config, subscriptionId, personId, repos);
    }
    return false;
  }

  static mapGatewayError(gateway: any, e: any): { status: number; body: any } | null {
    try {
      return this.getProviderFromGateway(gateway).mapError?.(e) || null;
    } catch {
      return null;
    }
  }

  static supportsReplayEvents(gateway: any): boolean {
    return !!this.getProviderFromGateway(gateway).listReplayEvents;
  }

  static async listReplayEvents(gateway: any, startDate: number, endDate: number): Promise<ReplayEvent[]> {
    const provider = this.getProviderFromGateway(gateway);
    if (!provider.listReplayEvents) throw new Error(`${gateway.provider} does not support event replay`);
    const config = this.getGatewayConfig(gateway);
    return await provider.listReplayEvents(config, startDate, endDate);
  }

  static async importReplayEvent(gateway: any, churchId: string, event: ReplayEvent, repos: any): Promise<void> {
    const provider = this.getProviderFromGateway(gateway);
    if (!provider.importReplayEvent) throw new Error(`${gateway.provider} does not support event replay`);
    const config = this.getGatewayConfig(gateway);
    await provider.importReplayEvent(config, churchId, event, repos);
  }

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

  static supportsACHSetupIntent(gateway: any): boolean {
    return !!this.getProviderFromGateway(gateway).createACHSetupIntent;
  }

  static async createACHSetupIntent(gateway: any, customerId: string): Promise<any> {
    const provider = this.getProviderFromGateway(gateway);
    if (provider.createACHSetupIntent) {
      const config = this.getGatewayConfig(gateway);
      return await provider.createACHSetupIntent(config, customerId);
    }
    throw new Error(`${gateway.provider} does not support ACH SetupIntent`);
  }

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

  /** Resolve the most appropriate gateway for a church, throwing descriptive errors if ambiguous. */
  static async getGatewayForChurch(
    churchId: string,
    options: GetGatewayOptions = {},
    repo?: Pick<GatewayRepo, "loadAll">
  ): Promise<Gateway> {
    if (!churchId) throw new Error("churchId is required to resolve a payment gateway");

    const gatewayRepo = repo ?? new GatewayRepo();
    // Load raw gateways - do NOT use convertAllToModel as it strips privateKey/webhookKey
    // which are needed for internal gateway operations
    const gateways = (await gatewayRepo.loadAll(churchId)) as Gateway[];

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

    if (options.requiredCapability) {
      gateways = gateways.filter((gateway) => !!this.getProviderCapabilities(gateway)?.[options.requiredCapability!]);
      if (gateways.length === 1) return { gateway: gateways[0], reason: null };
    }

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

  /** Get the capabilities of a specific payment provider (declared on each provider class). */
  static getProviderCapabilities(gatewayOrProvider: string | { provider?: string }): ProviderCapabilities | null {
    const provider = typeof gatewayOrProvider === "string" ? gatewayOrProvider : gatewayOrProvider?.provider;
    if (!provider) return null;
    try {
      return GatewayFactory.getProvider(provider).capabilities;
    } catch {
      return null;
    }
  }

  /** Validate gateway settings based on provider type. */
  static validateSettings(gateway: any): any {
    if (!gateway.settings) return null;
    return validateGatewaySettings(gateway.provider, gateway.settings);
  }
}
