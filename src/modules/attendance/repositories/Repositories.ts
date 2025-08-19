import {
  AttendanceRepository,
  CampusRepository,
  GroupServiceTimeRepository,
  ServiceRepository,
  ServiceTimeRepository,
  SessionRepository,
  VisitRepository,
  VisitSessionRepository
} from ".";

export class Repositories {
  public attendance: AttendanceRepository;
  public campus: CampusRepository;
  public groupServiceTime: GroupServiceTimeRepository;
  public service: ServiceRepository;
  public serviceTime: ServiceTimeRepository;
  public session: SessionRepository;
  public visit: VisitRepository;
  public visitSession: VisitSessionRepository;

  private static _current: Repositories = null;
  public static getCurrent = () => {
    if (Repositories._current === null) Repositories._current = new Repositories();
    return Repositories._current;
  };

  constructor() {
    this.attendance = new AttendanceRepository();
    this.campus = new CampusRepository();
    this.groupServiceTime = new GroupServiceTimeRepository();
    this.service = new ServiceRepository();
    this.serviceTime = new ServiceTimeRepository();
    this.session = new SessionRepository();
    this.visit = new VisitRepository();
    this.visitSession = new VisitSessionRepository();
  }
}