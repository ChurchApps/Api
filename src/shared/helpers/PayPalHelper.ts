import paypal from "@paypal/checkout-server-sdk";
import express from "express";
import { Donation, DonationBatch, EventLog, FundDonation } from "../../modules/giving/models";
import { Environment } from "./Environment";

export class PayPalHelper {
  private static getClient(clientId: string, clientSecret: string): paypal.core.PayPalHttpClient {
    const env = process.env.NODE_ENV === "production" ? new paypal.core.LiveEnvironment(clientId, clientSecret) : new paypal.core.SandboxEnvironment(clientId, clientSecret);
    return new paypal.core.PayPalHttpClient(env);
  }

  private static getBaseUrl(): string {
    return Environment.apiEnv === "production" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
  }

  private static async getAccessToken(clientId: string, clientSecret: string): Promise<string> {
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

    const response = await fetch(`${PayPalHelper.getBaseUrl()}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: "grant_type=client_credentials"
    });

    if (!response.ok) {
      throw new Error(`Failed to get PayPal access token: ${response.status}`);
    }

    const data = await response.json();
    return data.access_token;
  }

  static async generateClientToken(clientId: string, clientSecret: string): Promise<string> {
    const accessToken = await PayPalHelper.getAccessToken(clientId, clientSecret);
    const response = await fetch(`${PayPalHelper.getBaseUrl()}/v1/identity/generate-token`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({})
    });

    if (!response.ok) {
      throw new Error(`Failed to generate PayPal client token: ${response.status}`);
    }

    const result = await response.json();
    return result.client_token;
  }

  static async createOrder(clientId: string, clientSecret: string, params: { amount: number; currency?: string; description?: string; customId?: string }): Promise<any> {
    const accessToken = await PayPalHelper.getAccessToken(clientId, clientSecret);
    const currency = (params.currency || "USD").toUpperCase();
    const body = {
      intent: "CAPTURE",
      purchase_units: [
        {
          amount: { currency_code: currency, value: params.amount.toFixed(2) },
          description: params.description || "Donation",
          ...(params.customId ? { custom_id: params.customId } : {})
        }
      ],
      application_context: { shipping_preference: "NO_SHIPPING", user_action: "PAY_NOW" }
    } as any;

    const response = await fetch(`${PayPalHelper.getBaseUrl()}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to create PayPal order: ${response.status} ${text}`);
    }

    return response.json();
  }

  static async createWebhookEndpoint(clientId: string, clientSecret: string, webHookUrl: string): Promise<{ id: string }> {
    const accessToken = await PayPalHelper.getAccessToken(clientId, clientSecret);

    const response = await fetch(`${PayPalHelper.getBaseUrl()}/v1/notifications/webhooks`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        url: webHookUrl,
        event_types: [{ name: "PAYMENT.CAPTURE.COMPLETED" }, { name: "BILLING.SUBSCRIPTION.ACTIVATED" }, { name: "BILLING.SUBSCRIPTION.CANCELLED" }]
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to create PayPal webhook: ${response.status}`);
    }

