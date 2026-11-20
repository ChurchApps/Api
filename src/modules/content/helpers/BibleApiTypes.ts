// Response shapes of the third-party Bible APIs (api.bible and YouVersion), limited to the fields this code reads.

export interface BibleHttpError extends Error {
  status?: number;
  code?: string;
  response?: { status?: number; headers?: Record<string, string> };
}

export interface BibleSearchVerse {
  id?: string;
  orgId?: string;
  bibleId?: string;
  bookId?: string;
  chapterId?: string;
  reference?: string;
  text?: string;
}

export interface BibleSearchResponse {
  data?: {
    query?: string;
    limit?: number;
    offset?: number;
    total?: number;
    verseCount?: number;
    verses?: BibleSearchVerse[];
  };
}

export interface ApiBibleTranslation {
  id: string;
  name: string;
  nameLocal: string;
  abbreviation: string;
  description: string;
  language: { id: string };
  countries: { id: string }[];
}

export interface ApiBibleBook { id: string; abbreviation: string; name: string }
export interface ApiBibleChapter { id: string; number: string }
export interface ApiBibleVerse { id: string }

export interface ApiBibleVerseItem {
  name?: string;
  text?: string;
  attrs?: { verseId?: string };
  items?: ApiBibleVerseItem[];
}

export interface ApiBibleList<T> { data: T[] }
export interface ApiBibleVerseContent { data?: { copyright?: string; content?: ApiBibleVerseItem[] } }

export interface YouVersionTranslation {
  id: number | string;
  abbreviation?: string;
  localized_abbreviation?: string;
  title?: string;
  localized_title?: string;
  info?: string;
  language_tag?: string;
  copyright?: string;
}

export interface YouVersionBook { id: string; abbreviation?: string; title?: string; full_title?: string }
export interface YouVersionNumbered { id: number | string }

export interface YouVersionPage<T> { data?: T[]; next_page_token?: string }
export interface YouVersionPassage { content?: string }
export interface YouVersionBible { data?: { copyright?: string } }
