// EPayMints integration helper
// Note: ePayMints may use REST/SOAP APIs depending on their service offering

import { Donation, DonationBatch, EventLog, FundDonation } from "../../modules/giving/models/index.js";

export class EPayMintsHelper {
  private static getBaseUrl(environment: string): string {
    // TODO: Verify actual ePayMints API endpoints
    return environment === "production"
      ? "https://api.epaymints.com"
      : "https://sandbox.epaymints.com";
  }

  private static async makeRequest(
    url: string,
    method: string,
    headers: Record<string, string>,
    body?: any
  ): Promise<any> {
    try {
      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...headers
        },
        body: body ? JSON.stringify(body) : undefined
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`ePayMints API error: ${response.status} ${errorText}`);
      }

      return response.json();
    } catch (error) {
      throw new Error(`ePayMints request failed: ${error}`);
    }
  }

  // Customer Management
  static async createCustomer(
    apiKey: string,
    environment: string,
    customerData: {
      email?: string;
      name?: string;
      phone?: string;
      terminalId?: string;
    }
  ): Promise<string> {
    try {
      // TODO: Implement actual ePayMints customer creation API
      // ePayMints may not have traditional customer objects like Stripe/PayPal
      // Instead, they might use terminal-based or merchant-based identification

      const baseUrl = EPayMintsHelper.getBaseUrl(environment);
      const headers = { Authorization: `Bearer ${apiKey}`, "X-Terminal-ID": customerData.terminalId || "" };

      // Mock implementation - replace with actual API call
      const result = await EPayMintsHelper.makeRequest(
        `${baseUrl}/customers`,
        "POST",
        headers,
        { email: customerData.email, name: customerData.name, phone: customerData.phone }
      );

      return result.customer_id || `epm_customer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    } catch (error) {
      throw new Error(`Failed to create ePayMints customer: ${error}`);
    }
  }

  // Payment Processing
  static async createPayment(
    apiKey: string,
    environment: string,
    paymentData: {
      amount: number;
      currency?: string;
      terminalId: string;
      customerId?: string;
      paymentMethod: "card" | "ach";
      cardData?: {
        number: string;
        expMonth: string;
        expYear: string;
        cvv: string;
      };
      achData?: {
        routingNumber: string;
        accountNumber: string;
        accountType: "checking" | "savings";
      };
      description?: string;
    }
  ): Promise<any> {
    try {
      const baseUrl = EPayMintsHelper.getBaseUrl(environment);
      const headers = { Authorization: `Bearer ${apiKey}`, "X-Terminal-ID": paymentData.terminalId };

      const requestBody: any = {
        amount: Math.round(paymentData.amount * 100), // Convert to cents
        currency: paymentData.currency || "USD",
        customer_id: paymentData.customerId,
        description: paymentData.description || "Payment"
      };

      if (paymentData.paymentMethod === "card" && paymentData.cardData) {
        requestBody.payment_method = { type: "card", card: paymentData.cardData };
      } else if (paymentData.paymentMethod === "ach" && paymentData.achData) {
        requestBody.payment_method = {
          type: "ach",
          ach: paymentData.achData
        };
      }

      // TODO: Replace with actual ePayMints payment creation API
      const result = await EPayMintsHelper.makeRequest(
        `${baseUrl}/payments`,
        "POST",
        headers,
        requestBody
      );

      return result || {
        id: `epm_payment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        status: "completed",
        amount: paymentData.amount,
        currency: paymentData.currency || "USD"
      };
    } catch (error) {
      throw new Error(`Failed to create ePayMints payment: ${error}`);
    }
  }

  // ACH Processing (ePayMints specialization)
  static async createACHPayment(
    apiKey: string,
    environment: string,
    achData: {
      amount: number;
      terminalId: string;
      routingNumber: string;
      accountNumber: string;
      accountType: "checking" | "savings";
      customerId?: string;
      description?: string;
    }
  ): Promise<any> {
    return EPayMintsHelper.createPayment(apiKey, environment, {
      amount: achData.amount,
      terminalId: achData.terminalId,
      customerId: achData.customerId,
      paymentMethod: "ach",
      achData: {
        routingNumber: achData.routingNumber,
        accountNumber: achData.accountNumber,
        accountType: achData.accountType
      },
      description: achData.description
    });
  }

  // Transaction Status
  static async getTransactionStatus(
    apiKey: string,
    environment: string,
    terminalId: string,
    transactionId: string
  ): Promise<any> {
    try {
      const baseUrl = EPayMintsHelper.getBaseUrl(environment);
      const headers = { Authorization: `Bearer ${apiKey}`, "X-Terminal-ID": terminalId };

      // TODO: Replace with actual ePayMints transaction status API
      const result = await EPayMintsHelper.makeRequest(
        `${baseUrl}/transactions/${transactionId}`,
        "GET",
        headers
      );

      return result || {
        id: transactionId,
        status: "completed",
        amount: 0,
        currency: "USD"
      };
    } catch (error) {
      throw new Error(`Failed to get ePayMints transaction status: ${error}`);
    }
  }

  // Refunds
  static async createRefund(
    apiKey: string,
    environment: string,
    refundData: {
      terminalId: string;
      transactionId: string;
      amount?: number; // Full refund if not specified
      reason?: string;
    }
  ): Promise<any> {
    try {
      const baseUrl = EPayMintsHelper.getBaseUrl(environment);
      const headers = {
        Authorization: `Bearer ${apiKey}`,
        "X-Terminal-ID": refundData.terminalId
      };

      // TODO: Replace with actual ePayMints refund API
      const result = await EPayMintsHelper.makeRequest(
        `${baseUrl}/refunds`,
        "POST",
        headers,
        {
          transaction_id: refundData.transactionId,
          amount: refundData.amount ? Math.round(refundData.amount * 100) : undefined,
          reason: refundData.reason
        }
      );

      return result || {
        id: `epm_refund_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        status: "completed",
        amount: refundData.amount,
        transaction_id: refundData.transactionId
      };
    } catch (error) {
      throw new Error(`Failed to create ePayMints refund: ${error}`);
    }
  }

  // Settlement/Batch Processing
  static async getSettlementInfo(
    apiKey: string,
    environment: string,
    terminalId: string,
    date?: string
  ): Promise<any> {
    try {
      const baseUrl = EPayMintsHelper.getBaseUrl(environment);
      const headers = { Authorization: `Bearer ${apiKey}`, "X-Terminal-ID": terminalId };

      const queryParams = date ? `?date=${date}` : "";

      // TODO: Replace with actual ePayMints settlement API
      const result = await EPayMintsHelper.makeRequest(
        `${baseUrl}/settlements${queryParams}`,
        "GET",
        headers
      );

      return result || {
        terminal_id: terminalId,
        settlement_date: date || new Date().toISOString().split("T")[0],
        transactions: [],
        total_amount: 0
      };
    } catch (error) {
      throw new Error(`Failed to get ePayMints settlement info: ${error}`);
    }
  }

  // Fee Calculation
  static calculateFees(
    amount: number,
    paymentMethod: "card" | "ach",
    customFixedFee?: number,
    customPercentFee?: number
  ): number {
    if (paymentMethod === "ach") {
      // ePayMints ACH fees are typically lower
      const fixedFee = customFixedFee ?? 0.5;
      const percentFee = customPercentFee ?? 0.008; // 0.8%
      const maxFee = 5.0; // Cap ACH fees
      const fee = Math.round(((amount + fixedFee) / (1 - percentFee) - amount) * 100) / 100;
      return Math.min(fee, maxFee);
    } else {
      // Card processing fees
      const fixedFee = customFixedFee ?? 0.3;
      const percentFee = customPercentFee ?? 0.029; // 2.9%
      return Math.round(((amount + fixedFee) / (1 - percentFee) - amount) * 100) / 100;
    }
  }

  // Webhook Verification (if supported)
  static validateWebhookSignature(
    payload: string,
    signature: string,
    webhookSecret: string
  ): boolean {
    try {
      // TODO: Implement ePayMints-specific webhook signature verification
      // This would depend on their webhook signing mechanism
      // For now, return true as placeholder
      return signature.length > 0 && webhookSecret.length > 0;
    } catch (_error) {
      return false;
    }
  }

  // Event Logging
  static async logEvent(
    churchId: string,
    ePayMintsEvent: any,
    eventData: any,
    givingRepos: any
  ): Promise<any> {
    const eventLog: EventLog = {
      id: `${ePayMintsEvent.terminal_id}_${ePayMintsEvent.transaction_id}`,
      churchId,
      customerId: eventData.customer_id || "",
      provider: "ePayMints",
      eventType: ePayMintsEvent.type || "transaction",
      status: eventData.status || "completed",
      message: eventData.message || "",
      created: new Date(ePayMintsEvent.timestamp || Date.now())
    };
    return givingRepos.eventLog.create(eventLog);
  }

  static async logDonation(
    apiKey: string,
    environment: string,
    churchId: string,
    eventData: any,
    givingRepos: any
  ): Promise<any> {
    const amount = parseFloat(eventData.amount || "0") / 100; // ePayMints uses cents
    const customerId = eventData.customer_id || "";
    const customerData = customerId ? await givingRepos.customer.load(churchId, customerId) : null;
    const personId = customerData?.personId;

    const batch: DonationBatch = await givingRepos.donationBatch.getOrCreateCurrent(churchId);
    const donationData: Donation = {
      batchId: batch.id,
      amount,
      churchId,
      personId,
      method: "ePayMints",
      methodDetails: eventData.transaction_id,
      donationDate: new Date(eventData.timestamp || Date.now()),
      notes: eventData.description || ""
    };

    const donation = await givingRepos.donation.save(donationData);

    // Handle fund allocations if available
    const funds: FundDonation[] = [];
    try {
      const fundData = eventData.metadata?.funds ? JSON.parse(eventData.metadata.funds) : [];
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
