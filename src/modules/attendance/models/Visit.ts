// import { Person } from "./";
import { VisitSession } from "./";

export class Visit {
  public id?: string;
  public churchId?: string;
  public personId?: string;
  public serviceId?: string;
  public groupId?: string;
  public visitDate?: Date;
  public checkinTime?: Date;
  public addedBy?: string;

  // public person?: Person;
  public visitSessions?: VisitSession[];
}
