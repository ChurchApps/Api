export class PlanTemplate {
  public id?: string;
  public churchId?: string;
  public ministryId?: string;
  public name?: string;
  public data?: string; // JSON: { notes, items: PlanItem[], positions: Position[] }
}
