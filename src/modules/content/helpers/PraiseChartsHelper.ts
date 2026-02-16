import { Setting, SongDetail, SongDetailLink } from "../models/index.js";
import OAuth from "oauth-1.0a";
import crypto from "crypto";
import { Environment } from "../../../shared/helpers/Environment.js";
import { Repos } from "../repositories/index.js";
import { RepoManager } from "../../../shared/infrastructure/index.js";

export class PraiseChartsHelper {
  static async loadUserTokens(au: any) {
    const repos = await RepoManager.getRepos<Repos>("content");
    const settings: Setting[] = await repos.setting.loadUser(au.churchId, au.id);
    const token = settings.find((s) => s.keyName === "praiseChartsAccessToken")?.value;
    const secret = settings.find((s) => s.keyName === "praiseChartsAccessTokenSecret")?.value;
    return { token, secret };
  }

  static getOAuth() {
    return new OAuth({
      consumer: {
        key: Environment.praiseChartsConsumerKey,
        secret: Environment.praiseChartsConsumerSecret
      },
      signature_method: "HMAC-SHA1",
      hash_function(baseString, key) {
        return crypto.createHmac("sha1", key).update(baseString).digest("base64");
      }
    });
  }

  static async getRequestToken(returnUrl: string): Promise<{ oauthToken: string; oauthTokenSecret: string }> {
    const oauth = this.getOAuth();
    const requestData = {
      url: "https://api.praisecharts.com/oauth/request_token",
      method: "POST",
      data: { oauth_callback: returnUrl }
    };
    const headers = oauth.toHeader(oauth.authorize(requestData));
    const response = await fetch(requestData.url, {
      method: "POST",
      headers: headers as unknown as HeadersInit
    });
    if (!response.ok) throw new Error(`Request token failed: ${response.statusText}`);
    const text = await response.text();
    const params = new URLSearchParams(text);
    return {
      oauthToken: params.get("oauth_token") || "",
      oauthTokenSecret: params.get("oauth_token_secret") || ""
    };
  }

  static getAuthorizeUrl(oauthToken: string) {
    return `https://api.praisecharts.com/oauth/authorize?oauth_token=${oauthToken}`;
  }

  static async getAccessToken(oauthToken: string, oauthTokenSecret: string, oauthVerifier: string): Promise<{ accessToken: string; accessTokenSecret: string }> {
    const oauth = this.getOAuth();
    const token = { key: oauthToken, secret: oauthTokenSecret };
    const requestData = {
      url: "https://api.praisecharts.com/oauth/access_token",
      method: "POST",
      data: { oauth_verifier: oauthVerifier }
    };
    const headers = oauth.toHeader(oauth.authorize(requestData, token));
    const response = await fetch(requestData.url, {
      method: "POST",
      headers: headers as unknown as HeadersInit
    });
    if (!response.ok) throw new Error(`Access token failed: ${response.statusText}`);
    const text = await response.text();
    const params = new URLSearchParams(text);
    return {
      accessToken: params.get("oauth_token") || "",
      accessTokenSecret: params.get("oauth_token_secret") || ""
    };
  }

  static async oAuthGet(url: string, accessToken: string, accessTokenSecret: string) {
    const oauth = this.getOAuth();
    const token = { key: accessToken, secret: accessTokenSecret };
    const requestData = { url, method: "GET" };
    const headers = oauth.toHeader(oauth.authorize(requestData, token));
    const response = await fetch(url, { headers: headers as unknown as HeadersInit });
    if (!response.ok) throw new Error(`OAuth GET failed: ${response.statusText}`);
    return response.json();
  }

  static searchLibraryAuth(query: string, accessToken: string, accessTokenSecret: string) {
    const url = `https://api.praisecharts.com/v1.0/library/search?q=${encodeURIComponent(query)}`;
    return this.oAuthGet(url, accessToken, accessTokenSecret);
  }

  static async search(query: string) {
    const includes =
      "&arr_includes[]=id" + "&arr_includes[]=details.title" + "&arr_includes[]=details.artists.names" + "&arr_includes[]=details.album.title" + "&arr_includes[]=details.album.images.md.url";
    const url = `https://api.praisecharts.com/v1.0/catalog/search?q=${encodeURIComponent(query)}${includes}`;
    const response = await fetch(url);
    if (response.ok) {
      const data = await response.json();
      return this.convertItemsToSongDetails(data.arrangements.items);
    } else {
      throw new Error(`Error fetching data from PraiseCharts: ${response.statusText}`);
    }
  }

