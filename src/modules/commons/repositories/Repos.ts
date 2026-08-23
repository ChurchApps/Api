import { AbcSubmissionRepo } from "./AbcSubmissionRepo.js";
import { AssetRepo } from "./AssetRepo.js";
import { ReportRepo } from "./ReportRepo.js";
import { SongRepo } from "./SongRepo.js";

export class Repos {
  public song: SongRepo;
  public report: ReportRepo;
  public abcSubmission: AbcSubmissionRepo;
  public asset: AssetRepo;

  public static getCurrent = () => new Repos();

  constructor() {
    this.song = new SongRepo();
    this.report = new ReportRepo();
    this.abcSubmission = new AbcSubmissionRepo();
    this.asset = new AssetRepo();
  }
}
