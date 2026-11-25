import { Campus, Service, ServiceTime } from "./index.js";

export class AttendanceRecord {
  public campus?: Campus;
  public service?: Service;
  public serviceTime?: ServiceTime;
  public groupId?: string;
  public visitDate?: Date;
  public checkinTime?: Date;
  public checkoutTime?: Date;
  public checkedOutBy?: string;
  public checkedInById?: string;
  public checkedInBy?: string;
  public week?: number;
  public count?: number;
  // public gender?: string;*/
}