  static async download(skus: string[], keys: string[], accessToken: string, accessTokenSecret: string) {
    let url = `https://api.praisecharts.com/v1.0/download?skus[]=${encodeURIComponent(skus.join(","))}`;
    if (keys.length > 0) url += "&keys[]=" + keys.join(",");
    const oauth = this.getOAuth();
    const token = { key: accessToken, secret: accessTokenSecret };
    const requestData = { url, method: "GET" };
    const headers = oauth.toHeader(oauth.authorize(requestData, token));
    const response = await fetch(url, { headers: headers as unknown as HeadersInit });
    if (!response.ok) throw new Error(`Download failed: ${response.statusText}`);
    return Buffer.from(await response.arrayBuffer());
  }

  static async loadArrangmentRaw(id: string, keys: string[], accessToken: string, accessTokenSecret: string) {
    let url = `https://api.praisecharts.com/v1.0/library/import-arrangement/${id}`;
    if (keys.length > 0) url += "?keys[]=" + keys.join(",");
    return this.oAuthGet(url, accessToken, accessTokenSecret);
  }

  static async loadSongFromLibrary(id: string, keys: string[], accessToken: string, accessTokenSecret: string) {
    let url = `https://api.praisecharts.com/v1.0/library/search?q=${encodeURIComponent(id)}`;
    if (keys.length > 0) url += "&keys[]=" + keys.join(",");
    const data: any = await this.oAuthGet(url, accessToken, accessTokenSecret);
    return data;
  }

  static async loadSongFromCatalog(id: string, keys: string[]) {
    let url = `https://api.praisecharts.com/v1.0/catalog/search?q=${encodeURIComponent(id)}`;
    if (keys.length > 0) url += "&keys[]=" + keys.join(",");
    const response = await fetch(url);
    if (response.ok) {
      const data = await response.json();
      return data.arrangements.items[0];
    } else {
      throw new Error(`Error fetching data from PraiseCharts: ${response.statusText}`);
    }
  }

  static async loadRaw(id: string) {
    const url = `https://api.praisecharts.com/v1.0/catalog/search?q=${encodeURIComponent(id)}`;
    const response = await fetch(url);
    if (response.ok) {
      const data = await response.json();
      return data.arrangements.items[0];
    } else {
      throw new Error(`Error fetching data from PraiseCharts: ${response.statusText}`);
    }
  }

  static async load(id: string) {
    const url = `https://api.praisecharts.com/v1.0/catalog/search?q=${encodeURIComponent(id)}`;
    const response = await fetch(url);
    if (response.ok) {
      const data = await response.json();
      const songDetails = this.convertItemToSongDetail(data.arrangements.items[0]);
      this.appendDetails(data.arrangements.items[0], songDetails);
      const links = this.getLinks(data.arrangements.items[0]);
      return { songDetails, links };
    } else {
      throw new Error(`Error fetching data from PraiseCharts: ${response.statusText}`);
    }
  }

  private static convertItemsToSongDetails(items: any[]) {
    return items.map((item) => {
      return this.convertItemToSongDetail(item);
    });
  }

  private static convertItemToSongDetail(item: any) {
    const result: SongDetail = {
      praiseChartsId: item.id,
      title: item.details?.title,
      artist: item.details?.artists?.names,
      album: item.details?.album?.title,
      thumbnail: item.details?.album?.images?.md?.url,
      seconds: 0
    };
    return result;
  }

  static appendDetails(item: any, sd: SongDetail) {
    sd.bpm = item.bpm;
    sd.keySignature = item.details.original_key;
    sd.seconds = item.seconds;
    sd.thumbnail = ""; // Can only use for PC branded search
    sd.meter = item.details.meter;
    sd.tones = item.details.keys;
  }

  private static getLinks(item: any) {
    const result: SongDetailLink[] = [];
    if (item.details.external_ids) {
      const externalIds = item.details.external_ids;
      if (externalIds.spotify_id) {
        result.push({
          service: "Spotify",
          serviceKey: externalIds.spotify_id,
          url: "https://open.spotify.com/track/" + externalIds.spotify_id
        });
      }
      if (externalIds.ccli_number) {
        result.push({
          service: "CCLI",
          serviceKey: externalIds.ccli_number,
          url: "https://songselect.ccli.com/Songs/" + externalIds.ccli_number
        });
      }
      if (externalIds.isrc) result.push({ service: "ISRC", serviceKey: externalIds.isrc });
    }
    if (item.details.external_urls) {
      const externalUrls = item.details.external_urls;
      if (externalUrls.youtube) result.push({ service: "YouTube", id: externalUrls.youtube.split("=")[1], url: externalUrls.youtube });
    }
    return result;
  }

