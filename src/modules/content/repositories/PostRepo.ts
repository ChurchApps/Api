import { injectable } from "inversify";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { getDb } from "../db/index.js";
import { Post } from "../models/index.js";

@injectable()
export class PostRepo {
  public async save(model: Post) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: Post): Promise<Post> {
    if (!model.id) model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("posts").values({
      id: model.id,
      churchId: model.churchId,
      title: model.title,
      slug: model.slug,
      excerpt: model.excerpt,
      content: model.content,
      authorId: model.authorId,
      photoUrl: model.photoUrl,
      publishDate: model.publishDate,
      category: model.category,
      tags: model.tags
    } as any).execute();
    return model;
  }

  private async update(model: Post): Promise<Post> {
    await getDb().updateTable("posts").set({
      title: model.title,
      slug: model.slug,
      excerpt: model.excerpt,
      content: model.content,
      authorId: model.authorId,
      photoUrl: model.photoUrl,
      publishDate: model.publishDate,
      category: model.category,
      tags: model.tags
    } as any).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("posts").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string): Promise<Post | undefined> {
    return (await getDb().selectFrom("posts").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string): Promise<Post[]> {
    return getDb().selectFrom("posts").selectAll().where("churchId", "=", churchId).orderBy("publishDate", "desc").execute() as any;
  }

  public async loadBySlug(churchId: string, slug: string): Promise<Post | undefined> {
    return (await getDb().selectFrom("posts").selectAll().where("churchId", "=", churchId).where("slug", "=", slug).executeTakeFirst()) ?? null;
  }

  public async loadPublishedBySlug(churchId: string, slug: string): Promise<Post | undefined> {
    return (await getDb().selectFrom("posts").selectAll()
      .where("churchId", "=", churchId)
      .where("slug", "=", slug)
      .where("publishDate", "is not", null)
      .where("publishDate", "<=", new Date())
      .executeTakeFirst()) ?? null;
  }

  public async loadPublished(churchId: string, options: { category?: string; tag?: string; limit?: number; offset?: number } = {}): Promise<Post[]> {
    let query = getDb().selectFrom("posts").selectAll()
      .where("churchId", "=", churchId)
      .where("publishDate", "is not", null)
      .where("publishDate", "<=", new Date());
    if (options.category) query = query.where("category", "=", options.category);
    if (options.tag) query = query.where("tags", "like", "%" + options.tag + "%");
    query = query.orderBy("publishDate", "desc");
    if (options.limit) query = query.limit(options.limit);
    if (options.offset) query = query.offset(options.offset);
    return query.execute() as any;
  }

  public convertToModel(_churchId: string, data: any) { return data as Post; }
  public convertAllToModel(_churchId: string, data: any[]) { return (data || []) as Post[]; }
}
