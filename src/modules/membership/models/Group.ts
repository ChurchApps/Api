export class Group {
  public id?: string;
  public churchId?: string;
  public categoryName?: string;
  public name?: string;
  public trackAttendance?: boolean;
  public attendanceReminders?: boolean;
  public parentPickup?: false;
  public printNametag?: boolean;
  public about?: string;
  public photoUrl?: string;
  public tags?: string;
  public meetingTime?: string;
  public meetingLocation?: string;
  public labels?: string;
  public labelArray?: string[];
  public slug?: string;
  public campusId?: string;
  public archived?: boolean;
  public publicRoster?: boolean;
  public minAgeMonths?: number;
  public maxAgeMonths?: number;
  public minGrade?: string;
  public maxGrade?: string;

  public joinPolicy?: "open" | "request" | "closed";

  public memberCount?: number;
  public importKey?: string;
}
