import { ReportRepository } from ".";

export class Repositories {
  public report: ReportRepository;

  public static getCurrent = () => new Repositories();

  constructor() {
    this.report = new ReportRepository();
  }
}
