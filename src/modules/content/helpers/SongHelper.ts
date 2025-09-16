import { SongDetail, Song, Arrangement, SongDetailLink, ArrangementKey } from "../models";
import { PraiseChartsHelper } from "./PraiseChartsHelper";
import { Repos } from "../repositories";
import { RepoManager } from "../../../shared/infrastructure";

export interface FreeShowSong {
  freeShowId: string;
  title?: string;
  artist?: string;
  lyrics?: string;
  ccliNumber?: string;
  geniusId?: string;
}

export class SongHelper {
  static async importSongs(churchId: string, songs: FreeShowSong[]): Promise<Arrangement[]> {
    const promises: Promise<Arrangement>[] = [];
    for (const song of songs) {
      const promise = this.importSong(churchId, song);
      promises.push(promise);
    }
    return Promise.all(promises);
  }

  static async createCustomSong(churchId: string, freeshowSong: FreeShowSong): Promise<Arrangement> {
    // create as custom song
    const customSongDetail: SongDetail = {
      title: freeshowSong.title || "",
      artist: freeshowSong.artist || "",
      keySignature: "",
      praiseChartsId: ""
    };
    const repos = await RepoManager.getRepos<Repos>("content");
    const songDetail = await repos.songDetail.save(customSongDetail);
    const customSong: Song = {
      churchId,
      name: customSongDetail.title,
      dateAdded: new Date()
    };
    const song = await repos.song.save(customSong);
    const customArrangement: Arrangement = {
      churchId,
      songId: song.id,
      songDetailId: songDetail.id,
      name: "Default",
      lyrics: freeshowSong.lyrics || "",
      freeShowId: freeshowSong.freeShowId
    };
    const result = await repos.arrangement.save(customArrangement);
    const arrangementKey: ArrangementKey = {
      churchId,
      arrangementId: customArrangement.id,
      keySignature: customSongDetail.keySignature || "",
      shortDescription: "Default"
    };
    await repos.arrangementKey.save(arrangementKey);
    return result;
  }

  static async importSong(churchId: string, freeshowSong: FreeShowSong): Promise<Arrangement> {
    try {
      // 1. Check if arrangement already exists for this church and freeshow key
      const repos = await RepoManager.getRepos<Repos>("content");
      const exactMathArrangement = await repos.arrangement.loadByFreeShowId(churchId, freeshowSong.freeShowId);
      if (exactMathArrangement) return exactMathArrangement;

      // 2. Try to find existing song by CCLI
      const existingSong = await this.findExistingSongByCCLI(churchId, freeshowSong.ccliNumber);
      if (existingSong) return existingSong;

      // 3. Try to find existing song by Genius ID
      if (freeshowSong.geniusId) {
        const existingByGenius = await this.findExistingSongByGeniusId(churchId, freeshowSong.geniusId);
        if (existingByGenius) return existingByGenius;
      }

      // 4. Look up song on PraiseCharts
      const praiseChartsResult = await PraiseChartsHelper.findBestMatch(freeshowSong.title, freeshowSong.artist, freeshowSong.lyrics, freeshowSong.ccliNumber, freeshowSong.geniusId);
      if (!praiseChartsResult) {
        return this.createCustomSong(churchId, freeshowSong);
      }

      // 5. Get or create song detail
      const songDetail = await this.getOrCreateSongDetail(praiseChartsResult, freeshowSong.ccliNumber, freeshowSong.geniusId);

      // 6. Check if arrangement exists for this church
      const existingArrangement = await repos.arrangement.loadBySongDetailId(churchId, songDetail.id);
      if (existingArrangement.length > 0) {
        // If arrangement exists, update it with freeshow details
        if (!existingArrangement[0].freeShowId && freeshowSong.freeShowId) {
          existingArrangement[0].freeShowId = freeshowSong.freeShowId;
          await repos.arrangement.save(existingArrangement[0]);
        }
        return existingArrangement[0];
      }

      // 7. Create new Song and Arrangement
      return await this.createSongAndArrangement(churchId, songDetail, freeshowSong);
    } catch {
      // throw new Error(`Error importing song: ${error.message}`);
      return null;
    }
  }

  private static async findExistingSongByCCLI(churchId: string, ccliNumber?: string): Promise<SongDetail | null> {
    if (!ccliNumber) return null;

    const repos = await RepoManager.getRepos<Repos>("content");
    const existingByCCLI = await repos.songDetailLink.loadByServiceAndKey("CCLI", ccliNumber);
    if (existingByCCLI) {
      const songDetail = await repos.songDetail.loadGlobal(existingByCCLI.songDetailId);
      if (songDetail) {
        const existingArrangement = await repos.arrangement.loadBySongDetailId(churchId, songDetail.id);
        if (existingArrangement.length > 0) return songDetail;
      }
    }
    return null;
  }

