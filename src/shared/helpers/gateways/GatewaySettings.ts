/**
 * Type-safe gateway settings with provider-specific configurations
 */

// Base settings shared across all providers
interface BaseGatewaySettings {
  webhookEnabled?: boolean;
  testMode?: boolean;
  customFeesEnabled?: boolean;
  autoCapture?: boolean;
}

// Stripe-specific settings
export namespace StripeSettings {
  export interface Settings extends BaseGatewaySettings {
    statementDescriptor?: string;
    paymentMethodTypes?: string[];
    connectAccountId?: string;
    applicationFeePercent?: number;
    captureMethod?: "automatic" | "manual";
    setupFutureUsage?: "on_session" | "off_session";
  }
}

// PayPal-specific settings
export namespace PayPalSettings {
  export interface Settings extends BaseGatewaySettings {
    brandName?: string;
    landingPage?: "LOGIN" | "BILLING" | "NO_PREFERENCE";
    userAction?: "CONTINUE" | "PAY_NOW";
    shippingPreference?: "GET_FROM_FILE" | "NO_SHIPPING" | "SET_PROVIDED_ADDRESS";
    returnUrl?: string;
    cancelUrl?: string;
    experienceProfileId?: string;
  }
}

// Square-specific settings (future implementation)
export namespace SquareSettings {
  export interface Settings extends BaseGatewaySettings {
    locationId?: string;
    applicationId?: string;
    customerId?: string;
    referenceId?: string;
    note?: string;
    tipMoney?: number;
  }
}

// ePayMints-specific settings (future implementation)
export namespace ePayMintsSettings {
  export interface Settings extends BaseGatewaySettings {
    merchantId?: string;
    terminalId?: string;
    processorId?: string;
    industryType?: string;
    mcc?: string;
    posEntryMode?: string;
  }
}

// Union type for all gateway settings
export type GatewaySettings =
  | { provider: "stripe"; settings: StripeSettings.Settings }
  | { provider: "paypal"; settings: PayPalSettings.Settings }
  | { provider: "square"; settings: SquareSettings.Settings }
  | { provider: "epaymints"; settings: ePayMintsSettings.Settings };

// Type guard functions
export function isStripeSettings(settings: any): settings is StripeSettings.Settings {
  return settings && typeof settings === "object";
}

export function isPayPalSettings(settings: any): settings is PayPalSettings.Settings {
  return settings && typeof settings === "object";
}

export function isSquareSettings(settings: any): settings is SquareSettings.Settings {
  return settings && typeof settings === "object";
}

export function isEPayMintsSettings(settings: any): settings is ePayMintsSettings.Settings {
  return settings && typeof settings === "object";
}

// Helper to validate and cast settings based on provider
export function validateGatewaySettings(provider: string, settings: Record<string, unknown> | null): BaseGatewaySettings | null {
  if (!settings) return null;

  switch (provider.toLowerCase()) {
    case "stripe":
      return isStripeSettings(settings) ? settings : null;
    case "paypal":
      return isPayPalSettings(settings) ? settings : null;
    case "square":
      return isSquareSettings(settings) ? settings : null;
    case "epaymints":
      return isEPayMintsSettings(settings) ? settings : null;
    default:
      return null;
  }
}
