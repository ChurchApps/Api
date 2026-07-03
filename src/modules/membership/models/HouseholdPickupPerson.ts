export class HouseholdPickupPerson {
  public id?: string;
  public churchId?: string;
  public householdId?: string;
  public personId?: string;
  public name?: string;
  public photoUrl?: string;
  public relationship?: string;
  public status?: "trusted" | "notAuthorized";
  public notes?: string;
  public createdDate?: Date;
}
