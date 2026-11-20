declare module "@paypal/checkout-server-sdk" {
  namespace paypal {
    namespace core {
      class PayPalHttpClient {
        constructor(environment: LiveEnvironment | SandboxEnvironment);
        execute(request: unknown): Promise<{ statusCode: number; headers: Record<string, string>; result: unknown }>;
      }
      class LiveEnvironment {
        constructor(clientId: string, clientSecret: string);
      }
      class SandboxEnvironment {
        constructor(clientId: string, clientSecret: string);
      }
    }
    namespace orders {
      class OrdersCaptureRequest {
        constructor(orderId: string);
        requestBody(body: unknown): void;
      }
    }
  }
  export = paypal;
}