  private static async findExistingSongByGeniusId(churchId: string, geniusId: string): Promise<Arrangement | null> {
    const repos = await RepoManager.getRepos<Repos>("content");
    const existingByGenius = await repos.songDetailLink.loadByServiceAndKey("Genius", geniusId);
    if (existingByGenius) {
      const songDetail = await repos.songDetail.loadGlobal(existingByGenius.songDetailId);
      if (songDetail) {
        const existingArrangement = await repos.arrangement.loadBySongDetailId(churchId, songDetail.id);
        if (existingArrangement.length > 0) {
          return existingArrangement[0];
        }
      }
    }
    return null;
  }

  private static async getOrCreateSongDetail(praiseChartsResult: SongDetail, ccliNumber?: string, geniusId?: string): Promise<SongDetail> {
    const repos = await RepoManager.getRepos<Repos>("content");
    let songDetail = await repos.songDetail.loadByPraiseChartsId(praiseChartsResult.praiseChartsId);

    if (!songDetail) {
      // Create new song detail
      songDetail = praiseChartsResult;
      // Add additional details from PraiseCharts
      const rawData = await PraiseChartsHelper.loadRaw(praiseChartsResult.praiseChartsId);
      PraiseChartsHelper.appendDetails(rawData, songDetail);
      songDetail = await repos.songDetail.save(songDetail);

      // Create song detail links from PraiseCharts
      await this.createSongDetailLinks(songDetail, praiseChartsResult.praiseChartsId);
    }

    // Create additional links for CCLI and Genius if provided
    await this.createAdditionalLinks(songDetail, ccliNumber, geniusId);

    return songDetail;
  }

  private static async createSongDetailLinks(songDetail: SongDetail, praiseChartsId: string): Promise<void> {
    const repos = await RepoManager.getRepos<Repos>("content");
    const { links } = await PraiseChartsHelper.load(praiseChartsId);
    for (const link of links) {
      link.songDetailId = songDetail.id;
      await repos.songDetailLink.save(link);
    }
  }

  private static async createAdditionalLinks(songDetail: SongDetail, ccliNumber?: string, geniusId?: string): Promise<void> {
    const repos = await RepoManager.getRepos<Repos>("content");
    const existingLinks = await repos.songDetailLink.loadForSongDetail(songDetail.id);

    // Create CCLI link if provided and doesn't exist
    if (ccliNumber && !existingLinks.some((link: SongDetailLink) => link.service === "CCLI" && link.serviceKey === ccliNumber)) {
      const ccliLink: SongDetailLink = {
        songDetailId: songDetail.id,
        service: "CCLI",
        serviceKey: ccliNumber,
        url: `https://songselect.ccli.com/Songs/${ccliNumber}`
      };
      await repos.songDetailLink.save(ccliLink);
    }

    // Create Genius link if provided and doesn't exist
    if (geniusId && !existingLinks.some((link: SongDetailLink) => link.service === "Genius" && link.serviceKey === geniusId)) {
      const geniusLink: SongDetailLink = {
        songDetailId: songDetail.id,
        service: "Genius",
        serviceKey: geniusId,
        url: `https://genius.com/songs/${geniusId}`
      };
      await repos.songDetailLink.save(geniusLink);
    }
  }

  private static async createSongAndArrangement(churchId: string, songDetail: SongDetail, freeShowSong: FreeShowSong): Promise<Arrangement> {
    // Create new Song
    const song: Song = {
      churchId,
      name: songDetail.title,
      dateAdded: new Date()
    };
    const repos = await RepoManager.getRepos<Repos>("content");
    const savedSong = await repos.song.save(song);

    // Create new Arrangement
    const arrangement: Arrangement = {
      churchId,
      songId: savedSong.id,
      songDetailId: songDetail.id,
      name: "Default",
      lyrics: freeShowSong.lyrics || "",
      freeShowId: freeShowSong.freeShowId
    };
    const result = await repos.arrangement.save(arrangement);

    const arrangementKey: ArrangementKey = {
      churchId,
      arrangementId: arrangement.id,
      keySignature: songDetail.keySignature || "",
      shortDescription: "Default"
    };
    await repos.arrangementKey.save(arrangementKey);

    return result;
  }
}
