import {
  BlockRepository,
  ElementRepository,
  PageRepository,
  SectionRepository,
  LinkRepository,
  FileRepository,
  GlobalStyleRepository,
  PlaylistRepository,
  SermonRepository,
  StreamingServiceRepository,
  EventRepository,
  EventExceptionRepository,
  CuratedCalendarRepository,
  CuratedEventRepository,
  SettingRepository,
  BibleTranslationRepository,
  BibleBookRepository,
  BibleChapterRepository,
  BibleVerseRepository,
  BibleVerseTextRepository,
  BibleLookupRepository,
  SongDetailRepository,
  SongDetailLinkRepository,
  SongRepository,
  ArrangementRepository,
  ArrangementKeyRepository
} from ".";

export class Repositories {
  public block: BlockRepository;
  public element: ElementRepository;
  public page: PageRepository;
  public section: SectionRepository;
  public link: LinkRepository;
  public file: FileRepository;
  public globalStyle: GlobalStyleRepository;
  public playlist: PlaylistRepository;
  public sermon: SermonRepository;
  public streamingService: StreamingServiceRepository;
  public event: EventRepository;
  public eventException: EventExceptionRepository;
  public curatedCalendar: CuratedCalendarRepository;
  public curatedEvent: CuratedEventRepository;
  public setting: SettingRepository;
  public bibleTranslation: BibleTranslationRepository;
  public bibleBook: BibleBookRepository;
  public bibleChapter: BibleChapterRepository;
  public bibleVerse: BibleVerseRepository;
  public bibleVerseText: BibleVerseTextRepository;
  public bibleLookup: BibleLookupRepository;
  public songDetail: SongDetailRepository;
  public songDetailLink: SongDetailLinkRepository;
  public song: SongRepository;
  public arrangement: ArrangementRepository;
  public arrangementKey: ArrangementKeyRepository;

  private static _current: Repositories = null;
  public static getCurrent = () => {
    if (Repositories._current === null) Repositories._current = new Repositories();
    return Repositories._current;
  };

  constructor() {
    this.block = new BlockRepository();
    this.element = new ElementRepository();
    this.page = new PageRepository();
    this.section = new SectionRepository();
    this.link = new LinkRepository();
    this.file = new FileRepository();
    this.globalStyle = new GlobalStyleRepository();
    this.playlist = new PlaylistRepository();
    this.sermon = new SermonRepository();
    this.streamingService = new StreamingServiceRepository();
    this.event = new EventRepository();
    this.eventException = new EventExceptionRepository();
    this.curatedCalendar = new CuratedCalendarRepository();
    this.curatedEvent = new CuratedEventRepository();
    this.setting = new SettingRepository();
    this.bibleTranslation = new BibleTranslationRepository();
    this.bibleBook = new BibleBookRepository();
    this.bibleChapter = new BibleChapterRepository();
    this.bibleVerse = new BibleVerseRepository();
    this.bibleVerseText = new BibleVerseTextRepository();
    this.bibleLookup = new BibleLookupRepository();
    this.songDetail = new SongDetailRepository();
    this.songDetailLink = new SongDetailLinkRepository();
    this.song = new SongRepository();
    this.arrangement = new ArrangementRepository();
    this.arrangementKey = new ArrangementKeyRepository();
  }
}