  static async searchByCCLI(ccliNumber: string): Promise<SongDetail | null> {
    try {
      const url = `https://api.praisecharts.com/v1.0/catalog/search?ccli_number=${encodeURIComponent(ccliNumber)}`;
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        if (data.arrangements.items.length > 0) {
          return this.convertItemToSongDetail(data.arrangements.items[0]);
        }
      }
      return null;
    } catch (error) {
      throw new Error(`Error searching PraiseCharts by CCLI: ${error.message}`);
    }
  }

  private static calculateMatchScore(searchText: string, resultText: string): number {
    if (!resultText || !searchText) return 0;

    // Convert both to lowercase for case-insensitive comparison
    const searchLower = searchText.toLowerCase();
    const resultLower = resultText.toLowerCase();

    // Split into words
    const searchWords = searchLower.split(/\s+/);
    const resultWords = resultLower.split(/\s+/);

    // Count matching words
    let matchCount = 0;
    for (const word of searchWords) {
      if (resultWords.includes(word)) {
        matchCount++;
      }
    }

    // Calculate match percentage
    return (matchCount / searchWords.length) * 100;
  }

  static async findBestMatch(title?: string, artist?: string, lyrics?: string, ccliNumber?: string, geniusId?: string): Promise<SongDetail | null> {
    try {
      // First try CCLI number if provided
      if (ccliNumber) {
        const ccliResult = await this.searchByCCLI(ccliNumber);
        if (ccliResult) return ccliResult;
      }

      // Then try Genius ID if provided
      if (geniusId) {
        const geniusResult = await this.searchByGeniusId(geniusId);
        if (geniusResult) return geniusResult;
      }

      // If no CCLI match or no CCLI provided, try searching with title and artist
      let searchQuery = "";
      if (title) searchQuery += title;
      if (artist) searchQuery += ` ${artist}`;

      if (searchQuery.trim()) {
        const includes =
          "&arr_includes[]=id" +
          "&arr_includes[]=details.title" +
          "&arr_includes[]=details.artists.names" +
          "&arr_includes[]=details.album.title" +
          "&arr_includes[]=details.album.images.md.url" +
          "&arr_includes[]=details.external_ids.ccli_number" +
          "&arr_includes[]=details.external_ids.genius_id" +
          "&arr_includes[]=details.lyrics";

        const url = `https://api.praisecharts.com/v1.0/catalog/search?q=${encodeURIComponent(searchQuery.trim())}${includes}`;
        const response = await fetch(url);
        if (response.ok) {
          const data = await response.json();
          if (data.arrangements.items.length > 0) {
            if (artist) return this.getArtistBestMatch(data.arrangements.items, artist);
            else if (lyrics) return this.getLyricsBestMatch(data.arrangements.items, lyrics);
            else return this.convertItemToSongDetail(data.arrangements.items[0]);
          }
        }
      }

      return null;
    } catch (error) {
      throw new Error(`Error searching PraiseCharts: ${error.message}`);
    }
  }

  static getLyricsBestMatch(arrangements: any, lyrics: string) {
    let bestMatch = arrangements[0];
    let bestScore = this.calculateMatchScore(lyrics, bestMatch.details?.lyrics || "");

    for (let i = 1; i < arrangements.length; i++) {
      const currentItem = arrangements[i];
      const currentScore = this.calculateMatchScore(lyrics, currentItem.details?.lyrics || "");

      if (currentScore > bestScore) {
        bestMatch = currentItem;
        bestScore = currentScore;
      }
    }

    return this.convertItemToSongDetail(bestMatch);
  }

  static getArtistBestMatch(arrangements: any, artist: string) {
    let bestMatch = arrangements[0];
    let bestScore = bestMatch.details?.artists?.names ? this.calculateMatchScore(artist, bestMatch.details?.artists?.names || "") : 0;

    for (let i = 1; i < arrangements.length; i++) {
      const currentItem = arrangements[i];
      if (currentItem.details?.artists?.names) {
        const currentScore = this.calculateMatchScore(artist, currentItem.details?.artists?.names || "");

        if (currentScore > bestScore) {
          bestMatch = currentItem;
          bestScore = currentScore;
        }
      }
    }

    return this.convertItemToSongDetail(bestMatch);
  }

  static async searchByGeniusId(geniusId: string): Promise<SongDetail | null> {
    try {
      const url = `https://api.praisecharts.com/v1.0/catalog/search?genius_id=${encodeURIComponent(geniusId)}`;
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        if (data.arrangements.items.length > 0) {
          return this.convertItemToSongDetail(data.arrangements.items[0]);
        }
      }
      return null;
    } catch (error) {
      throw new Error(`Error searching PraiseCharts by Genius ID: ${error.message}`);
    }
  }
}
