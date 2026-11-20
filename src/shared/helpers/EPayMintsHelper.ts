import { Donation, DonationBatch, EventLog, FundDonation } from "../../modules/giving/models/index.js";
import type { Repos } from "../../modules/giving/repositories/Repos.js";
import type { FundAllocation, GatewayObject, GatewayWebhookData } from "./gateways/IGatewayProvider.js";

// ePayMints API response (payment, refund, transaction status, settlement or customer).
export interface EPayMintsResult extends GatewayObject {
  customer_id?: string;
  amount?: number;
  currency?: string;
  transaction_id?: string;
  terminal_id?: string;
  settlement_date?: string;
  transactions?: unknown[];
  total_amount?: number;
}

export interface EPayMintsEventData extends GatewayWebhookData {
  amount?: number | string;
  customer_id?: string;
  transaction_id?: string;
  timestamp?: string | number;
  description?: string;
  message?: string;
  metadata?: { funds?: string };
}

export interface EPayMintsWebhookBody {
  id?: string;
  type?: string;
  event_type?: string;
  terminal_id?: string;
  transaction_id?: string;
  timestamp?: string | number;
  data?: EPayMintsEventData;
}

interface EPayMintsPaymentBody {
  amount: number;
  currency: string;
  customer_id?: string;
  description: string;
  payment_method?: { type: "card"; card: Record<string, string> } | { type: "ach"; ach: Record<string, string> };
}

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
    body?: unknown
  ): Promise<EPayMintsResult> {
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
      // TODO: ePayMints may use terminal-based or merchant-based identification, not traditional customer objects.
      const baseUrl = EPayMintsHelper.getBaseUrl(environment);
      const headers = { Authorization: `Bearer ${apiKey}`, "X-Terminal-ID": customerData.terminalId || "" };

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
  ): Promise<EPayMintsResult> {
    try {
      const baseUrl = EPayMintsHelper.getBaseUrl(environment);
      const headers = { Authorization: `Bearer ${apiKey}`, "X-Terminal-ID": paymentData.terminalId };

      const requestBody: EPayMintsPaymentBody = {
        amount: Math.round(paymentData.amount * 100),
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

      // TODO: Real ePayMints payment creation API
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
  ): Promise<EPayMintsResult> {
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

  static async getTransactionStatus(
    apiKey: string,
    environment: string,
    terminalId: string,
    transactionId: string
  ): Promise<EPayMintsResult> {
    try {
      const baseUrl = EPayMintsHelper.getBaseUrl(environment);
      const headers = { Authorization: `Bearer ${apiKey}`, "X-Terminal-ID": terminalId };

      // TODO: Real ePayMints transaction status API
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

  static async createRefund(
    apiKey: string,
    environment: string,
    refundData: {
      terminalId: string;
      transactionId: string;
      amount?: number; // Full refund if not specified
      reason?: string;
    }
  ): Promise<EPayMintsResult> {
    try {
      const baseUrl = EPayMintsHelper.getBaseUrl(environment);
      const headers = { Authorization: `Bearer ${apiKey}`, "X-Terminal-ID": refundData.terminalId };

      // TODO: Real ePayMints refund API
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

  static async getSettlementInfo(
    apiKey: string,
    environment: string,
    terminalId: string,
    date?: string
  ): Promise<EPayMintsResult> {
    try {
      const baseUrl = EPayMintsHelper.getBaseUrl(environment);
      const headers = { Authorization: `Bearer ${apiKey}`, "X-Terminal-ID": terminalId };

      const queryParams = date ? `?date=${date}` : "";

      // TODO: Real ePayMints settlement API
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

  static calculateFees(
    amount: number,
    paymentMethod: "card" | "ach",
    customFixedFee?: number,
    customPercentFee?: number
  ): number {
    if (paymentMethod === "ach") {
      const fixedFee = customFixedFee ?? 0.5;
      const percentFee = customPercentFee ?? 0.008; // 0.8%
      const maxFee = 5.0;
      const fee = Math.round(((amount + fixedFee) / (1 - percentFee) - amount) * 100) / 100;
      return Math.min(fee, maxFee);
    } else {
      const fixedFee = customFixedFee ?? 0.3;
      const percentFee = customPercentFee ?? 0.029; // 2.9%
      return Math.round(((amount + fixedFee) / (1 - percentFee) - amount) * 100) / 100;
    }
  }

  static validateWebhookSignature(
    _payload: string,
    signature: string,
    webhookSecret: string
  ): boolean {
    if (!signature || !webhookSecret) return false;
    return false;
  }

  static async logEvent(
    churchId: string,
    ePayMintsEvent: EPayMintsWebhookBody,
    eventData: EPayMintsEventData,
    givingRepos: Repos
  ) {
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
    // create() is private on EventLogRepo; this path has always called it directly.
    return givingRepos.eventLog["create"](eventLog);
  }

  static async logDonation(
    _apiKey: string,
    _environment: string,
    churchId: string,
    eventData: EPayMintsEventData,
    givingRepos: Repos
  ): Promise<FundDonation[]> {
    const amount = parseFloat(String(eventData.amount || "0")) / 100; // ePayMints uses cents
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

    // Handle fund allocations if available
    const funds: FundDonation[] = [];
    try {
      const fundData = eventData.metadata?.funds ? JSON.parse(eventData.metadata.funds) : [];
      if (Array.isArray(fundData)) {
        fundData.forEach((f: FundAllocation) => {
          funds.push({ churchId, fundId: f.id, amount: f.amount });
        });
      }
    } catch {
      // Ignore JSON parse errors
    }

    await givingRepos.donation.save(donationData, funds);
    return funds;
  }
}
