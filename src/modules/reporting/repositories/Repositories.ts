import { ReportRepository } from ".";

export class Repositories {
  public report: ReportRepository;

  private static _current: Repositories = null;
  public static getCurrent = () => {
    if (Repositories._current === null) Repositories._current = new Repositories();
    return Repositories._current;
  };

  constructor() {
    this.report = new ReportRepository();
  }
}
