export class DonationBatch {
  public id?: string;
  public churchId?: string;
  public name?: string;
  public batchDate?: Date;
  public status?: string;
  public closedDate?: Date;
  public closedBy?: string;

  public donationCount?: number;
  public totalAmount?: number;
}
