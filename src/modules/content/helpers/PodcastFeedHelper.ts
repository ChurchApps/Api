import axios from "axios";
import { XMLParser } from "fast-xml-parser";
import { UrlValidator } from "../../../shared/webhooks/UrlValidator.js";

export interface PodcastEpisode {
  guid: string;
  title: string;
  pubDate: string;
  description: string;
  audioUrl: string;
  audioType: string;
  duration: number;
  image: string;
  episodeNumber: number | null;
  link: string;
}

export interface PodcastFeed {
  title: string;
  description: string;
  image: string;
  link: string;
  author: string;
  episodes: PodcastEpisode[];
}

export class PodcastFeedError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

interface CacheEntry { expires: number; feed: PodcastFeed; }

const CACHE_TTL_MS = 15 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;
const MAX_BYTES = 5_000_000;
const MAX_REDIRECTS = 3;
const MAX_EPISODES = 200;

// Fetches and normalizes a third-party podcast RSS feed for the website "podcast" element.
// The URL is church-supplied and the endpoint is anonymous, so every hop (including redirects)
// is checked against the same SSRF guard the webhook dispatcher uses.
export class PodcastFeedHelper {
  private static cache = new Map<string, CacheEntry>();
  private static parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", parseTagValue: false, trimValues: true });

  static async validateUrl(rawUrl: string): Promise<string | null> {
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return "Invalid feed URL";
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return "Feed URL must use http or https";
    if (UrlValidator.isBlockedHostname(parsed.hostname)) return "Feed URL host is not allowed";
    if (await UrlValidator.resolvesToPrivate(parsed.hostname)) return "Feed URL resolves to a private address";
    return null;
  }

  static async load(rawUrl: string): Promise<PodcastFeed> {
    const url = (rawUrl || "").trim();
    const cached = this.cache.get(url);
    if (cached && cached.expires > Date.now()) return cached.feed;

    const xml = await this.fetch(url);
    const feed = this.parse(xml);
    this.cache.set(url, { expires: Date.now() + CACHE_TTL_MS, feed });
    return feed;
  }

  static clearCache(): void {
    this.cache.clear();
  }

  private static async fetch(url: string): Promise<string> {
    let current = url;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const problem = await this.validateUrl(current);
      if (problem) throw new PodcastFeedError(problem, 400);
      let response;
      try {
        response = await axios.get(current, {
          timeout: FETCH_TIMEOUT_MS,
          maxContentLength: MAX_BYTES,
          maxRedirects: 0,
          responseType: "text",
          validateStatus: (s) => (s >= 200 && s < 300) || (s >= 300 && s < 400),
          headers: { Accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8", "User-Agent": "ChurchApps-Podcast-Element/1.0" }
        });
      } catch {
        throw new PodcastFeedError("Unable to load the podcast feed", 502);
      }
      if (response.status >= 300) {
        const location = response.headers?.location;
        if (!location) throw new PodcastFeedError("Unable to load the podcast feed", 502);
        current = new URL(location, current).toString();
        continue;
      }
      return typeof response.data === "string" ? response.data : String(response.data ?? "");
    }
    throw new PodcastFeedError("Too many redirects", 502);
  }

  static parse(xml: string): PodcastFeed {
    let doc: any;
    try {
      doc = this.parser.parse(xml);
    } catch {
      throw new PodcastFeedError("The feed is not valid XML", 422);
    }
    const channel = doc?.rss?.channel;
    if (!channel) throw new PodcastFeedError("The URL is not an RSS podcast feed", 422);

    const channelImage = this.attr(channel["itunes:image"], "href") || this.text(channel.image?.url);
    const rawItems = channel.item === undefined ? [] : Array.isArray(channel.item) ? channel.item : [channel.item];

    const episodes: PodcastEpisode[] = rawItems.slice(0, MAX_EPISODES).map((item: any, index: number) => {
      const audioUrl = this.attr(item.enclosure, "url");
      const rawNumber = parseInt(this.text(item["itunes:episode"]), 10);
      return {
        guid: this.text(item.guid) || audioUrl || this.text(item.link) || "item-" + index,
        title: this.text(item["itunes:title"]) || this.text(item.title),
        pubDate: this.isoDate(this.text(item.pubDate)),
        description: this.plainText(this.text(item.description) || this.text(item["itunes:summary"]) || this.text(item["content:encoded"])),
        audioUrl,
        audioType: this.attr(item.enclosure, "type"),
        duration: this.seconds(this.text(item["itunes:duration"])),
        image: this.attr(item["itunes:image"], "href") || channelImage,
        episodeNumber: isNaN(rawNumber) ? null : rawNumber,
        link: this.text(item.link)
      };
    });

    return {
      title: this.text(channel.title),
      description: this.plainText(this.text(channel["itunes:summary"]) || this.text(channel.description)),
      image: channelImage,
      link: this.text(channel.link),
      author: this.text(channel["itunes:author"]),
      episodes
    };
  }

  // fast-xml-parser returns a string for simple nodes and an object with "#text" when the node also carries attributes.
  private static text(node: any): string {
    if (node === undefined || node === null) return "";
    if (Array.isArray(node)) return this.text(node[0]);
    if (typeof node === "object") return node["#text"] === undefined ? "" : String(node["#text"]).trim();
    return String(node).trim();
  }

  private static attr(node: any, name: string): string {
    if (!node) return "";
    const target = Array.isArray(node) ? node[0] : node;
    if (typeof target !== "object") return "";
    const value = target["@_" + name];
    return value === undefined || value === null ? "" : String(value).trim();
  }

  private static plainText(html: string): string {
    return html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, "\"")
      .replace(/&#39;/g, "'")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  private static isoDate(value: string): string {
    if (!value) return "";
    const d = new Date(value);
    return isNaN(d.getTime()) ? "" : d.toISOString();
  }

  // itunes:duration may be plain seconds, MM:SS, or HH:MM:SS.
  private static seconds(value: string): number {
    if (!value) return 0;
    if (/^\d+$/.test(value)) return parseInt(value, 10);
    const parts = value.split(":").map((p) => parseInt(p, 10));
    if (parts.some((p) => isNaN(p))) return 0;
    return parts.reduce((total, part) => total * 60 + part, 0);
  }
}
