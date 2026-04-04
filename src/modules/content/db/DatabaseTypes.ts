import type {
  Arrangement, ArrangementKey, BibleBook, BibleChapter, BibleLookup,
  BibleTranslation, BibleVerse, BibleVerseText, Block, CuratedCalendar,
  CuratedEvent, Element, Event, EventException, File, GlobalStyle, Link,
  Page, PageHistory, Playlist, Registration, RegistrationMember, Section,
  Sermon, Setting, Song, SongDetail, SongDetailLink, StreamingService
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
  eventExceptions: EventException;
  files: Omit<File, "fileContents">;
  globalStyles: GlobalStyle;
  links: Link;
  pages: Omit<Page, "sections">;
  pageHistory: PageHistory;
  playlists: Playlist;
  registrations: Omit<Registration, "members">;
  registrationMembers: RegistrationMember;
  sections: Omit<Section, "answers" | "styles" | "animations" | "elements" | "sections">;
  sermons: Sermon;
  settings: Setting;
  songs: Song;
  songDetails: SongDetail;
  songDetailLinks: SongDetailLink;
  streamingServices: StreamingService;
}
