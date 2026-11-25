import type { ColumnType } from "kysely";
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

// Repositories write DATETIME columns as MySQL date strings (DateHelper.toMysqlDate),
// so those columns accept a string on insert/update while still reading back as Date.
type MysqlDateWrites<T, K extends keyof T> = Omit<T, K> & {
  [P in K]: ColumnType<T[P], T[P] | string | null, T[P] | string | null>;
};

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
  events: MysqlDateWrites<Omit<Event, "exceptionDates">, "start" | "end" | "registrationOpenDate" | "registrationCloseDate" | "resolvedDate">;
  eventRsvps: MysqlDateWrites<EventRsvp, "occurrenceStart">;
  eventExceptions: MysqlDateWrites<EventException, "exceptionDate">;
  eventBookings: MysqlDateWrites<EventBooking, "startTime" | "endTime" | "requestedDate" | "resolvedDate" | "notifiedDate">;
  eventTemplates: EventTemplate;
  rooms: Room;
  resources: Resource;
  calendarBlockouts: MysqlDateWrites<CalendarBlockout, "startTime" | "endTime">;
  files: Omit<File, "fileContents">;
  globalStyles: GlobalStyle;
  links: Link;
  pages: Omit<Page, "sections">;
  pageHistory: PageHistory;
  posts: Post;
  playlists: MysqlDateWrites<Playlist, "publishDate">;
  redirects: Redirect;
  registrations: MysqlDateWrites<Omit<Registration, "members">, "registeredDate" | "cancelledDate" | "waitlistNotifiedDate">;
  registrationMembers: RegistrationMember;
  registrationTypes: RegistrationType;
  registrationSelections: RegistrationSelection;
  registrationSelectionChoices: RegistrationSelectionChoice;
  registrationPayments: MysqlDateWrites<RegistrationPayment, "createdDate">;
  registrationCoupons: MysqlDateWrites<RegistrationCoupon, "startDate" | "endDate">;
  sections: Omit<Section, "answers" | "styles" | "animations" | "elements" | "sections">;
  sermons: MysqlDateWrites<Sermon, "publishDate">;
  settings: Setting;
  songs: MysqlDateWrites<Song, "dateAdded">;
  songDetails: SongDetail;
  songDetailLinks: SongDetailLink;
  storageProviders: StorageProvider;
  streamingServices: MysqlDateWrites<StreamingService, "serviceTime">;
}
