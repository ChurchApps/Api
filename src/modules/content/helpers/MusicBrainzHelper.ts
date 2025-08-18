import { SongDetail, SongDetailLink } from "../models";

export class MusicBrainzHelper {
  static async lookup(artist: string, title: string) {
    return this.lookupInner(`${artist} ${title}`);
  }

  static async lookupInner(query: string) {
    const url = `https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(query)}&fmt=json`;
    const userAgent = "ChurchApps https://churchapps.org/";
    const response = await fetch(url, { headers: { "User-Agent": userAgent } });
    if (response.ok) {
      const data = await response.json();
      if (data.recordings?.length > 0) {
        return { id: data.recordings[0].id, songDetail: this.convertRecordingToSongDetail(data.recordings[0]) };
      } else {
        throw new Error(`Error fetching data from MusicBrainz: ${response.statusText}`);
      }
    } else {
      throw new Error(`Error fetching data from MusicBrainz: ${response.statusText}`);
    }
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
    const mb = await this.lookup(songDetail.artist, songDetail.title);
    if (mb.songDetail) {
      if (mb.songDetail.artist.toLowerCase() === songDetail.artist.split(" ")[0].toLowerCase()) {
        songDetail.seconds = mb.songDetail.seconds;
        songDetail.thumbnail = mb.songDetail.thumbnail;
        if (!songDetail.bpm && mb.songDetail.bpm) songDetail.bpm = mb.songDetail.bpm;
        if (mb.id) {
          links.push({ service: "MusicBrainz", url: `https://musicbrainz.org/recording/${mb.id}`, serviceKey: mb.id });
        }
      }
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
