import { AttendanceRepo, CampusRepo, GroupServiceTimeRepo, ServiceRepo, ServiceTimeRepo, SessionRepo, VisitRepo, VisitSessionRepo } from ".";

export class Repos {
  public attendance: AttendanceRepo;
  public campus: CampusRepo;
  public groupServiceTime: GroupServiceTimeRepo;
  public service: ServiceRepo;
  public serviceTime: ServiceTimeRepo;
  public session: SessionRepo;
  public visit: VisitRepo;
  public visitSession: VisitSessionRepo;

  public static getCurrent = () => new Repos();

  constructor() {
    this.attendance = new AttendanceRepo();
    this.campus = new CampusRepo();
    this.groupServiceTime = new GroupServiceTimeRepo();
    this.service = new ServiceRepo();
    this.serviceTime = new ServiceTimeRepo();
    this.session = new SessionRepo();
    this.visit = new VisitRepo();
    this.visitSession = new VisitSessionRepo();
  }
}
