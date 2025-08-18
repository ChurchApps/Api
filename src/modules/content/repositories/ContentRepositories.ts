import {
  ArrangementKeyRepository,
  ArrangementRepository,
  BibleBookRepository,
  BibleChapterRepository,
  BibleLookupRepository,
  BibleTranslationRepository,
  BibleVerseRepository,
  BibleVerseTextRepository,
  BlockRepository,
  CuratedCalendarRepository,
  CuratedEventRepository,
  ElementRepository,
  EventExceptionRepository,
  EventRepository,
  FileRepository,
  GlobalStyleRepository,
  LinkRepository,
  PageRepository,
  PlaylistRepository,
  SectionRepository,
  SermonRepository,
  SettingRepository,
  SongDetailLinkRepository,
  SongDetailRepository,
  SongRepository,
  StreamingServiceRepository
} from "./index";

/**
 * Repository collection for the Content module
 * This class replaces the singleton pattern with the new modular approach
 */
export class ContentRepositories {
  // CMS repositories
  public block: BlockRepository;
  public element: ElementRepository;
  public page: PageRepository;
  public section: SectionRepository;
  public link: LinkRepository;
  public globalStyle: GlobalStyleRepository;
  public file: FileRepository;

  // Media repositories
  public playlist: PlaylistRepository;
  public sermon: SermonRepository;
  public streamingService: StreamingServiceRepository;

  // Event repositories
  public event: EventRepository;
  public eventException: EventExceptionRepository;
  public curatedCalendar: CuratedCalendarRepository;
  public curatedEvent: CuratedEventRepository;

  // Bible repositories
  public bibleTranslation: BibleTranslationRepository;
  public bibleBook: BibleBookRepository;
  public bibleChapter: BibleChapterRepository;
  public bibleVerse: BibleVerseRepository;
  public bibleVerseText: BibleVerseTextRepository;
  public bibleLookup: BibleLookupRepository;

  // Song repositories
  public arrangement: ArrangementRepository;
  public arrangementKey: ArrangementKeyRepository;
  public songDetail: SongDetailRepository;
  public songDetailLink: SongDetailLinkRepository;
  public song: SongRepository;

  // Settings repository
  public setting: SettingRepository;

  private static _current: ContentRepositories = null;

  public static getCurrent = () => {
    if (ContentRepositories._current === null) {
      ContentRepositories._current = new ContentRepositories();
    }
    return ContentRepositories._current;
  };

  constructor() {
    // CMS repositories
    this.block = new BlockRepository();
    this.element = new ElementRepository();
    this.page = new PageRepository();
    this.section = new SectionRepository();
    this.link = new LinkRepository();
    this.globalStyle = new GlobalStyleRepository();
    this.file = new FileRepository();

    // Media repositories
    this.playlist = new PlaylistRepository();
    this.sermon = new SermonRepository();
    this.streamingService = new StreamingServiceRepository();

    // Event repositories
    this.event = new EventRepository();
    this.eventException = new EventExceptionRepository();
    this.curatedCalendar = new CuratedCalendarRepository();
    this.curatedEvent = new CuratedEventRepository();

    // Bible repositories
    this.bibleTranslation = new BibleTranslationRepository();
    this.bibleBook = new BibleBookRepository();
    this.bibleChapter = new BibleChapterRepository();
    this.bibleVerse = new BibleVerseRepository();
    this.bibleVerseText = new BibleVerseTextRepository();
    this.bibleLookup = new BibleLookupRepository();

    // Song repositories
    this.arrangement = new ArrangementRepository();
    this.arrangementKey = new ArrangementKeyRepository();
    this.songDetail = new SongDetailRepository();
    this.songDetailLink = new SongDetailLinkRepository();
    this.song = new SongRepository();

    // Settings repository
    this.setting = new SettingRepository();
  }
}
