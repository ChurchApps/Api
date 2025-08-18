export class EventLog {
  public id: string = "";
  public churchId?: string;
  public customerId?: string;
  public personId?: string;
  public provider?: string;
  public eventType?: string;
  public status?: string;
  public message?: string;
  public created?: Date;
  public resolved?: boolean;
}
