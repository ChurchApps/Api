declare module "node-geocoder" {
  namespace NodeGeocoder {
    interface Options {
      provider: string;
      [key: string]: any;
    }
    interface Entry {
      latitude?: number;
      longitude?: number;
      country?: string;
      city?: string;
      state?: string;
      zipcode?: string;
      streetName?: string;
      streetNumber?: string;
      district?: string;
      [key: string]: any;
    }
    interface Geocoder {
      geocode(query: string): Promise<Entry[]>;
    }
  }
  function NodeGeocoder(options: NodeGeocoder.Options): NodeGeocoder.Geocoder;
  export = NodeGeocoder;
}

declare module "youtube-captions-scraper" {
  export function getSubtitles(options: { videoID: string; lang?: string }): Promise<Array<{ start: string; dur: string; text: string }>>;
}
