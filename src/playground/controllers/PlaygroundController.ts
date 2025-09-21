import { Request, Response } from "express";
import { controller, httpPost, httpGet } from "inversify-express-utils";
import { GivingBaseController } from "../../modules/giving/controllers/GivingBaseController";
import { IGatewayProvider, GatewayConfig } from "../../shared/helpers/gateways/IGatewayProvider";
import { StripeGatewayProvider } from "../../shared/helpers/gateways/StripeGatewayProvider";
import { PayPalGatewayProvider } from "../../shared/helpers/gateways/PayPalGatewayProvider";
import { SquareGatewayProvider } from "../../shared/helpers/gateways/SquareGatewayProvider";
import { EPayMintsGatewayProvider } from "../../shared/helpers/gateways/EPayMintsGatewayProvider";
import { Environment } from "../../shared/helpers/Environment";

@controller("/playground")
export class PlaygroundController extends GivingBaseController {

  // Middleware to check if playground is allowed
  private isPlaygroundEnabled(): boolean {
    // Only enable playground in development environment
    const env = Environment.currentEnvironment || process.env.ENVIRONMENT || "dev";
    return env === "dev" || env === "development" || env === "local";
  }

  private sendDisabledResponse(res: Response): void {
    res.status(403).json({
      error: "Playground is only available in development environment",
      currentEnvironment: Environment.currentEnvironment || process.env.ENVIRONMENT
    });
  }

  // Serve the playground HTML page
  @httpGet("/")
  public async getPlaygroundPage(req: Request, res: Response): Promise<void> {
    if (!this.isPlaygroundEnabled()) {
      return this.sendDisabledResponse(res);
    }

    const fs = await import("fs");
    const path = await import("path");

    try {
      const htmlPath = path.join(__dirname, "../index.html");
      const htmlContent = fs.readFileSync(htmlPath, "utf8");
      res.setHeader("Content-Type", "text/html");
      res.send(htmlContent);
    } catch (error) {
      res.status(404).json({ error: "Playground page not found" });
    }
  }

  // Serve the compiled playground JavaScript file
  @httpGet("/playground.js")
  public async getPlaygroundJS(req: Request, res: Response): Promise<void> {
    if (!this.isPlaygroundEnabled()) {
      return this.sendDisabledResponse(res);
    }

    const fs = await import("fs");
    const path = await import("path");

    try {
      // Try to serve the compiled TypeScript output first
      const compiledPath = path.join(__dirname, "../dist/playground.js");
      if (fs.existsSync(compiledPath)) {
        const jsContent = fs.readFileSync(compiledPath, "utf8");
        res.setHeader("Content-Type", "application/javascript");
        res.send(jsContent);
      } else {
        // Fall back to the original JavaScript file if TypeScript not compiled
        const jsPath = path.join(__dirname, "../playground.js");
        const jsContent = fs.readFileSync(jsPath, "utf8");
        res.setHeader("Content-Type", "application/javascript");
        res.send(jsContent);
      }
    } catch (error) {
      res.status(404).json({ error: "Playground script not found" });
    }
  }

  // Serve the source map for debugging
  @httpGet("/playground.js.map")
  public async getPlaygroundSourceMap(req: Request, res: Response): Promise<void> {
    if (!this.isPlaygroundEnabled()) {
      return this.sendDisabledResponse(res);
    }

    const fs = await import("fs");
    const path = await import("path");

    try {
      const mapPath = path.join(__dirname, "../dist/playground.js.map");
      const mapContent = fs.readFileSync(mapPath, "utf8");
      res.setHeader("Content-Type", "application/json");
      res.send(mapContent);
    } catch (error) {
      res.status(404).json({ error: "Source map not found" });
    }
  }

  // Gateway testing endpoints
  @httpPost("/gateway/calculate-fees")
  public async testCalculateFees(req: Request, res: Response): Promise<any> {
    if (!this.isPlaygroundEnabled()) {
      return this.sendDisabledResponse(res);
    }

    try {
      const { provider, config, amount } = req.body;
      const gatewayProvider = this.getGatewayProvider(provider);

      const result = await gatewayProvider.calculateFees(amount, config.churchId);

      return res.json({
        success: true,
        method: "calculateFees",
        provider,
        input: { amount, churchId: config.churchId },
        result: { fees: result, total: amount + result }
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: (error as Error).message
      });
    }
  }

