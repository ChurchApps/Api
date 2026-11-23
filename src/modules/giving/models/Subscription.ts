export class Subscription {
  public id: string = "";
  public churchId?: string;
  public personId?: string;
  public customerId?: string;
  public gatewayId?: string;
  public currency?: string;
  // Request-only, not stored: what the donor set up, sent with subscription.created for workflow triggers.
  public amount?: number;
  public interval?: { interval_count?: number | string; interval?: string };
  public subscriptionFunds?: { fundId?: string; amount?: number }[];
}
