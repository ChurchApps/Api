import paypal from "@paypal/checkout-server-sdk";
import express from "express";
import { Donation, DonationBatch, EventLog, FundDonation } from "../../modules/giving/models";

export class PayPalHelper {
  private static getClient(clientId: string, clientSecret: string): paypal.core.PayPalHttpClient {
    const env = process.env.NODE_ENV === "production" ? new paypal.core.LiveEnvironment(clientId, clientSecret) : new paypal.core.SandboxEnvironment(clientId, clientSecret);
    return new paypal.core.PayPalHttpClient(env);
  }

  static async createWebhookEndpoint(clientId: string, clientSecret: string, webHookUrl: string): Promise<{ id: string }> {
    const client = PayPalHelper.getClient(clientId, clientSecret);
    const request = new paypal.notifications.WebhookCreateRequest();
    request.requestBody({
      url: webHookUrl,
      event_types: [{ name: "PAYMENT.CAPTURE.COMPLETED" }, { name: "BILLING.SUBSCRIPTION.ACTIVATED" }, { name: "BILLING.SUBSCRIPTION.CANCELLED" }]
    });
    const response = await client.execute(request);
    return response.result;
  }

  static async deleteWebhooksByChurchId(clientId: string, clientSecret: string, churchId: string): Promise<void> {
    const client = PayPalHelper.getClient(clientId, clientSecret);
    const listReq = new paypal.notifications.WebhookListRequest();
    const listRes = await client.execute(listReq);
    const hooks = listRes.result.webhooks || [];
    await Promise.all(
      hooks.map(async (hook: any) => {
        if (hook.url.includes(churchId)) {
          const delReq = new paypal.notifications.WebhookDeleteRequest(hook.id);
          await client.execute(delReq);
        }
      })
    );
  }

  static async verifySignature(clientId: string, clientSecret: string, webhookId: string, headers: express.Request["headers"], body: any): Promise<any> {
    const client = PayPalHelper.getClient(clientId, clientSecret);
    const request = new paypal.notifications.VerifyWebhookSignatureRequest();
    request.requestBody({
      auth_algo: headers["paypal-auth-algo"],
      cert_url: headers["paypal-cert-url"],
      transmission_id: headers["paypal-transmission-id"],
      transmission_sig: headers["paypal-transmission-sig"],
      transmission_time: headers["paypal-transmission-time"],
      webhook_id: webhookId,
      webhook_event: body
    });
    const response = await client.execute(request);
    if (response.result.verification_status !== "SUCCESS") {
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

  static async cancelSubscription(clientId: string, clientSecret: string, subscriptionId: string, reason?: string): Promise<any> {
    const client = PayPalHelper.getClient(clientId, clientSecret);
    const request = new paypal.subscriptions.SubscriptionsCancelRequest(subscriptionId);
    request.requestBody({
      reason: reason || "Customer requested cancellation"
    });
    const response = await client.execute(request);
    return response.result;
  }

  static async logEvent(churchId: string, payPalEvent: any, eventData: any, givingRepositories: any) {
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
    return givingRepositories.eventLog.create(eventLog);
  }

  static async logDonation(clientId: string, clientSecret: string, churchId: string, eventData: any, givingRepositories: any) {
    const amount = parseFloat(eventData.amount?.value ?? eventData.purchase_units?.[0]?.amount?.value ?? "0");
    const payerId = eventData.payer?.payer_id || eventData.subscriber?.payer_id || "";
    const customerData = (await givingRepositories.customer.load(churchId, payerId)) as any;
    const personId = customerData?.personId;
    const batch: DonationBatch = await givingRepositories.donationBatch.getOrCreateCurrent(churchId);
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
    const donation = await givingRepositories.donation.save(donationData);
    const funds: FundDonation[] = [];
    (eventData.custom_id ? JSON.parse(eventData.custom_id) : []).forEach((f: FundDonation) => {
      funds.push({ churchId, donationId: donation.id, fundId: f.id, amount: f.amount });
    });
    const promises: Promise<FundDonation>[] = [];
    funds.forEach((fd) => promises.push(givingRepositories.fundDonation.save(fd)));
    return Promise.all(promises);
  }
}
