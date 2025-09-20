import {
  DonationBatchRepo,
  DonationRepo,
  FundDonationRepo,
  FundRepo,
  GatewayRepo,
  CustomerRepo,
  GatewayPaymentMethodRepo,
  EventLogRepo,
  SubscriptionRepo,
  SubscriptionFundsRepo
} from ".";

export class Repos {
  public donationBatch: DonationBatchRepo;
  public donation: DonationRepo;
  public fundDonation: FundDonationRepo;
  public fund: FundRepo;
  public gateway: GatewayRepo;
  public customer: CustomerRepo;
  public gatewayPaymentMethod: GatewayPaymentMethodRepo;
  public eventLog: EventLogRepo;
  public subscription: SubscriptionRepo;
  public subscriptionFunds: SubscriptionFundsRepo;

  public static getCurrent = () => new Repos();

  constructor() {
    this.donationBatch = new DonationBatchRepo();
    this.donation = new DonationRepo();
    this.fundDonation = new FundDonationRepo();
    this.fund = new FundRepo();
    this.gateway = new GatewayRepo();
    this.customer = new CustomerRepo();
    this.gatewayPaymentMethod = new GatewayPaymentMethodRepo();
    this.eventLog = new EventLogRepo();
    this.subscription = new SubscriptionRepo();
    this.subscriptionFunds = new SubscriptionFundsRepo();
  }
}
