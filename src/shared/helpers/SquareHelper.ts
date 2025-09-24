// TODO: Install Square SDK with: npm install squareup
// import { Client, ApiResponse, CreatePaymentRequest, Money, Card } from 'squareup';

import { Donation, DonationBatch, EventLog, FundDonation } from "../../modules/giving/models";

export class SquareHelper {
  private static getClient(_accessToken: string, _environment: string) {
    // TODO: Implement when Square SDK is installed
    // const isProduction = environment === 'production';
    // return new Client({
    //   accessToken,
    //   environment: isProduction ? Environment.Production : Environment.Sandbox
    // });
    throw new Error("Square SDK not installed. Run: npm install squareup");
  }

  private static getBaseUrl(environment: string): string {
    return environment === "production"
      ? "https://connect.squareup.com"
      : "https://connect.squareupsandbox.com";
  }

  // Customer Management
  static async createCustomer(_accessToken: string, _environment: string, _customerData: {
    email?: string;
    name?: { givenName?: string; familyName?: string };
    phoneNumber?: string;
  }): Promise<string> {
    try {
      // TODO: Implement with Square SDK
      // const client = SquareHelper.getClient(accessToken, environment);
      // const customersApi = client.customersApi;
      //
      // const request = {
      //   emailAddress: customerData.email,
      //   givenName: customerData.name?.givenName,
      //   familyName: customerData.name?.familyName,
      //   phoneNumber: customerData.phoneNumber
      // };
      //
      // const response = await customersApi.createCustomer(request);
      // return response.result.customer?.id || '';

      // Mock implementation for now
      return `sq_customer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    } catch (error) {
      throw new Error(`Failed to create Square customer: ${error}`);
    }
  }

  static async getCustomer(_accessToken: string, _environment: string, customerId: string): Promise<any> {
    try {
      // TODO: Implement with Square SDK
      // const client = SquareHelper.getClient(accessToken, environment);
      // const customersApi = client.customersApi;
      // const response = await customersApi.retrieveCustomer(customerId);
      // return response.result.customer;

      return { id: customerId, emailAddress: "test@example.com" };
    } catch (error) {
      throw new Error(`Failed to retrieve Square customer: ${error}`);
    }
  }

  // Payment Methods (Cards)
  static async createCard(accessToken: string, environment: string, cardData: {
    customerId: string;
    cardNonce: string;
    billingAddress?: any;
    cardholderName?: string;
  }): Promise<any> {
    try {
      // TODO: Implement with Square SDK
      // const client = SquareHelper.getClient(accessToken, environment);
      // const cardsApi = client.cardsApi;
      //
      // const request = {
      //   sourceId: cardData.cardNonce,
      //   card: {
      //     customerId: cardData.customerId,
      //     billingAddress: cardData.billingAddress,
      //     cardholderName: cardData.cardholderName
      //   }
      // };
      //
      // const response = await cardsApi.createCard(request);
      // return response.result.card;

      return {
        id: `sq_card_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        customerId: cardData.customerId,
        last4: "1234",
        expMonth: 12,
        expYear: 2025,
        cardBrand: "VISA"
      };
    } catch (error) {
      throw new Error(`Failed to create Square card: ${error}`);
    }
  }

  static async listCards(_accessToken: string, _environment: string, _customerId: string): Promise<any[]> {
    try {
      // TODO: Implement with Square SDK
      // const client = SquareHelper.getClient(accessToken, environment);
      // const cardsApi = client.cardsApi;
      // const response = await cardsApi.listCards(undefined, customerId);
      // return response.result.cards || [];

      return [];
    } catch (error) {
      throw new Error(`Failed to list Square cards: ${error}`);
    }
  }

  static async deleteCard(_accessToken: string, _environment: string, _cardId: string): Promise<void> {
    try {
      // TODO: Implement with Square SDK
      // const client = SquareHelper.getClient(accessToken, environment);
      // const cardsApi = client.cardsApi;
      // await cardsApi.disableCard(cardId);
    } catch (error) {
      throw new Error(`Failed to delete Square card: ${error}`);
    }
  }

  // Payments
  static async createPayment(accessToken: string, environment: string, paymentData: {
    amount: number;
    currency?: string;
    sourceId: string; // card ID or nonce
    customerId?: string;
    locationId: string;
    idempotencyKey: string;
    note?: string;
  }): Promise<any> {
    try {
      // TODO: Implement with Square SDK
      // const client = SquareHelper.getClient(accessToken, environment);
      // const paymentsApi = client.paymentsApi;
      //
      // const amountMoney: Money = {
      //   amount: BigInt(paymentData.amount * 100), // Square uses cents
      //   currency: paymentData.currency || 'USD'
      // };
      //
      // const request: CreatePaymentRequest = {
      //   sourceId: paymentData.sourceId,
      //   idempotencyKey: paymentData.idempotencyKey,
      //   amountMoney,
      //   locationId: paymentData.locationId,
      //   customerId: paymentData.customerId,
      //   note: paymentData.note
      // };
      //
      // const response = await paymentsApi.createPayment(request);
      // return response.result.payment;

      return {
        id: `sq_payment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        status: "COMPLETED",
        amountMoney: {
          amount: paymentData.amount * 100,
          currency: paymentData.currency || "USD"
        },
        sourceType: "CARD",
        customerId: paymentData.customerId,
        locationId: paymentData.locationId
      };
    } catch (error) {
      throw new Error(`Failed to create Square payment: ${error}`);
    }
  }

  // Subscriptions
  static async createSubscription(accessToken: string, environment: string, subscriptionData: {
    customerId: string;
    locationId: string;
    planId: string;
    cardId?: string;
    startDate?: string;
  }): Promise<any> {
    try {
      // TODO: Implement with Square SDK
      // const client = SquareHelper.getClient(accessToken, environment);
      // const subscriptionsApi = client.subscriptionsApi;
      //
      // const request = {
      //   customerId: subscriptionData.customerId,
      //   locationId: subscriptionData.locationId,
      //   planId: subscriptionData.planId,
      //   cardId: subscriptionData.cardId,
      //   startDate: subscriptionData.startDate
      // };
      //
      // const response = await subscriptionsApi.createSubscription(request);
      // return response.result.subscription;

      return {
        id: `sq_subscription_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        status: "ACTIVE",
        customerId: subscriptionData.customerId,
        locationId: subscriptionData.locationId,
        planId: subscriptionData.planId
      };
    } catch (error) {
      throw new Error(`Failed to create Square subscription: ${error}`);
    }
  }

  static async cancelSubscription(_accessToken: string, _environment: string, _subscriptionId: string): Promise<void> {
    try {
      // TODO: Implement with Square SDK
      // const client = SquareHelper.getClient(accessToken, environment);
      // const subscriptionsApi = client.subscriptionsApi;
      // await subscriptionsApi.cancelSubscription(subscriptionId);
    } catch (error) {
      throw new Error(`Failed to cancel Square subscription: ${error}`);
    }
  }

  // Webhooks
  static async validateWebhookSignature(
    _body: string,
    _signature: string,
    _notificationUrl: string,
    _webhookSignatureKey: string
  ): Promise<boolean> {
    try {
      // TODO: Implement Square webhook signature validation
      // Use Square's webhook signature validation logic
      return true; // Mock validation for now
    } catch (_error) {
      return false;
    }
  }

  // Fee Calculation
  static calculateFees(amount: number, customFixedFee?: number, customPercentFee?: number): number {
    // Square standard fees: 2.6% + $0.10 for card-present, 2.9% + $0.30 for card-not-present
    const fixedFee = customFixedFee ?? 0.3;
    const percentFee = customPercentFee ?? 0.029;
    return Math.round(((amount + fixedFee) / (1 - percentFee) - amount) * 100) / 100;
  }

  // Event Logging
  static async logEvent(churchId: string, squareEvent: any, eventData: any, givingRepos: any): Promise<any> {
    const eventLog: EventLog = {
      id: givingRepos.eventLog.generateId(),
      churchId,
      customerId: eventData.customer_id || "",
      provider: "Square",
      providerId: squareEvent.merchant_id + "_" + squareEvent.event_id, // Store the Square event ID here
      eventType: squareEvent.type,
      status: eventData.status || squareEvent.type,
      message: eventData.status || "",
      created: new Date(squareEvent.created_at)
    };
    return givingRepos.eventLog.save(eventLog);
  }

  static async logDonation(accessToken: string, environment: string, churchId: string, eventData: any, givingRepos: any): Promise<any> {
    const amount = parseFloat(eventData.amount_money?.amount || "0") / 100; // Square uses cents
    const customerId = eventData.customer_id || "";
    const customerData = customerId ? await givingRepos.customer.load(churchId, customerId) : null;
    const personId = customerData?.personId;

    const batch: DonationBatch = await givingRepos.donationBatch.getOrCreateCurrent(churchId);
    const donationData: Donation = {
      batchId: batch.id,
      amount,
      churchId,
      personId,
      method: "Square",
      methodDetails: eventData.id,
      donationDate: new Date(eventData.created_at),
      notes: eventData.note || ""
    };

    const donation = await givingRepos.donation.save(donationData);

    // Handle fund allocations if available in note or reference_id
    const funds: FundDonation[] = [];
    try {
      const fundData = eventData.note ? JSON.parse(eventData.note) : [];
      if (Array.isArray(fundData)) {
        fundData.forEach((f: any) => {
          funds.push({ churchId, donationId: donation.id, fundId: f.id, amount: f.amount });
        });
      }
    } catch {
      // Ignore JSON parse errors
    }

    const promises: Promise<FundDonation>[] = [];
    funds.forEach((fd) => promises.push(givingRepos.fundDonation.save(fd)));
    return Promise.all(promises);
  }
}