  @httpPost("/gateway/process-charge")
  public async testProcessCharge(req: Request, res: Response): Promise<any> {
    if (!this.isPlaygroundEnabled()) {
      return this.sendDisabledResponse(res);
    }

    try {
      const { provider, config, donationData } = req.body;
      const gatewayProvider = this.getGatewayProvider(provider);

      const result = await gatewayProvider.processCharge(config, donationData);

      return res.json({
        success: true,
        method: "processCharge",
        provider,
        input: donationData,
        result
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: (error as Error).message
      });
    }
  }

  @httpPost("/gateway/create-customer")
  public async testCreateCustomer(req: Request, res: Response): Promise<any> {
    if (!this.isPlaygroundEnabled()) {
      return this.sendDisabledResponse(res);
    }

    try {
      const { provider, config, email, name } = req.body;
      const gatewayProvider = this.getGatewayProvider(provider);

      if (!gatewayProvider.createCustomer) {
        throw new Error(`${provider} provider does not support createCustomer method`);
      }

      const result = await gatewayProvider.createCustomer(config, email, name);

      return res.json({
        success: true,
        method: "createCustomer",
        provider,
        input: { email, name },
        result: { customerId: result }
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: (error as Error).message
      });
    }
  }

  @httpPost("/gateway/create-subscription")
  public async testCreateSubscription(req: Request, res: Response): Promise<any> {
    if (!this.isPlaygroundEnabled()) {
      return this.sendDisabledResponse(res);
    }

    try {
      const { provider, config, subscriptionData } = req.body;
      const gatewayProvider = this.getGatewayProvider(provider);

      const result = await gatewayProvider.createSubscription(config, subscriptionData);

      return res.json({
        success: true,
        method: "createSubscription",
        provider,
        input: subscriptionData,
        result
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: (error as Error).message
      });
    }
  }

  @httpPost("/gateway/generate-client-token")
  public async testGenerateClientToken(req: Request, res: Response): Promise<any> {
    if (!this.isPlaygroundEnabled()) {
      return this.sendDisabledResponse(res);
    }

    try {
      const { provider, config } = req.body;
      const gatewayProvider = this.getGatewayProvider(provider);

      if (!gatewayProvider.generateClientToken) {
        throw new Error(`${provider} provider does not support generateClientToken method`);
      }

      const result = await gatewayProvider.generateClientToken(config);

      return res.json({
        success: true,
        method: "generateClientToken",
        provider,
        result: { clientToken: result }
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: (error as Error).message
      });
    }
  }

  @httpPost("/gateway/create-webhook")
  public async testCreateWebhook(req: Request, res: Response): Promise<any> {
    if (!this.isPlaygroundEnabled()) {
      return this.sendDisabledResponse(res);
    }

    try {
      const { provider, config, webhookUrl } = req.body;
      const gatewayProvider = this.getGatewayProvider(provider);

      const result = await gatewayProvider.createWebhookEndpoint(config, webhookUrl);

      return res.json({
        success: true,
        method: "createWebhookEndpoint",
        provider,
        input: { webhookUrl },
        result
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: (error as Error).message
      });
    }
  }

  @httpPost("/gateway/update-subscription")
  public async testUpdateSubscription(req: Request, res: Response): Promise<any> {
    if (!this.isPlaygroundEnabled()) {
      return this.sendDisabledResponse(res);
    }

    try {
      const { provider, config, subscriptionData } = req.body;
      const gatewayProvider = this.getGatewayProvider(provider);

      const result = await gatewayProvider.updateSubscription(config, subscriptionData);

      return res.json({
        success: true,
        method: "updateSubscription",
        provider,
        input: subscriptionData,
        result
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: (error as Error).message
      });
    }
  }

