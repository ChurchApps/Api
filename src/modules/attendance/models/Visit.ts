// import { Person } from "./index.js";
import { VisitSession } from "./index.js";

export class Visit {
  public id?: string;
  public churchId?: string;
  public personId?: string;
  public serviceId?: string;
  public groupId?: string;
  public visitDate?: Date;
  public checkinTime?: Date;
  public addedBy?: string;
  public securityCode?: string;
  public checkoutTime?: Date;
  public checkedOutBy?: string;
  public checkedOutById?: string;
  public checkinType?: string;
  public checkedInById?: string;

  // public person?: Person;
  public visitSessions?: VisitSession[];
}
