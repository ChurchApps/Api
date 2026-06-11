export class Campaign {
  public id?: string;
  public churchId?: string;
  public fundId?: string;
  public name?: string;
  public description?: string;
  public goalAmount?: number;
  public startDate?: Date | string;
  public endDate?: Date | string;
  public showPublic?: boolean;
  public allowSelfPledge?: boolean;
}
