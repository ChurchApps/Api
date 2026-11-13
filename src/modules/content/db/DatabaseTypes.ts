import type {
  Arrangement, ArrangementKey, BibleBook, BibleChapter, BibleLookup,
  BibleTranslation, BibleVerse, BibleVerseText, Block, CalendarBlockout,
  CuratedCalendar, CuratedEvent, Element, Event, EventBooking,
  EventException, EventRsvp, EventTemplate, File, GlobalStyle, Link,
  Page, PageHistory, Post, Playlist, Redirect, Registration, RegistrationMember,
  RegistrationType, RegistrationSelection, RegistrationSelectionChoice, RegistrationPayment, RegistrationCoupon, Resource,
  Room, Section, Sermon, Setting, Song, SongDetail, SongDetailLink,
  StorageProvider, StreamingService
} from "../models/index.js";

export interface ContentDatabase {
  arrangements: Arrangement;
  arrangementKeys: ArrangementKey;
  bibleBooks: BibleBook;
  bibleChapters: BibleChapter;
  bibleLookups: BibleLookup;
  bibleTranslations: Omit<BibleTranslation, "countryList">;
  bibleVerses: BibleVerse;
  bibleVerseTexts: BibleVerseText;
  blocks: Omit<Block, "sections">;
  curatedCalendars: CuratedCalendar;
  curatedEvents: CuratedEvent;
  elements: Omit<Element, "answers" | "styles" | "animations" | "elements">;
  events: Omit<Event, "exceptionDates">;
  eventRsvps: EventRsvp;
  eventExceptions: EventException;
  eventBookings: EventBooking;
  eventTemplates: EventTemplate;
  rooms: Room;
  resources: Resource;
  calendarBlockouts: CalendarBlockout;
  files: Omit<File, "fileContents">;
  globalStyles: GlobalStyle;
  links: Link;
  pages: Omit<Page, "sections">;
  pageHistory: PageHistory;
  posts: Post;
  playlists: Playlist;
  redirects: Redirect;
  registrations: Omit<Registration, "members">;
  registrationMembers: RegistrationMember;
  registrationTypes: RegistrationType;
  registrationSelections: RegistrationSelection;
  registrationSelectionChoices: RegistrationSelectionChoice;
  registrationPayments: RegistrationPayment;
  registrationCoupons: RegistrationCoupon;
  sections: Omit<Section, "answers" | "styles" | "animations" | "elements" | "sections">;
  sermons: Sermon;
  settings: Setting;
  songs: Song;
  songDetails: SongDetail;
  songDetailLinks: SongDetailLink;
  storageProviders: StorageProvider;
  streamingServices: StreamingService;
}
