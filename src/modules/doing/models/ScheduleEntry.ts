// start/end are church-local wall-clock times ("YYYY-MM-DDTHH:mm:ss", no offset).
export class ScheduleEntry {
  public id?: string;
  public churchId?: string;
  public screenGroupId?: string;
  public targetType?: "playlist" | "planType" | "providerFolder";
  public targetId?: string;
  public providerId?: string;
  public providerPath?: string;
  public start?: string;
  public end?: string;
  public recurrenceRule?: string;
  public exceptionDates?: string[];
  public endBehavior?: "loop" | "holdLast" | "fallback";
  public enabled?: boolean;
}
