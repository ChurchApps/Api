import {
  BlockRepo,
  ElementRepo,
  PageRepo,
  SectionRepo,
  LinkRepo,
  FileRepo,
  GlobalStyleRepo,
  PlaylistRepo,
  SermonRepo,
  StreamingServiceRepo,
  EventRepo,
  EventExceptionRepo,
  CuratedCalendarRepo,
  CuratedEventRepo,
  SettingRepo,
  BibleTranslationRepo,
  BibleBookRepo,
  BibleChapterRepo,
  BibleVerseRepo,
  BibleVerseTextRepo,
  BibleLookupRepo,
  SongDetailRepo,
  SongDetailLinkRepo,
  SongRepo,
  ArrangementRepo,
  ArrangementKeyRepo
} from ".";

export class Repos {
  public block: BlockRepo;
  public element: ElementRepo;
  public page: PageRepo;
  public section: SectionRepo;
  public link: LinkRepo;
  public file: FileRepo;
  public globalStyle: GlobalStyleRepo;
  public playlist: PlaylistRepo;
  public sermon: SermonRepo;
  public streamingService: StreamingServiceRepo;
  public event: EventRepo;
  public eventException: EventExceptionRepo;
  public curatedCalendar: CuratedCalendarRepo;
  public curatedEvent: CuratedEventRepo;
  public setting: SettingRepo;
  public bibleTranslation: BibleTranslationRepo;
  public bibleBook: BibleBookRepo;
  public bibleChapter: BibleChapterRepo;
  public bibleVerse: BibleVerseRepo;
  public bibleVerseText: BibleVerseTextRepo;
  public bibleLookup: BibleLookupRepo;
  public songDetail: SongDetailRepo;
  public songDetailLink: SongDetailLinkRepo;
  public song: SongRepo;
  public arrangement: ArrangementRepo;
  public arrangementKey: ArrangementKeyRepo;

  public static getCurrent = () => new Repos();

  constructor() {
    this.block = new BlockRepo();
    this.element = new ElementRepo();
    this.page = new PageRepo();
    this.section = new SectionRepo();
    this.link = new LinkRepo();
    this.file = new FileRepo();
    this.globalStyle = new GlobalStyleRepo();
    this.playlist = new PlaylistRepo();
    this.sermon = new SermonRepo();
    this.streamingService = new StreamingServiceRepo();
    this.event = new EventRepo();
    this.eventException = new EventExceptionRepo();
    this.curatedCalendar = new CuratedCalendarRepo();
    this.curatedEvent = new CuratedEventRepo();
    this.setting = new SettingRepo();
    this.bibleTranslation = new BibleTranslationRepo();
    this.bibleBook = new BibleBookRepo();
    this.bibleChapter = new BibleChapterRepo();
    this.bibleVerse = new BibleVerseRepo();
    this.bibleVerseText = new BibleVerseTextRepo();
    this.bibleLookup = new BibleLookupRepo();
    this.songDetail = new SongDetailRepo();
    this.songDetailLink = new SongDetailLinkRepo();
    this.song = new SongRepo();
    this.arrangement = new ArrangementRepo();
    this.arrangementKey = new ArrangementKeyRepo();
  }
}
