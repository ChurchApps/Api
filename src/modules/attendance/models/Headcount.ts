export class Headcount {
  public id?: string;
  public churchId?: string;
  public campusId?: string;
  public serviceId?: string;
  public serviceTimeId?: string;
  public groupId?: string;
  public headcountDate?: Date;
  public value?: number;
  public enteredBy?: string;

  // Read-only display fields populated by list queries.
  public serviceName?: string;
  public serviceTimeName?: string;
}
