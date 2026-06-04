// DEPRECATED: campuses are mastered in the membership module (/membership/campuses).
// This attendance model + its `campuses` table are frozen (read-only) and slated for
// deletion once legacy readers (e.g. B1Checkin) are migrated off the attendance joins.
export class Campus {
  public id?: string;
  public churchId?: string;
  public name?: string;
  public address1?: string;
  public address2?: string;
  public city?: string;
  public state?: string;
  public zip?: string;

  public importKey?: string;
}