    const result = await response.json();
    return { id: result.id };
  }

  static async deleteWebhooksByChurchId(clientId: string, clientSecret: string, churchId: string): Promise<void> {
    console.log("ClientId", clientId);
    console.log("ClientSecret", clientSecret);
    const accessToken = await PayPalHelper.getAccessToken(clientId, clientSecret);

    // Get list of webhooks using REST API
    console.log("Getting list", `${PayPalHelper.getBaseUrl()}/v1/notifications/webhooks?anchor_type=APPLICATION`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      }
    });

    const listResponse = await fetch(`${PayPalHelper.getBaseUrl()}/v1/notifications/webhooks?anchor_type=APPLICATION`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      }
    });

    if (!listResponse.ok) {
      throw new Error(`Failed to list webhooks: ${listResponse.status}`);
    }

    const data = await listResponse.json();
    const hooks = data.webhooks || [];

    // Delete webhooks that contain the churchId
    await Promise.all(
      hooks.map(async (hook: any) => {
        if (hook.url && hook.url.includes(churchId)) {
          const deleteResponse = await fetch(`${PayPalHelper.getBaseUrl()}/v1/notifications/webhooks/${hook.id}`, {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json"
            }
          });

          if (!deleteResponse.ok) {
            console.error(`Failed to delete webhook ${hook.id}: ${deleteResponse.status}`);
          }
        }
      })
    );
  }

  static async verifySignature(clientId: string, clientSecret: string, webhookId: string, headers: express.Request["headers"], body: any): Promise<any> {
    const accessToken = await PayPalHelper.getAccessToken(clientId, clientSecret);

    const response = await fetch(`${PayPalHelper.getBaseUrl()}/v1/notifications/verify-webhook-signature`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        auth_algo: headers["paypal-auth-algo"],
        cert_url: headers["paypal-cert-url"],
        transmission_id: headers["paypal-transmission-id"],
        transmission_sig: headers["paypal-transmission-sig"],
        transmission_time: headers["paypal-transmission-time"],
        webhook_id: webhookId,
        webhook_event: body
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to verify PayPal webhook signature: ${response.status}`);
    }

    const result = await response.json();
    if (result.verification_status !== "SUCCESS") {
      throw new Error("Invalid PayPal webhook signature");
    }
    return body;
  }

  static async captureOrder(clientId: string, clientSecret: string, orderId: string): Promise<any> {
    const client = PayPalHelper.getClient(clientId, clientSecret);
    const request = new paypal.orders.OrdersCaptureRequest(orderId);
    request.requestBody({});
    const response = await client.execute(request);
    return response.result;
  }

  static async getSubscriptionDetails(clientId: string, clientSecret: string, subscriptionId: string): Promise<any> {
    const client = PayPalHelper.getClient(clientId, clientSecret);
    const request = new paypal.subscriptions.SubscriptionsGetRequest(subscriptionId);
    const response = await client.execute(request);
    return response.result;
  }

  static async updateSubscription(clientId: string, clientSecret: string, subscriptionData: any): Promise<any> {
    const accessToken = await PayPalHelper.getAccessToken(clientId, clientSecret);
    const baseUrl = PayPalHelper.getBaseUrl();

    // Build patch operations based on what needs to be updated
    const patchOps = [];

    // Update plan if provided
    if (subscriptionData.planId) {
      patchOps.push({
        op: "replace",
        path: "/plan_id",
        value: subscriptionData.planId
      });
    }

    // Update quantity if provided
    if (subscriptionData.quantity) {
      patchOps.push({
        op: "replace",
        path: "/quantity",
        value: subscriptionData.quantity.toString()
      });
    }

    // Update shipping amount if provided
    if (subscriptionData.shippingAmount) {
      patchOps.push({
        op: "replace",
        path: "/shipping_amount",
        value: {
          currency_code: subscriptionData.currency || "USD",
          value: subscriptionData.shippingAmount.toString()
        }
      });
    }

    // Update custom ID if provided
    if (subscriptionData.customId) {
      patchOps.push({
        op: "replace",
        path: "/custom_id",
        value: subscriptionData.customId
      });
    }

    // If no updates, just return the current subscription details
    if (patchOps.length === 0) {
      return await PayPalHelper.getSubscriptionDetails(clientId, clientSecret, subscriptionData.id);
    }

    const _response = await fetch(
      `${baseUrl}/v1/billing/subscriptions/${subscriptionData.id}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(patchOps)
      }
    );

    // After update, fetch and return the updated subscription details
    return await PayPalHelper.getSubscriptionDetails(clientId, clientSecret, subscriptionData.id);
  }

  static async cancelSubscription(clientId: string, clientSecret: string, subscriptionId: string, reason?: string): Promise<any> {
    const client = PayPalHelper.getClient(clientId, clientSecret);
    const request = new paypal.subscriptions.SubscriptionsCancelRequest(subscriptionId);
    request.requestBody({
      reason: reason || "Customer requested cancellation"
    });
    const response = await client.execute(request);
    return response.result;
  }

  static async logEvent(churchId: string, payPalEvent: any, eventData: any, givingRepos: any) {
    const { id: eventId, event_type: eventType, create_time: createTime } = payPalEvent;
    const status = eventData.status || eventType;
    const message = eventData.status || "";
    const eventLog: EventLog = {
      id: eventId,
      churchId,
      customerId: eventData.subscriber?.payer_id || eventData.payer?.payer_id || "",
      provider: "PayPal",
      eventType,
      status,
      message,
      created: new Date(createTime)
    };
    return givingRepos.eventLog.create(eventLog);
  }

  static async logDonation(clientId: string, clientSecret: string, churchId: string, eventData: any, givingRepos: any) {
    const amount = parseFloat(eventData.amount?.value ?? eventData.purchase_units?.[0]?.amount?.value ?? "0");
    const payerId = eventData.payer?.payer_id || eventData.subscriber?.payer_id || "";
    const customerData = (await givingRepos.customer.load(churchId, payerId)) as any;
    const personId = customerData?.personId;
    const batch: DonationBatch = await givingRepos.donationBatch.getOrCreateCurrent(churchId);
    const donationData: Donation = {
      batchId: batch.id,
      amount,
      churchId,
      personId,
      method: "PayPal",
      methodDetails: eventData.id,
      donationDate: new Date(eventData.create_time),
      notes: eventData.custom_id || ""
    };
    const donation = await givingRepos.donation.save(donationData);
    const funds: FundDonation[] = [];
    (eventData.custom_id ? JSON.parse(eventData.custom_id) : []).forEach((f: FundDonation) => {
      funds.push({ churchId, donationId: donation.id, fundId: f.id, amount: f.amount });
    });
    const promises: Promise<FundDonation>[] = [];
    funds.forEach((fd) => promises.push(givingRepos.fundDonation.save(fd)));
    return Promise.all(promises);
  }
}
