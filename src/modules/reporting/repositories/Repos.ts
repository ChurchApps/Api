import { ReportRepo } from ".";

export class Repos {
  public report: ReportRepo;

  public static getCurrent = () => new Repos();

  constructor() {
    this.report = new ReportRepo();
  }
}
