import {
  CampaignRepo,
  DonationBatchRepo,
  DonationRepo,
  FundDonationRepo,
  FundRepo,
  GatewayRepo,
  CustomerRepo,
  GatewayPaymentMethodRepo,
  EventLogRepo,
  PledgeRepo,
  SubscriptionRepo,
  SubscriptionFundsRepo
} from "./index.js";

export class Repos {
  public campaign: CampaignRepo;
  public donationBatch: DonationBatchRepo;
  public donation: DonationRepo;
  public fundDonation: FundDonationRepo;
  public fund: FundRepo;
  public gateway: GatewayRepo;
  public customer: CustomerRepo;
  public gatewayPaymentMethod: GatewayPaymentMethodRepo;
  public eventLog: EventLogRepo;
  public pledge: PledgeRepo;
  public subscription: SubscriptionRepo;
  public subscriptionFunds: SubscriptionFundsRepo;

  public static getCurrent = () => new Repos();

  constructor() {
    this.campaign = new CampaignRepo();
    this.donationBatch = new DonationBatchRepo();
    this.donation = new DonationRepo();
    this.fundDonation = new FundDonationRepo();
    this.fund = new FundRepo();
    this.gateway = new GatewayRepo();
    this.customer = new CustomerRepo();
    this.gatewayPaymentMethod = new GatewayPaymentMethodRepo();
    this.eventLog = new EventLogRepo();
    this.pledge = new PledgeRepo();
    this.subscription = new SubscriptionRepo();
    this.subscriptionFunds = new SubscriptionFundsRepo();
  }
}
