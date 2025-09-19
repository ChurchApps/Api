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
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation();
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation();
const mockConsoleWarn = jest.spyOn(console, 'warn').mockImplementation();
const mockConsoleInfo = jest.spyOn(console, 'info').mockImplementation();
const mockConsoleDebug = jest.spyOn(console, 'debug').mockImplementation();

describe('GatewayService', () => {
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

  describe('getGatewayConfig', () => {
    it('should return decrypted gateway configuration', () => {
      const mockGateway = {
        publicKey: 'public_test_key',
        privateKey: 'encrypted_private_key',
        webhookKey: 'encrypted_webhook_key',
        productId: 'test_product_id'
      };

      const result = GatewayService.getGatewayConfig(mockGateway);

      expect(result).toEqual({
        publicKey: 'public_test_key',
        privateKey: 'decrypted_encrypted_private_key',
        webhookKey: 'decrypted_encrypted_webhook_key',
        productId: 'test_product_id'
      });

      expect(EncryptionHelper.decrypt).toHaveBeenCalledWith('encrypted_private_key');
      expect(EncryptionHelper.decrypt).toHaveBeenCalledWith('encrypted_webhook_key');
    });

    it('should not log any sensitive information', () => {
      const mockGateway = {
        publicKey: 'public_test_key',
        privateKey: 'encrypted_private_key',
        webhookKey: 'encrypted_webhook_key',
        productId: 'test_product_id'
      };

      GatewayService.getGatewayConfig(mockGateway);

      // Verify no console logging occurred
      expect(mockConsoleLog).not.toHaveBeenCalled();
      expect(mockConsoleError).not.toHaveBeenCalled();
      expect(mockConsoleWarn).not.toHaveBeenCalled();
      expect(mockConsoleInfo).not.toHaveBeenCalled();
      expect(mockConsoleDebug).not.toHaveBeenCalled();
    });

    it('should not log private keys, secrets, or configuration objects', () => {
      const mockGateway = {
        publicKey: 'public_test_key',
        privateKey: 'secret_private_key',
        webhookKey: 'secret_webhook_key',
        productId: 'test_product_id'
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
        const callString = call.join(' ');
        expect(callString).not.toContain('secret_private_key');
        expect(callString).not.toContain('secret_webhook_key');
        expect(callString).not.toContain('decrypted_');
        expect(callString.toLowerCase()).not.toContain('privatekey');
        expect(callString.toLowerCase()).not.toContain('webhookkey');
        expect(callString.toLowerCase()).not.toContain('config');
      });
    });
  });

  describe('deleteWebhooks', () => {
    it('should call provider deleteWebhooksByChurchId without logging sensitive data', async () => {
      const mockProvider = {
        deleteWebhooksByChurchId: jest.fn().mockResolvedValue(undefined)
      };

      (GatewayFactory.getProvider as jest.Mock).mockReturnValue(mockProvider);

      const mockGateway = {
        provider: 'stripe',
        publicKey: 'public_key',
        privateKey: 'encrypted_private_key',
        webhookKey: 'encrypted_webhook_key',
        productId: 'product_id'
      };

      await GatewayService.deleteWebhooks(mockGateway, 'church123');

      expect(mockProvider.deleteWebhooksByChurchId).toHaveBeenCalledWith(
        expect.objectContaining({
          publicKey: 'public_key',
          privateKey: 'decrypted_encrypted_private_key',
          webhookKey: 'decrypted_encrypted_webhook_key',
          productId: 'product_id'
        }),
        'church123'
      );

      // Verify no console logging occurred
      expect(mockConsoleLog).not.toHaveBeenCalled();
      expect(mockConsoleError).not.toHaveBeenCalled();
      expect(mockConsoleWarn).not.toHaveBeenCalled();
      expect(mockConsoleInfo).not.toHaveBeenCalled();
      expect(mockConsoleDebug).not.toHaveBeenCalled();
    });
  });
});