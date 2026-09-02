import { controller, httpGet, httpPut } from "inversify-express-utils";
import express from "express";
import { CommonsBaseController } from "./CommonsBaseController.js";
import { ContentLibraryHelper } from "../helpers/index.js";
import { Author, AuthorLink } from "../models/index.js";

const BIO_MAX = 2000;
const LINKS_MAX = 5;

function parseLinks(raw?: string): AuthorLink[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Returns the cleaned links, or a message naming the first thing wrong with them. */
function cleanLinks(input: unknown): { links: AuthorLink[] } | { error: string } {
  if (input === undefined || input === null) return { links: [] };
  if (!Array.isArray(input)) return { error: "Links must be a list" };
  if (input.length > LINKS_MAX) return { error: `No more than ${LINKS_MAX} links` };
  const links: AuthorLink[] = [];
  for (const raw of input) {
    const url = String((raw as AuthorLink)?.url || "").trim();
    if (!url) continue;
    if (!/^https?:\/\/\S+$/i.test(url)) return { error: `${url} is not an http or https link` };
    links.push({ label: String((raw as AuthorLink)?.label || "").trim().slice(0, 60), url: url.slice(0, 255) });
  }
  return { links };
}

// Separate prefix so /commons/songs/:id cannot swallow author ids.
@controller("/commons/authors")
export class CommonsAuthorController extends CommonsBaseController {
  // authz-exempt: the caller's own author row, resolved from au.id — there is nothing else to authorize
  @httpGet("/mine")
  public async mine(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapperAuth(req, res, async (au) => {
      const author = await this.repos.author.loadByUserId(au.id);
      return author ? this.profile(author) : {};
    });
  }

  // authz-exempt: only the author row already claimed by au.id can be written
  @httpPut("/mine")
  public async saveMine(req: express.Request<{}, {}, { bio?: string; links?: AuthorLink[] }>, res: express.Response): Promise<any> {
    return this.actionWrapperAuth(req, res, async (au) => {
      const author = await this.repos.author.loadByUserId(au.id);
      if (!author) return this.json({ errors: ["You don't have a writer page yet. Publish a song first."] }, 404);
      const bio = typeof req.body?.bio === "string" ? req.body.bio.trim() : "";
      if (bio.length > BIO_MAX) return this.json({ errors: [`Bio is limited to ${BIO_MAX} characters`] }, 400);
      const cleaned = cleanLinks(req.body?.links);
      if ("error" in cleaned) return this.json({ errors: [cleaned.error] }, 400);
      await this.repos.author.update(author.id || "", { bio: bio || null, links: cleaned.links.length ? JSON.stringify(cleaned.links) : null });
      return this.profile({ ...author, bio, links: JSON.stringify(cleaned.links) });
    });
  }

  @httpGet("/:id")
  public async get(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const id = String(req.params.id);
      const [author, songs] = await Promise.all([
        this.repos.author.loadById(id),
        this.repos.song.loadPublishedByAuthor(id)
      ]);
      if (!author) return this.json({}, 404);
      return {
        ...this.profile(author),
        songs: songs.map((s) => ({ id: s.id, title: s.title, year: s.year, language: s.language, license: s.license }))
      };
    });
  }

  private profile(author: Author) {
    const portrait = author.portraitUrl || "";
    const portraitUrl = !portrait ? undefined : portrait.startsWith("http") ? portrait : ContentLibraryHelper.publicUrl(portrait);
    return { id: author.id, name: author.name, bio: author.bio, portraitUrl, links: parseLinks(author.links) };
  }
}
