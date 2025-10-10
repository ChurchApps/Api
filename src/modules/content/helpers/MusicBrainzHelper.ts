import { SongDetail, SongDetailLink } from "../models";

export class MusicBrainzHelper {
  static async lookup(artist: string, title: string) {
    const cleanTitle = title.replace(/\s*\((Live|Radio|Acoustic|Studio|Album|Single).*?\)\s*$/i, "").trim();
    const primaryArtist = artist.split(",")[0].trim();
    const structuredQuery = `recording:"${cleanTitle}" AND artist:"${primaryArtist}"`;
    return this.lookupInner(structuredQuery, title, artist);
  }

  static async lookupInner(query: string, originalTitle?: string, originalArtist?: string) {
    const url = `https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(query)}&fmt=json`;
    const userAgent = "ChurchApps https://churchapps.org/";
    const response = await fetch(url, { headers: { "User-Agent": userAgent } });
    if (response.ok) {
      const data = await response.json();
      if (data.recordings?.length > 0) {
        const bestMatch = this.findBestMatch(data.recordings, originalTitle, originalArtist);
        return { id: bestMatch.id, songDetail: this.convertRecordingToSongDetail(bestMatch) };
      } else {
        throw new Error(`Error fetching data from MusicBrainz: ${response.statusText}`);
      }
    } else {
      throw new Error(`Error fetching data from MusicBrainz: ${response.statusText}`);
    }
  }

  private static findBestMatch(recordings: any[], originalTitle?: string, originalArtist?: string): any {
    if (!originalTitle || !originalArtist) return recordings[0];

    const scoredRecordings = recordings.map((recording) => {
      let score = recording.score || 0;
      const mbTitle = recording.title?.toLowerCase() || "";
      const mbArtist = recording["artist-credit"]?.[0]?.name?.toLowerCase() || "";
      const origTitle = originalTitle.toLowerCase();
      const origArtist = originalArtist.toLowerCase();

      if (mbTitle.includes(origTitle) || origTitle.includes(mbTitle)) score += 10;

      const origArtists = origArtist.split(",").map(a => a.trim());
      if (origArtists.some(artist => mbArtist.includes(artist) || artist.includes(mbArtist))) score += 10;

      if (recording.length && recording.length > 0) score += 5;

      return { recording, finalScore: score };
    });

    // Sort by final score descending
    scoredRecordings.sort((a, b) => b.finalScore - a.finalScore);

    return scoredRecordings[0].recording;
  }

  static async load(id: string) {
    const url = `https://musicbrainz.org/ws/2/recording/${encodeURIComponent(id)}?fmt=json&inc=artist-credits+isrcs+releases`;
    const userAgent = "ChurchApps https://churchapps.org/";
    const response = await fetch(url, { headers: { "User-Agent": userAgent } });
    if (response.ok) {
      const data = await response.json();
      if (data.id) {
        return { id: data.id, songDetail: this.convertRecordingToSongDetail(data) };
      } else {
        throw new Error(`Error fetching data from MusicBrainz: ${response.statusText}`);
      }
    } else {
      throw new Error(`Error fetching data from MusicBrainz: ${response.statusText}`);
    }
  }

  static async appendDetails(songDetail: SongDetail, links: SongDetailLink[]) {
    try {
      const mb = await this.lookup(songDetail.artist, songDetail.title);

      if (mb.songDetail) {
        // More lenient artist matching - check if any part of the artist names overlap
        const origArtists = songDetail.artist.toLowerCase().split(",").map(a => a.trim());
        const mbArtist = mb.songDetail.artist?.toLowerCase() || "";
        const hasArtistMatch = origArtists.some(artist => mbArtist.includes(artist) || artist.includes(mbArtist));

        if (hasArtistMatch) {
          songDetail.seconds = mb.songDetail.seconds;
          songDetail.thumbnail = mb.songDetail.thumbnail;
          if (!songDetail.bpm && mb.songDetail.bpm) songDetail.bpm = mb.songDetail.bpm;
          if (mb.id) {
            links.push({ service: "MusicBrainz", url: `https://musicbrainz.org/recording/${mb.id}`, serviceKey: mb.id });
          }
        }
      }
    } catch (error) {
      console.log(`MusicBrainz lookup failed for ${songDetail.title} by ${songDetail.artist}:`, error.message);
    }
  }

  static async appendDetailsById(songDetail: SongDetail, musicBrainsId: string) {
    const mb = await this.load(musicBrainsId);
    if (mb.songDetail) {
      if (!songDetail.seconds) songDetail.seconds = mb.songDetail.seconds;
      if (!songDetail.thumbnail) songDetail.thumbnail = mb.songDetail.thumbnail;
      if (!songDetail.bpm && mb.songDetail.bpm) songDetail.bpm = mb.songDetail.bpm;
      if (!songDetail.releaseDate && mb.songDetail.releaseDate) songDetail.releaseDate = mb.songDetail.releaseDate;
    }
  }

  private static convertRecordingToSongDetail(recording: any) {
    const result: SongDetail = {
      // musicBrainzId: recording.id,
      title: recording.title,
      artist: recording["artist-credit"]?.[0]?.name,
      album: recording.releases?.[0]?.title,
      releaseDate: recording.releases?.[0]?.date ? new Date(recording.releases?.[0]?.date) : undefined,
      seconds: recording.length ? Math.round(recording.length / 1000) : 0,
      thumbnail: recording.releases?.[0]?.id ? this.getCoverArtUrl(recording.releases?.[0]?.id) : undefined
    };
    return result;
  }

  private static getCoverArtUrl(releaseMbId: string) {
    // https://coverartarchive.org/release/{releaseMbId}
    const url = `https://coverartarchive.org/release/${releaseMbId}/front-250.jpg`;
    return url;
  }

  /*
  static async search(query: string) {
    const url = `https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(query)}&fmt=json`;
    const userAgent = "ChurchApps https://churchapps.org/"
    const response = await fetch(url, { headers: { "User-Agent": userAgent } });
    if (response.ok) {
      const data = await response.json();
      return this.convertRecordingsToSongDetails(data.recordings);
    } else {
      throw new Error(`Error fetching data from MusicBrainz: ${response.statusText}`);
    }
  }

  private static convertRecordingsToSongDetails(recordings: any[]) {
    return recordings.map(recording => {
      return this.convertRecordingToSongDetail(recording);
    });
  }


*/
}