  @httpPost("/gateway/cancel-subscription")
  public async testCancelSubscription(req: Request, res: Response): Promise<any> {
    if (!this.isPlaygroundEnabled()) {
      return this.sendDisabledResponse(res);
    }

    try {
      const { provider, config, subscriptionId, reason } = req.body;
      const gatewayProvider = this.getGatewayProvider(provider);

      await gatewayProvider.cancelSubscription(config, subscriptionId, reason);

      return res.json({
        success: true,
        method: "cancelSubscription",
        provider,
        input: { subscriptionId, reason },
        result: { message: "Subscription cancelled successfully" }
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: (error as Error).message
      });
    }
  }

  @httpPost("/gateway/create-product")
  public async testCreateProduct(req: Request, res: Response): Promise<any> {
    if (!this.isPlaygroundEnabled()) {
      return this.sendDisabledResponse(res);
    }

    try {
      const { provider, config } = req.body;
      const gatewayProvider = this.getGatewayProvider(provider);

      if (!gatewayProvider.createProduct) {
        throw new Error(`${provider} provider does not support createProduct method`);
      }

      const result = await gatewayProvider.createProduct(config, config.churchId);

      return res.json({
        success: true,
        method: "createProduct",
        provider,
        input: { churchId: config.churchId },
        result: { productId: result }
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: (error as Error).message
      });
    }
  }

  @httpPost("/gateway/get-customer-payment-methods")
  public async testGetCustomerPaymentMethods(req: Request, res: Response): Promise<any> {
    if (!this.isPlaygroundEnabled()) {
      return this.sendDisabledResponse(res);
    }

    try {
      const { provider, config, customer } = req.body;
      const gatewayProvider = this.getGatewayProvider(provider);

      if (!gatewayProvider.getCustomerPaymentMethods) {
        throw new Error(`${provider} provider does not support getCustomerPaymentMethods method`);
      }

      const result = await gatewayProvider.getCustomerPaymentMethods(config, customer);

      return res.json({
        success: true,
        method: "getCustomerPaymentMethods",
        provider,
        input: { customer },
        result
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: (error as Error).message
      });
    }
  }

  @httpPost("/gateway/attach-payment-method")
  public async testAttachPaymentMethod(req: Request, res: Response): Promise<any> {
    if (!this.isPlaygroundEnabled()) {
      return this.sendDisabledResponse(res);
    }

    try {
      const { provider, config, paymentMethodId, options } = req.body;
      const gatewayProvider = this.getGatewayProvider(provider);

      if (!gatewayProvider.attachPaymentMethod) {
        throw new Error(`${provider} provider does not support attachPaymentMethod method`);
      }

      const result = await gatewayProvider.attachPaymentMethod(config, paymentMethodId, options);

      return res.json({
        success: true,
        method: "attachPaymentMethod",
        provider,
        input: { paymentMethodId, options },
        result
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: (error as Error).message
      });
    }
  }

  @httpPost("/gateway/detach-payment-method")
  public async testDetachPaymentMethod(req: Request, res: Response): Promise<any> {
    if (!this.isPlaygroundEnabled()) {
      return this.sendDisabledResponse(res);
    }

    try {
      const { provider, config, paymentMethodId } = req.body;
      const gatewayProvider = this.getGatewayProvider(provider);

      if (!gatewayProvider.detachPaymentMethod) {
        throw new Error(`${provider} provider does not support detachPaymentMethod method`);
      }

      const result = await gatewayProvider.detachPaymentMethod(config, paymentMethodId);

      return res.json({
        success: true,
        method: "detachPaymentMethod",
        provider,
        input: { paymentMethodId },
        result
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: (error as Error).message
      });
    }
  }

  @httpPost("/gateway/create-bank-account")
  public async testCreateBankAccount(req: Request, res: Response): Promise<any> {
    if (!this.isPlaygroundEnabled()) {
      return this.sendDisabledResponse(res);
    }

    try {
      const { provider, config, customerId, options } = req.body;
      const gatewayProvider = this.getGatewayProvider(provider);

      if (!gatewayProvider.createBankAccount) {
        throw new Error(`${provider} provider does not support createBankAccount method`);
      }

      const result = await gatewayProvider.createBankAccount(config, customerId, options);

      return res.json({
        success: true,
        method: "createBankAccount",
        provider,
        input: { customerId, options },
        result
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: (error as Error).message
      });
    }
  }

