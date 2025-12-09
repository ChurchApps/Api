export class DeliveryLog {
  public id?: string;
  public churchId?: string;
  public personId?: string;
  public contentType?: string;
  public contentId?: string;
  public deliveryMethod?: string;
  public success?: boolean;
  public errorMessage?: string;
  public deliveryAddress?: string;
  public attemptTime?: Date;
}
