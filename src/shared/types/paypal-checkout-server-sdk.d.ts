declare module "@paypal/checkout-server-sdk" {
  namespace paypal {
    namespace core {
      class PayPalHttpClient {
        constructor(environment: LiveEnvironment | SandboxEnvironment);
        execute(request: unknown): Promise<any>;
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
    namespace subscriptions {
      class SubscriptionsGetRequest {
        constructor(subscriptionId: string);
      }
      class SubscriptionsCancelRequest {
        constructor(subscriptionId: string);
        requestBody(body: unknown): void;
      }
    }
  }
  export = paypal;
}
