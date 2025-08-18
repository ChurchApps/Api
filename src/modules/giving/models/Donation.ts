import { Fund } from "./";

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
  public fund?: Fund;
}
