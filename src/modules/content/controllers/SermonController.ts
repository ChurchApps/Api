import { controller, httpPost, httpGet, httpDelete, requestParam } from "inversify-express-utils";
import express from "express";
import { Playlist, Sermon } from "../models";
import { ContentBaseController } from "./ContentBaseController";
import { Permissions } from "../../../shared/helpers/Permissions";
import { YouTubeHelper, Environment, VimeoHelper, OpenAiHelper } from "../helpers";
import { FileStorageHelper } from "@churchapps/apihelper";

@controller("/content/sermons")
export class SermonController extends ContentBaseController {
  // @httpGet("/subtitles/:id")
  // public async getSubtitles(
  //   @requestParam("id") id: string,
  //   req: express.Request<{}, {}, null>,
  //   res: express.Response
  // ): Promise<any> {
  //   return this.actionWrapper(req, res, async (au) => {
  //     const sermon = await this.repos.sermon.loadById(id, au.churchId);
  //     if (sermon.videoType === "youtube") {
  //       return await TranscriptAPI.getTranscript(sermon.videoData);
  //     }
  //     return [];
  //   });
  // }

  @httpGet("/public/freeshowSample")
  public async getFreeShow(@requestParam("churchId") churchId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async () => {
      const result = {
        id: "freeshow",
        name: "FreeShow",
        prefetch: false,
        playOrder: "sequential",
        messages: [
          {
            name: "Stage Show",
            thumbnail: "",
            slides: [
              {
                seconds: 3600,
                type: "web",
                loop: false,
                files: ["http://192.168.68.74:5511/"]
              }
            ]
          }
        ]
      };
      return result;
    });
  }

  @httpGet("/public/tvWrapper/:churchId")
  public async getTvWrapper(@requestParam("churchId") churchId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async () => {
      const result = {
        treeLabels: ["Content Type"],
        playlists: [
          {
            id: "sermons",
            name: "Sermons",
            description: "Sermon Videos from your Church",
            image:
              "data:image/jpeg;base64,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",
            childrenApi: "https://contentapi.churchapps.org/sermons/public/tvFeed/" + churchId
          },
          {
            id: "lessons",
            name: "Lessons",
            description: "Free Lessons from Lessons.church",
            image: "https://lessons.church/images/og-image.png",
            childrenApi: "https://api.lessons.church/programs/public/tree"
          },
          {
            id: "freeshow",
            name: "FreeShow",
            description: "Connect to FreeShow",
            image: "https://freeshow.app/images/favicon.png",
            apiUrl: "https://contentapi.churchapps.org/sermons/public/freeshowSample"
          }
          //
        ]
      };
      return result;
    });
  }

  @httpGet("/public/tvFeed/:churchId/:sermonId")
  public async getSermonTvFeed(@requestParam("churchId") churchId: string, @requestParam("sermonId") sermonId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const sermon = await this.repos.sermon.loadById(sermonId, churchId);

      const result: any = {
        id: sermon.id,
        name: sermon.title,
        prefetch: false,
        playOrder: "sequential",
        messages: [
          {
            name: sermon.title,
            thumbnail: sermon.thumbnail,
            slides: [
              {
                id: sermon.id,
                name: sermon.title,
                seconds: sermon.duration || 3600 * 24,
                type: "stream",
                loop: false,
                files: [sermon.videoType + ":" + sermon.videoData]
              }
            ]
          }
        ]
      };
      return result;
    });
  }

  @httpGet("/public/tvFeed/:churchId")
  public async getTvFeed(@requestParam("churchId") churchId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const playlists: Playlist[] = await this.repos.playlist.loadPublicAll(churchId);
      const sermons = await this.repos.sermon.loadPublicAll(churchId);

      const result: any = {
        treeLabels: ["Series", "Sermon"],
        playlists: []
      };

      playlists.forEach((playlist: Playlist) => {
        const playlistNode: any = {
          id: playlist.id,
          name: playlist.title,
          description: playlist.description,
          image: playlist.thumbnail,
          children: []
        };

        sermons.forEach((sermon: Sermon) => {
          if (sermon.playlistId === playlistNode.id) {
            const sermonNode: any = {
              id: sermon.id,
              name: sermon.title,
              description: sermon.description,
              image: sermon.thumbnail,
              apiUrl: "https://contentapi.churchapps.org/sermons/public/tvFeed/" + churchId + "/" + sermon.id
            };
            playlistNode.children.push(sermonNode);
          }
        });

        result.playlists.push(playlistNode);
      });
      return result;
    });
  }

  @httpGet("/timeline")
  public async getPosts(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async () => {
      const sermonIds = req.query.sermonIds ? req.query.sermonIds.toString().split(",") : [];
      return await this.repos.sermon.loadTimeline(sermonIds);
    });
  }

  @httpGet("/lookup")
  public async lookup(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      if (req.query.videoType === "youtube") {
        return await YouTubeHelper.getSermon(req.query.videoData as string);
      } else {
        return await VimeoHelper.getSermon(req.query.videoData as string);
      }
    });
  }

  @httpGet("/socialSuggestions")
  public async socialSuggestions(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async () => {
      const youtubeVideoId = req.query?.youtubeVideoId?.toString();
      if (youtubeVideoId && youtubeVideoId !== "") {
        try {
          const result = await YouTubeHelper.fetchAutoGeneratedSubtitles(youtubeVideoId);
          if (result.includes("Error: Subtitle Fetch Failed:")) {
            const spliced = result.split("Error: Subtitle Fetch Failed:")[1];
            return { error: spliced, posts: [] };
          }
          await OpenAiHelper.initialize();
          const posts = await OpenAiHelper.generateSocialMediaPosts(result);
          // Error: Could not load subtitles after multiple attempts
          if (result.includes("Error: Could not load subtitles after multiple attempts")) {
            return {
              error: "Could not load subtitles for this video. Though here are some general post ideas for you to use.",
              posts
            };
          }
          return { error: null, posts };
        } catch (error) {
          throw new Error(error);
        }
      }
      return { error: "Invalid or missing YouTube video ID", posts: [] };
    });
  }

  @httpGet("/outline")
  public async lessonOutline(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async () => {
      const url = req.query?.url?.toString();
      const title = req.query?.title?.toString();
      const author = req.query?.author?.toString();
      if (url && url !== "") {
        try {
          await OpenAiHelper.initialize();
          const result = await OpenAiHelper.generateLessonOutline(url, title, author);
          return result;
        } catch (error) {
          throw new Error(error);
        }
      }
      return { error: "Invalid or missing URL parameter" };
    });
  }

  @httpGet("/youtubeImport/:channelId")
  public async youtubeImport(@requestParam("channelId") channelId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return await YouTubeHelper.getVideosFromChannel(au.churchId, channelId);
    });
  }

  @httpGet("/vimeoImport/:channelId")
  public async vimeoImport(@requestParam("channelId") channelId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return await VimeoHelper.getVideosFromChannel(au.churchId, channelId);
    });
  }

  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return await this.repos.sermon.loadById(id, au.churchId);
    });
  }

  @httpGet("/")
  public async loadAll(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return await this.repos.sermon.loadAll(au.churchId);
    });
  }

  @httpGet("/public/:churchId")
  public async loadPublicAll(@requestParam("churchId") churchId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      return await this.repos.sermon.loadPublicAll(churchId);
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.streamingServices.edit)) return this.json({}, 401);
      else {
        await this.repos.sermon.delete(id, au.churchId);
        return null;
      }
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, Sermon[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.streamingServices.edit)) return this.json({}, 401);
      else {
        let sermons: Sermon[] = req.body;
        const promises: Promise<Sermon>[] = [];
        for (const s of sermons) {
          let base64Photo = "";
          if (s.thumbnail && s.thumbnail.startsWith("data:image/png;base64,")) {
            base64Photo = s.thumbnail;
            s.thumbnail = "";
          }
          if (s.churchId === au.churchId)
            promises.push(
              this.repos.sermon.save(s).then(async (sermon) => {
                if (base64Photo) {
                  sermon.thumbnail = base64Photo;
                  await this.savePhoto(au.churchId, sermon);
                }
                return sermon;
              })
            );
        }
        sermons = await Promise.all(promises);
        return this.json(sermons, 200);
      }
    });
  }

  private async savePhoto(churchId: string, sermon: Sermon) {
    const base64 = sermon.thumbnail.split(",")[1];
    const key = "/" + churchId + "/streamingLive/sermons/" + sermon.id + ".png";

    return FileStorageHelper.store(key, "image/png", Buffer.from(base64, "base64")).then(async () => {
      const photoUpdated = new Date();
      sermon.thumbnail = Environment.contentRoot + key + "?dt=" + photoUpdated.getTime().toString();
      await this.repos.sermon.save(sermon);
    });
  }
}

// when fetching for subtitles, if I get an error send that error. but sometimes even if the subtitles are there it sends an empty array. So what I want is, if it sends an empty array, I want to call for subtitles again. I want to do that 5 times. Even after that, the subtitles is still an empty array, send an error saying, could not load the subtitles for 5 rounds or something.
