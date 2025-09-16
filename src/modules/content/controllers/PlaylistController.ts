import { controller, httpPost, httpGet, requestParam } from "inversify-express-utils";
import express from "express";
import { Playlist } from "../models";
import { ContentCrudController } from "./ContentCrudController";
import { Permissions } from "../../../shared/helpers";
import { Environment } from "../helpers";
import { FileStorageHelper } from "@churchapps/apihelper";

@controller("/content/playlists")
export class PlaylistController extends ContentCrudController {
  protected crudSettings = {
    repoKey: "playlist",
    permissions: { view: null, edit: Permissions.streamingServices.edit },
    routes: ["getById", "getAll", "delete"] as const
  };
  @httpGet("/public/:churchId")
  public async loadPublicAll(@requestParam("churchId") churchId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      return await this.repos.playlist.loadPublicAll(churchId);
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, Playlist[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.streamingServices.edit)) return this.json({}, 401);
      else {
        let playlists: Playlist[] = req.body;
        const promises: Promise<Playlist>[] = [];
        // playlist.forEach((s) => { if (s.churchId === au.churchId) promises.push(this.repos.playlist.save(s)); });

        for (const p of playlists) {
          let base64Photo = "";
          if (p.thumbnail && p.thumbnail.startsWith("data:image/png;base64,")) {
            base64Photo = p.thumbnail;
            p.thumbnail = "";
          }
          if (p.churchId === au.churchId)
            promises.push(
              this.repos.playlist.save(p).then(async (playlist: Playlist) => {
                if (base64Photo) {
                  playlist.thumbnail = base64Photo;
                  await this.savePhoto(au.churchId, playlist);
                }
                return playlist;
              })
            );
        }

        playlists = await Promise.all(promises);
        return this.json(playlists, 200);
      }
    });
  }

  private async savePhoto(churchId: string, playlist: Playlist) {
    const base64 = playlist.thumbnail.split(",")[1];
    const key = "/" + churchId + "/streamingLive/playlists/" + playlist.id + ".png";

    return FileStorageHelper.store(key, "image/png", Buffer.from(base64, "base64")).then(async () => {
      const photoUpdated = new Date();
      playlist.thumbnail = Environment.contentRoot + key + "?dt=" + photoUpdated.getTime().toString();
      await this.repos.playlist.save(playlist);
    });
  }
}
