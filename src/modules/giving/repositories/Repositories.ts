import {
  DonationBatchRepository,
  DonationRepository,
  FundDonationRepository,
  FundRepository,
  GatewayRepository,
  CustomerRepository,
  EventLogRepository,
  SubscriptionRepository,
  SubscriptionFundsRepository
} from ".";

export class Repositories {
  public donationBatch: DonationBatchRepository;
  public donation: DonationRepository;
  public fundDonation: FundDonationRepository;
  public fund: FundRepository;
  public gateway: GatewayRepository;
  public customer: CustomerRepository;
  public eventLog: EventLogRepository;
  public subscription: SubscriptionRepository;
  public subscriptionFunds: SubscriptionFundsRepository;

  public static getCurrent = () => new Repositories();

  constructor() {
    this.donationBatch = new DonationBatchRepository();
    this.donation = new DonationRepository();
    this.fundDonation = new FundDonationRepository();
    this.fund = new FundRepository();
    this.gateway = new GatewayRepository();
    this.customer = new CustomerRepository();
    this.eventLog = new EventLogRepository();
    this.subscription = new SubscriptionRepository();
    this.subscriptionFunds = new SubscriptionFundsRepository();
  }
}
