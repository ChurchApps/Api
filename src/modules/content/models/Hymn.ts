export interface HymnVerse {
  order: number;
  label?: string;
  text: string;
  language?: string;
}

export class Hymn {
  id?: string;
  churchId?: string;
  number?: number;
  title?: string;
  language?: string;
  verses?: HymnVerse[];
  chorus?: string;
  author?: string;
  composer?: string;
  translator?: string;
  tune?: string;
  category?: string;
  source?: string;
  copyright?: string;
  license?: string;
  attribution?: string;
  published?: boolean;
  archived?: boolean;
}
