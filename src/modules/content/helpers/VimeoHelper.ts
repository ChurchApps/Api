import axios from "axios";
import { Sermon } from "../models/index.js";
import { Environment } from "../../../shared/helpers/Environment.js";

export class VimeoHelper {
  public static async getSermon(videoId: string) {
    const url = `https://api.vimeo.com/videos/${videoId}`;
    const axiosConfig = { headers: { Authorization: "Bearer " + Environment.vimeoToken } };
    const result = { title: "", thumbnail: "", description: "", duration: 0, publishDate: new Date() };
    const json: any = (await axios.get(url, axiosConfig)).data;
    if (json) {
      result.title = json.name;
      result.thumbnail = json.pictures.base_link || "";
      result.description = json.description;
      result.duration = json.duration;
      result.publishDate = new Date(json.created_time);
    }
    return result;
  }

  public static async getVideosFromChannel(churchId: string, channelId: string) {
    const allSermons: Sermon[] = [];
    let data = await this.getVideoPage(churchId, channelId, 1);
    allSermons.push(...data.sermons);
    let page = 1;
    while (page < data.lastPage) {
      data = await this.getVideoPage(churchId, channelId, data.nextPage);
      allSermons.push(...data.sermons);
      page++;
    }
    return allSermons;
  }

  public static async getVideoPage(churchId: string, channelId: string, page: number) {
    const url = `https://api.vimeo.com/channels/${channelId}/videos?per_page=50&sort=date&page=${page}`;
    const axiosConfig = { headers: { Authorization: "Bearer " + Environment.vimeoToken } };
    const json: any = (await axios.get(url, axiosConfig)).data;
    const urlParams = new URLSearchParams(json.paging.last);
    const result = {
      sermons: this.convertToSermons(churchId, json),
      nextPage: Number(json.page + 1),
      lastPage: Number(urlParams.get("page"))
    };
    return result;
  }

  private static convertToSermons(churchId: string, json: any) {
    const sermons: Sermon[] = [];
    for (const item of json.data) {
      const videoId = item.uri.replace("/videos/", "");
      const sermon: Sermon = {
        churchId,
        title: item.name,
        thumbnail: item.pictures.base_link || "",
        description: item.description,
        publishDate: new Date(item.created_time),
        videoType: "vimeo",
        videoData: videoId,
        duration: item.duration,
        permanentUrl: false,
        playlistId: "",
        videoUrl: `https://player.vimeo.com/video/${videoId}?autoplay=1`
      };
      sermons.push(sermon);
    }
    return sermons;
  }
}
