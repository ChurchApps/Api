import {
  BlockRepo,
  ElementRepo,
  PageRepo,
  PageHistoryRepo,
  PostRepo,
  RedirectRepo,
  SectionRepo,
  LinkRepo,
  FileRepo,
  GlobalStyleRepo,
  PlaylistRepo,
  SermonRepo,
  StreamingServiceRepo,
  EventRepo,
  EventRsvpRepo,
  EventExceptionRepo,
  CuratedCalendarRepo,
  CuratedEventRepo,
  RoomRepo,
  ResourceRepo,
  EventBookingRepo,
  CalendarBlockoutRepo,
  EventTemplateRepo,
  RegistrationRepo,
  RegistrationMemberRepo,
  RegistrationTypeRepo,
  RegistrationSelectionRepo,
  RegistrationSelectionChoiceRepo,
  RegistrationPaymentRepo,
  RegistrationCouponRepo,
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
} from "./index.js";

export class Repos {
  public block: BlockRepo;
  public element: ElementRepo;
  public page: PageRepo;
  public pageHistory: PageHistoryRepo;
  public post: PostRepo;
  public redirect: RedirectRepo;
  public section: SectionRepo;
  public link: LinkRepo;
  public file: FileRepo;
  public globalStyle: GlobalStyleRepo;
  public playlist: PlaylistRepo;
  public sermon: SermonRepo;
  public streamingService: StreamingServiceRepo;
  public event: EventRepo;
  public eventRsvp: EventRsvpRepo;
  public eventException: EventExceptionRepo;
  public curatedCalendar: CuratedCalendarRepo;
  public curatedEvent: CuratedEventRepo;
  public room: RoomRepo;
  public resource: ResourceRepo;
  public eventBooking: EventBookingRepo;
  public calendarBlockout: CalendarBlockoutRepo;
  public eventTemplate: EventTemplateRepo;
  public registration: RegistrationRepo;
  public registrationMember: RegistrationMemberRepo;
  public registrationType: RegistrationTypeRepo;
  public registrationSelection: RegistrationSelectionRepo;
  public registrationSelectionChoice: RegistrationSelectionChoiceRepo;
  public registrationPayment: RegistrationPaymentRepo;
  public registrationCoupon: RegistrationCouponRepo;
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
    this.pageHistory = new PageHistoryRepo();
    this.post = new PostRepo();
    this.redirect = new RedirectRepo();
    this.section = new SectionRepo();
    this.link = new LinkRepo();
    this.file = new FileRepo();
    this.globalStyle = new GlobalStyleRepo();
    this.playlist = new PlaylistRepo();
    this.sermon = new SermonRepo();
    this.streamingService = new StreamingServiceRepo();
    this.event = new EventRepo();
    this.eventRsvp = new EventRsvpRepo();
    this.eventException = new EventExceptionRepo();
    this.curatedCalendar = new CuratedCalendarRepo();
    this.curatedEvent = new CuratedEventRepo();
    this.room = new RoomRepo();
    this.resource = new ResourceRepo();
    this.eventBooking = new EventBookingRepo();
    this.calendarBlockout = new CalendarBlockoutRepo();
    this.eventTemplate = new EventTemplateRepo();
    this.registration = new RegistrationRepo();
    this.registrationMember = new RegistrationMemberRepo();
    this.registrationType = new RegistrationTypeRepo();
    this.registrationSelection = new RegistrationSelectionRepo();
    this.registrationSelectionChoice = new RegistrationSelectionChoiceRepo();
    this.registrationPayment = new RegistrationPaymentRepo();
    this.registrationCoupon = new RegistrationCouponRepo();
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
