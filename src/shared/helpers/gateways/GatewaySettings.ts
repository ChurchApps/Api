/**
 * Type-safe gateway settings with provider-specific configurations
 */

export interface BaseGatewaySettings {
  webhookEnabled?: boolean;
  testMode?: boolean;
  customFeesEnabled?: boolean;
  autoCapture?: boolean;
}

namespace StripeSettings {
  export interface Settings extends BaseGatewaySettings {
    statementDescriptor?: string;
    paymentMethodTypes?: string[];
    connectAccountId?: string;
    applicationFeePercent?: number;
    captureMethod?: "automatic" | "manual";
    setupFutureUsage?: "on_session" | "off_session";
  }
}

namespace PayPalSettings {
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

namespace SquareSettings {
  export interface Settings extends BaseGatewaySettings {
    locationId?: string;
    applicationId?: string;
    customerId?: string;
    referenceId?: string;
    note?: string;
    tipMoney?: number;
  }
}

namespace ePayMintsSettings {
  export interface Settings extends BaseGatewaySettings {
    merchantId?: string;
    terminalId?: string;
    processorId?: string;
    industryType?: string;
    mcc?: string;
    posEntryMode?: string;
  }
}

namespace KingdomFundingSettings {
  export interface Settings extends BaseGatewaySettings {
    merchantId?: string;
    webhookId?: string;
  }
}

function isStripeSettings(settings: unknown): settings is StripeSettings.Settings {
  return !!settings && typeof settings === "object";
}

function isPayPalSettings(settings: unknown): settings is PayPalSettings.Settings {
  return !!settings && typeof settings === "object";
}

function isSquareSettings(settings: unknown): settings is SquareSettings.Settings {
  return !!settings && typeof settings === "object";
}

function isEPayMintsSettings(settings: unknown): settings is ePayMintsSettings.Settings {
  return !!settings && typeof settings === "object";
}

function isKingdomFundingSettings(settings: unknown): settings is KingdomFundingSettings.Settings {
  return !!settings && typeof settings === "object";
}

namespace PaystackSettings {
  export type Settings = BaseGatewaySettings;
}

function isPaystackSettings(settings: unknown): settings is PaystackSettings.Settings {
  return !!settings && typeof settings === "object";
}

export function validateGatewaySettings(provider: string, settings: Record<string, unknown> | null): BaseGatewaySettings | null {
  if (!settings) return null;

  switch (provider.toLowerCase()) {
    case "stripe": return isStripeSettings(settings) ? settings : null;
    case "paypal": return isPayPalSettings(settings) ? settings : null;
    case "square": return isSquareSettings(settings) ? settings : null;
    case "epaymints": return isEPayMintsSettings(settings) ? settings : null;
    case "kingdomfunding": return isKingdomFundingSettings(settings) ? settings : null;
    case "paystack": return isPaystackSettings(settings) ? settings : null;
    default: return null;
  }
}
