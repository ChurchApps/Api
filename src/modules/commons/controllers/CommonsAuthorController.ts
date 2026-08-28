import { controller, httpGet } from "inversify-express-utils";
import express from "express";
import { CommonsBaseController } from "./CommonsBaseController.js";
import { ContentLibraryHelper } from "../helpers/index.js";

// Separate prefix so /commons/songs/:id cannot swallow author ids.
@controller("/commons/authors")
export class CommonsAuthorController extends CommonsBaseController {
  @httpGet("/:id")
  public async get(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const id = String(req.params.id);
      const [author, songs] = await Promise.all([
        this.repos.author.loadById(id),
        this.repos.song.loadPublishedByAuthor(id)
      ]);
      if (!author) return this.json({}, 404);
      const portrait = author.portraitUrl || "";
      const portraitUrl = !portrait ? undefined : portrait.startsWith("http") ? portrait : ContentLibraryHelper.publicUrl(portrait);
      return {
        id: author.id,
        name: author.name,
        bio: author.bio,
        portraitUrl,
        songs: songs.map((s) => ({ id: s.id, title: s.title, year: s.year, language: s.language, license: s.license }))
      };
    });
  }
}