  @httpPost("/gateway/update-card")
  public async testUpdateCard(req: Request, res: Response): Promise<any> {
    if (!this.isPlaygroundEnabled()) {
      return this.sendDisabledResponse(res);
    }

    try {
      const { provider, config, paymentMethodId, cardData } = req.body;
      const gatewayProvider = this.getGatewayProvider(provider);

      if (!gatewayProvider.updateCard) {
        throw new Error(`${provider} provider does not support updateCard method`);
      }

      const result = await gatewayProvider.updateCard(config, paymentMethodId, cardData);

      return res.json({
        success: true,
        method: "updateCard",
        provider,
        input: { paymentMethodId, cardData },
        result
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: (error as Error).message
      });
    }
  }

  @httpPost("/gateway/add-card")
  public async testAddCard(req: Request, res: Response): Promise<any> {
    if (!this.isPlaygroundEnabled()) {
      return this.sendDisabledResponse(res);
    }

    try {
      const { provider, config, customerId, cardData } = req.body;
      const gatewayProvider = this.getGatewayProvider(provider);

      if (!gatewayProvider.addCard) {
        throw new Error(`${provider} provider does not support addCard method`);
      }

      const result = await gatewayProvider.addCard(config, customerId, cardData);

      return res.json({
        success: true,
        method: "addCard",
        provider,
        input: { customerId, cardData },
        result
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: (error as Error).message
      });
    }
  }

  @httpPost("/gateway/get-charge")
  public async testGetCharge(req: Request, res: Response): Promise<any> {
    if (!this.isPlaygroundEnabled()) {
      return this.sendDisabledResponse(res);
    }

    try {
      const { provider, config, chargeId } = req.body;
      const gatewayProvider = this.getGatewayProvider(provider);

      if (!gatewayProvider.getCharge) {
        throw new Error(`${provider} provider does not support getCharge method`);
      }

      const result = await gatewayProvider.getCharge(config, chargeId);

      return res.json({
        success: true,
        method: "getCharge",
        provider,
        input: { chargeId },
        result
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: (error as Error).message
      });
    }
  }

  @httpGet("/gateway/providers")
  public async getAvailableProviders(req: Request, res: Response): Promise<any> {
    if (!this.isPlaygroundEnabled()) {
      return this.sendDisabledResponse(res);
    }

    return res.json({
      success: true,
      providers: [
        {
          name: "stripe",
          displayName: "Stripe",
          supportedMethods: [
            "calculateFees", "processCharge", "createSubscription", "updateSubscription",
            "cancelSubscription", "createCustomer", "createWebhookEndpoint",
            "getCustomerSubscriptions", "getCustomerPaymentMethods", "attachPaymentMethod",
            "detachPaymentMethod", "updateCard", "createBankAccount", "updateBank",
            "verifyBank", "deleteBankAccount", "createProduct"
          ]
        },
        {
          name: "paypal",
          displayName: "PayPal",
          supportedMethods: [
            "calculateFees", "processCharge", "createSubscription", "updateSubscription",
            "cancelSubscription", "createWebhookEndpoint", "generateClientToken",
            "createOrder", "createSubscriptionPlan", "createSubscriptionWithPlan"
          ]
        },
        {
          name: "square",
          displayName: "Square",
          supportedMethods: [
            "calculateFees", "processCharge", "createSubscription", "updateSubscription",
            "cancelSubscription", "createCustomer", "createWebhookEndpoint"
          ]
        },
        {
          name: "epaymints",
          displayName: "EPayMints",
          supportedMethods: [
            "calculateFees", "processCharge", "createSubscription", "updateSubscription",
            "cancelSubscription", "createWebhookEndpoint"
          ]
        }
      ]
    });
  }

  private getGatewayProvider(provider: string): IGatewayProvider {
    switch (provider.toLowerCase()) {
      case "stripe":
        return new StripeGatewayProvider();
      case "paypal":
        return new PayPalGatewayProvider();
      case "square":
        return new SquareGatewayProvider();
      case "epaymints":
        return new EPayMintsGatewayProvider();
      default:
        throw new Error(`Unsupported gateway provider: ${provider}`);
    }
  }
}