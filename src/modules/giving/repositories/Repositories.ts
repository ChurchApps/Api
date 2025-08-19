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

  private static _current: Repositories = null;
  public static getCurrent = () => {
    if (Repositories._current === null) Repositories._current = new Repositories();
    return Repositories._current;
  };

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