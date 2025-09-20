import { GatewayService } from "../GatewayService";
import { GatewayFactory } from "../gateways";
import { EncryptionHelper } from "@churchapps/apihelper";

// Mock dependencies
jest.mock("../gateways", () => ({
  GatewayFactory: {
    getProvider: jest.fn()
  }
}));

jest.mock("@churchapps/apihelper", () => ({
  EncryptionHelper: {
    decrypt: jest.fn((value) => `decrypted_${value}`)
  }
}));

// Mock console.log to capture any unauthorized logging
const mockConsoleLog = jest.spyOn(console, "log").mockImplementation();
const mockConsoleError = jest.spyOn(console, "error").mockImplementation();
const mockConsoleWarn = jest.spyOn(console, "warn").mockImplementation();
const mockConsoleInfo = jest.spyOn(console, "info").mockImplementation();
const mockConsoleDebug = jest.spyOn(console, "debug").mockImplementation();

describe("GatewayService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Reset console mocks after each test
    mockConsoleLog.mockClear();
    mockConsoleError.mockClear();
    mockConsoleWarn.mockClear();
    mockConsoleInfo.mockClear();
    mockConsoleDebug.mockClear();
  });

  describe("getGatewayConfig", () => {
    it("should return decrypted gateway configuration", () => {
      const mockGateway = {
        publicKey: "public_test_key",
        privateKey: "encrypted_private_key",
        webhookKey: "encrypted_webhook_key",
        productId: "test_product_id"
      };

      const result = GatewayService.getGatewayConfig(mockGateway);

      expect(result).toEqual({
        publicKey: "public_test_key",
        privateKey: "decrypted_encrypted_private_key",
        webhookKey: "decrypted_encrypted_webhook_key",
        productId: "test_product_id"
      });

      expect(EncryptionHelper.decrypt).toHaveBeenCalledWith("encrypted_private_key");
      expect(EncryptionHelper.decrypt).toHaveBeenCalledWith("encrypted_webhook_key");
    });

    it("should not log any sensitive information", () => {
      const mockGateway = {
        publicKey: "public_test_key",
        privateKey: "encrypted_private_key",
        webhookKey: "encrypted_webhook_key",
        productId: "test_product_id"
      };

      GatewayService.getGatewayConfig(mockGateway);

      // Verify no console logging occurred
      expect(mockConsoleLog).not.toHaveBeenCalled();
      expect(mockConsoleError).not.toHaveBeenCalled();
      expect(mockConsoleWarn).not.toHaveBeenCalled();
      expect(mockConsoleInfo).not.toHaveBeenCalled();
      expect(mockConsoleDebug).not.toHaveBeenCalled();
    });

    it("should not log private keys, secrets, or configuration objects", () => {
      const mockGateway = {
        publicKey: "public_test_key",
        privateKey: "secret_private_key",
        webhookKey: "secret_webhook_key",
        productId: "test_product_id"
      };

      GatewayService.getGatewayConfig(mockGateway);

      // Verify that sensitive information is not logged
      const allConsoleCalls = [
        ...mockConsoleLog.mock.calls,
        ...mockConsoleError.mock.calls,
        ...mockConsoleWarn.mock.calls,
        ...mockConsoleInfo.mock.calls,
        ...mockConsoleDebug.mock.calls
      ];

      // Check that no console calls contain sensitive information
      allConsoleCalls.forEach(call => {
        const callString = call.join(" ");
        expect(callString).not.toContain("secret_private_key");
        expect(callString).not.toContain("secret_webhook_key");
        expect(callString).not.toContain("decrypted_");
        expect(callString.toLowerCase()).not.toContain("privatekey");
        expect(callString.toLowerCase()).not.toContain("webhookkey");
        expect(callString.toLowerCase()).not.toContain("config");
      });
    });
  });

  describe("deleteWebhooks", () => {
    it("should call provider deleteWebhooksByChurchId without logging sensitive data", async () => {
      const mockProvider = {
        deleteWebhooksByChurchId: jest.fn().mockResolvedValue(undefined)
      };

      (GatewayFactory.getProvider as jest.Mock).mockReturnValue(mockProvider);

      const mockGateway = {
        provider: "stripe",
        publicKey: "public_key",
        privateKey: "encrypted_private_key",
        webhookKey: "encrypted_webhook_key",
        productId: "product_id"
      };

      await GatewayService.deleteWebhooks(mockGateway, "church123");

      expect(mockProvider.deleteWebhooksByChurchId).toHaveBeenCalledWith(
        expect.objectContaining({
          publicKey: "public_key",
          privateKey: "decrypted_encrypted_private_key",
          webhookKey: "decrypted_encrypted_webhook_key",
          productId: "product_id"
        }),
        "church123"
      );

      // Verify no console logging occurred
      expect(mockConsoleLog).not.toHaveBeenCalled();
      expect(mockConsoleError).not.toHaveBeenCalled();
      expect(mockConsoleWarn).not.toHaveBeenCalled();
      expect(mockConsoleInfo).not.toHaveBeenCalled();
      expect(mockConsoleDebug).not.toHaveBeenCalled();
    });
  });

  describe("getGatewayForChurch", () => {
    const createRepo = (gateways: any[]) => ({
      loadAll: jest.fn().mockResolvedValue(gateways),
      convertAllToModel: jest.fn((_churchId: string, data: any[]) => data)
    });

    it("should throw when churchId is missing", async () => {
      const repo = createRepo([]);
      await expect(GatewayService.getGatewayForChurch("", {}, repo as any)).rejects.toThrow(
        "churchId is required"
      );
    });

    it("should throw when no gateways are configured", async () => {
      const repo = createRepo([]);
      await expect(GatewayService.getGatewayForChurch("church1", {}, repo as any)).rejects.toThrow(
        "No payment gateway configured"
      );
    });

    it("should return gateway by ID when gatewayId is provided", async () => {
      const gateways = [
        { id: "gateway1", provider: "stripe", environment: "test", settings: { webhookEnabled: true } },
        { id: "gateway2", provider: "paypal", environment: "production", settings: { webhookEnabled: false } }
      ];
      const repo = createRepo(gateways);

      const result = await GatewayService.getGatewayForChurch(
        "church1",
        { gatewayId: "gateway2" },
        repo as any
      );

      expect(result).toMatchObject({ id: "gateway2", provider: "paypal", environment: "production" });
      expect(result.settings).toEqual({ webhookEnabled: false });
    });

    it("should throw when gatewayId is provided but not found", async () => {
      const repo = createRepo([{ id: "gateway1", provider: "stripe", environment: "test" }]);

      await expect(
        GatewayService.getGatewayForChurch("church1", { gatewayId: "missing" }, repo as any)
      ).rejects.toThrow("Gateway missing is not configured");
    });

    it("should return gateway by provider with environment preference", async () => {
      const gateways = [
        { id: "gateway1", provider: "stripe", environment: "test", settings: { webhookEnabled: true } },
        { id: "gateway2", provider: "stripe", environment: "production", settings: { webhookEnabled: false } }
      ];
      const repo = createRepo(gateways);

      const result = await GatewayService.getGatewayForChurch("church1", { provider: "stripe" }, repo as any);

      expect(result).toMatchObject({ id: "gateway2", provider: "stripe", environment: "production" });
    });

    it("should throw when multiple gateways exist for the requested provider", async () => {
      const gateways = [
        { id: "gateway1", provider: "stripe", environment: "production" },
        { id: "gateway2", provider: "stripe", environment: "production" }
      ];
      const repo = createRepo(gateways);

      await expect(
        GatewayService.getGatewayForChurch("church1", { provider: "stripe" }, repo as any)
      ).rejects.toThrow("Multiple stripe payment gateways");
    });

    it("should treat provider lookups case insensitively", async () => {
      const gateways = [
        { id: "gateway1", provider: "Stripe", environment: "sandbox" }
      ];
      const repo = createRepo(gateways);

      const result = await GatewayService.getGatewayForChurch("church1", { provider: "stripe" }, repo as any);
      expect(result).toMatchObject({ id: "gateway1", provider: "Stripe" });
    });

    it("should throw when provider is provided but not found", async () => {
      const repo = createRepo([{ id: "gateway1", provider: "stripe", environment: "test" }]);

      await expect(
        GatewayService.getGatewayForChurch("church1", { provider: "square" }, repo as any)
      ).rejects.toThrow("No square gateway configured");
    });

    it("should prefer production environment by default", async () => {
      const gateways = [
        { id: "gateway1", provider: "stripe", environment: "sandbox" },
        { id: "gateway2", provider: "paypal", environment: "production" }
      ];
      const repo = createRepo(gateways);

      const result = await GatewayService.getGatewayForChurch("church1", {}, repo as any);
      expect(result).toMatchObject({ id: "gateway2", provider: "paypal" });
    });

    it("should throw when multiple gateways share the same priority environment", async () => {
      const gateways = [
        { id: "gateway1", provider: "stripe", environment: "production" },
        { id: "gateway2", provider: "paypal", environment: "production" }
      ];
      const repo = createRepo(gateways);

      await expect(GatewayService.getGatewayForChurch("church1", {}, repo as any)).rejects.toThrow(
        "Multiple payment gateways"
      );
    });
  });

  describe("getProviderCapabilities", () => {
    it("should return correct capabilities for stripe", () => {
      const result = GatewayService.getProviderCapabilities("stripe");

      expect(result).toEqual({
        supportsOneTimePayments: true,
        supportsSubscriptions: true,
        supportsVault: true,
        supportsACH: true,
        supportsRefunds: true,
        supportsPartialRefunds: true,
        supportsWebhooks: true,
        supportsOrders: false,
        supportsInstantCapture: true,
        supportsManualCapture: true,
        supportsSCA: true,
        requiresPlansForSubscriptions: false,
        requiresCustomerForSubscription: true,
        supportedPaymentMethods: ["card", "ach_debit", "link", "apple_pay", "google_pay"],
        supportedCurrencies: ["usd", "eur", "gbp", "cad", "aud", "jpy", "mxn", "nzd", "sgd"],
        maxRefundWindow: 180,
        minTransactionAmount: 50,
        maxTransactionAmount: 99999999,
        notes: ["Supports ACH via Plaid or micro-deposits", "Ideal for card + bank payments"]
      });
    });

    it("should return correct capabilities for paypal", () => {
      const result = GatewayService.getProviderCapabilities("paypal");

      expect(result).toEqual({
        supportsOneTimePayments: true,
        supportsSubscriptions: true,
        supportsVault: true,
        supportsACH: false,
        supportsRefunds: true,
        supportsPartialRefunds: true,
        supportsWebhooks: true,
        supportsOrders: true,
        supportsInstantCapture: true,
        supportsManualCapture: true,
        supportsSCA: true,
        requiresPlansForSubscriptions: true,
        requiresCustomerForSubscription: false,
        supportedPaymentMethods: ["paypal", "card", "venmo", "pay_later"],
        supportedCurrencies: ["usd", "eur", "gbp", "cad", "aud", "jpy", "mxn", "nzd", "sgd"],
        maxRefundWindow: 180,
        minTransactionAmount: 100,
        maxTransactionAmount: 1000000,
        notes: ["Subscriptions require Billing Plans", "Order APIs power PayPal smart buttons"]
      });
    });

    it("should return correct capabilities for square", () => {
      const result = GatewayService.getProviderCapabilities("square");

      expect(result).toEqual({
        supportsOneTimePayments: true,
        supportsSubscriptions: true,
        supportsVault: true,
        supportsACH: true,
        supportsRefunds: true,
        supportsPartialRefunds: true,
        supportsWebhooks: true,
        supportsOrders: false,
        supportsInstantCapture: true,
        supportsManualCapture: true,
        supportsSCA: true,
        requiresPlansForSubscriptions: false,
        requiresCustomerForSubscription: true,
        supportedPaymentMethods: ["card", "apple_pay", "google_pay", "ach_debit", "gift_card"],
        supportedCurrencies: ["usd", "cad", "gbp", "aud", "jpy", "eur"],
        maxRefundWindow: 120,
        minTransactionAmount: 100,
        maxTransactionAmount: 5000000,
        notes: ["ACH support requires Square bank on file", "Subscriptions available with catalog plans"]
      });
    });

    it("should return correct capabilities for epaymints", () => {
      const result = GatewayService.getProviderCapabilities("epaymints");

      expect(result).toEqual({
        supportsOneTimePayments: true,
        supportsSubscriptions: false,
        supportsVault: false,
        supportsACH: true,
        supportsRefunds: true,
        supportsPartialRefunds: false,
        supportsWebhooks: false,
        supportsOrders: false,
        supportsInstantCapture: true,
        supportsManualCapture: false,
        supportsSCA: false,
        requiresPlansForSubscriptions: false,
        requiresCustomerForSubscription: false,
        supportedPaymentMethods: ["card", "ach"],
        supportedCurrencies: ["usd"],
        maxRefundWindow: 90,
        minTransactionAmount: 100,
        maxTransactionAmount: 10000000,
        notes: ["Webhooks limited; polling recommended", "ACH available via tokenised transactions"]
      });
    });

    it("should handle provider names case insensitively", () => {
      const stripeResult = GatewayService.getProviderCapabilities("STRIPE");
      const paypalResult = GatewayService.getProviderCapabilities({ provider: "PayPal" });
      const squareResult = GatewayService.getProviderCapabilities("Square");

      expect(stripeResult).not.toBeNull();
      expect(stripeResult?.supportedPaymentMethods).toContain("card");
      expect(paypalResult).not.toBeNull();
      expect(paypalResult?.supportsOrders).toBe(true);
      expect(squareResult).not.toBeNull();
      expect(squareResult?.supportedPaymentMethods).toContain("gift_card");
    });

    it("should return null for unknown provider", () => {
      const result = GatewayService.getProviderCapabilities("unknown");
      expect(result).toBeNull();
    });

    it("should return null for empty provider", () => {
      const result = GatewayService.getProviderCapabilities("");
      expect(result).toBeNull();
    });
  });

  describe("validateSettings", () => {
    it("should return null when gateway has no settings", () => {
      const gateway = { provider: "stripe" };
      const result = GatewayService.validateSettings(gateway);
      expect(result).toBeNull();
    });

    it("should return null when gateway settings is null", () => {
      const gateway = { provider: "stripe", settings: null };
      const result = GatewayService.validateSettings(gateway);
      expect(result).toBeNull();
    });

    it("should validate stripe settings correctly", () => {
      const gateway = {
        provider: "stripe",
        settings: {
          webhookEnabled: true,
          testMode: false,
          statementDescriptor: "CHURCH DONATION",
          paymentMethodTypes: ["card", "ach_debit"]
        }
      };

      const result = GatewayService.validateSettings(gateway);
      expect(result).toEqual({
        webhookEnabled: true,
        testMode: false,
        statementDescriptor: "CHURCH DONATION",
        paymentMethodTypes: ["card", "ach_debit"]
      });
    });

    it("should validate paypal settings correctly", () => {
      const gateway = {
        provider: "paypal",
        settings: {
          webhookEnabled: true,
          brandName: "My Church",
          landingPage: "LOGIN",
          userAction: "PAY_NOW"
        }
      };

      const result = GatewayService.validateSettings(gateway);
      expect(result).toEqual({
        webhookEnabled: true,
        brandName: "My Church",
        landingPage: "LOGIN",
        userAction: "PAY_NOW"
      });
    });

    it("should validate square settings correctly", () => {
      const gateway = {
        provider: "square",
        settings: {
          webhookEnabled: false,
          locationId: "loc123",
          applicationId: "app456"
        }
      };

      const result = GatewayService.validateSettings(gateway);
      expect(result).toEqual({
        webhookEnabled: false,
        locationId: "loc123",
        applicationId: "app456"
      });
    });

    it("should validate epaymints settings correctly", () => {
      const gateway = {
        provider: "epaymints",
        settings: {
          merchantId: "merchant123",
          terminalId: "term456",
          testMode: true
        }
      };

      const result = GatewayService.validateSettings(gateway);
      expect(result).toEqual({
        merchantId: "merchant123",
        terminalId: "term456",
        testMode: true
      });
    });

    it("should return null for unknown provider", () => {
      const gateway = {
        provider: "unknown",
        settings: { webhookEnabled: true }
      };

      const result = GatewayService.validateSettings(gateway);
      expect(result).toBeNull();
    });

    it("should handle provider names case insensitively", () => {
      const gateway = {
        provider: "STRIPE",
        settings: { webhookEnabled: true }
      };

      const result = GatewayService.validateSettings(gateway);
      expect(result).toEqual({ webhookEnabled: true });
    });

    it("should not log any sensitive information during validation", () => {
      const gateway = {
        provider: "stripe",
        settings: {
          webhookEnabled: true,
          testMode: false,
          statementDescriptor: "SECRET_DESCRIPTOR"
        }
      };

      GatewayService.validateSettings(gateway);

      // Verify no console logging occurred
      expect(mockConsoleLog).not.toHaveBeenCalled();
      expect(mockConsoleError).not.toHaveBeenCalled();
      expect(mockConsoleWarn).not.toHaveBeenCalled();
      expect(mockConsoleInfo).not.toHaveBeenCalled();
      expect(mockConsoleDebug).not.toHaveBeenCalled();
    });
  });
});
