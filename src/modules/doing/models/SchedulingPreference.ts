export class SchedulingPreference {
  public id?: string;
  public churchId?: string;
  public personId?: string;
  public maxPerMonth?: number;
  public preferredTimes?: string;
  public householdScheduling?: string; // none | together | apart
}
