import {
  DonationRepository,
  DonationBatchRepository,
  FundDonationRepository,
  FundRepository,
  GatewayRepository,
  CustomerRepository,
  EventLogRepository,
  SubscriptionRepository,
  SubscriptionFundsRepository
} from "./index";

/**
 * Repository collection for the Giving module
 * This class replaces the singleton pattern with the new modular approach
 */
export class GivingRepositories {
  public donationBatch: DonationBatchRepository;
  public donation: DonationRepository;
  public fundDonation: FundDonationRepository;
  public fund: FundRepository;
  public gateway: GatewayRepository;
  public customer: CustomerRepository;
  public eventLog: EventLogRepository;
  public subscription: SubscriptionRepository;
  public subscriptionFund: SubscriptionFundsRepository;

  constructor() {
    this.donationBatch = new DonationBatchRepository();
    this.donation = new DonationRepository();
    this.fundDonation = new FundDonationRepository();
    this.fund = new FundRepository();
    this.gateway = new GatewayRepository();
    this.customer = new CustomerRepository();
    this.eventLog = new EventLogRepository();
    this.subscription = new SubscriptionRepository();
    this.subscriptionFund = new SubscriptionFundsRepository();
  }
}
