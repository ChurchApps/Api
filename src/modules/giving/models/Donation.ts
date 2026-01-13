import { Fund } from "./index.js";

export type DonationStatus = "pending" | "complete" | "failed";

export class Donation {
  public id?: string;
  public churchId?: string;
  public batchId?: string;
  public personId?: string;
  public donationDate?: Date;
  public amount?: number;
  public method?: string;
  public methodDetails?: string;
  public notes?: string;
  public entryTime?: Date;
  public status?: DonationStatus;
  public transactionId?: string;
  public fund?: Fund;
}
