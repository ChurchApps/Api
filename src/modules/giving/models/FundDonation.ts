import { Donation } from "./index.js";

export class FundDonation {
  public id?: string;
  public churchId?: string;
  public donationId?: string;
  public fundId?: string;
  public contentId?: string;
  public amount?: number;

  public donation?: Donation;
}
