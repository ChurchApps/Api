export class Setting {
  public id?: string;
  public churchId?: string;
  public keyName?: string;
  public value?: string;
  // bit(1) column: clients send 1/0 or true/false.
  public public?: string | number | boolean;
}
