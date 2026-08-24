import { AssetFileRepo } from "./AssetFileRepo.js";
import { AssetRepo } from "./AssetRepo.js";
import { AuthorRepo } from "./AuthorRepo.js";
import { RatingRepo } from "./RatingRepo.js";
import { ReportRepo } from "./ReportRepo.js";
import { SongRepo } from "./SongRepo.js";
import { SubmissionRepo } from "./SubmissionRepo.js";

export class Repos {
  public song: SongRepo;
  public author: AuthorRepo;
  public report: ReportRepo;
  public asset: AssetRepo;
  public submission: SubmissionRepo;
  public assetFile: AssetFileRepo;
  public rating: RatingRepo;

  public static getCurrent = () => new Repos();

  constructor() {
    this.song = new SongRepo();
    this.author = new AuthorRepo();
    this.report = new ReportRepo();
    this.asset = new AssetRepo();
    this.submission = new SubmissionRepo();
    this.assetFile = new AssetFileRepo();
    this.rating = new RatingRepo();
  }
}
