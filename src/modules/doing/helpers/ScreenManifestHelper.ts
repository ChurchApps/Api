import crypto from "crypto";
import { getProvider, ContentProviderAuthData } from "@churchapps/content-providers";
import { getMembershipModuleGateway } from "../../../shared/modules/index.js";
import { Plan, PlanItem, PlanType, PlaylistItem, ScheduleEntry, ScreenGroup } from "../models/index.js";
import { Repos } from "../repositories/index.js";
import { ProviderAuthHelper } from "./ProviderAuthHelper.js";
import { ScreenScheduleHelper } from "./ScreenScheduleHelper.js";
import { SignageFeedHelper } from "./SignageFeedHelper.js";

export interface ManifestItem {
  cacheKey: string;
  title: string;
  mediaType: "video" | "image" | "audio";
  seconds: number;
  loopVideo: boolean;
  url?: string;
  headers?: Record<string, string>;
  expiresAt?: string;
  resolve: "url" | "lan";
  providerId?: string;
  providerPath?: string;
  fileId?: string;
}

export interface ManifestOccurrence {
  id: string;
  title: string;
  start: string;
  end: string;
  endBehavior: string;
  items: ManifestItem[];
}

export interface ScreenManifest {
  timeZone: string;
  screenGroupName: string;
  generatedAt: string;
  rev: string;
  validUntil: string;
  fallbackTitle: string | null;
  fallback: ManifestItem[] | null;
  occurrences: ManifestOccurrence[];
}

interface EntryContent {
  title: string;
  items: ManifestItem[];
}

interface ProviderFile {
  id?: string;
  title?: string;
  mediaType?: "video" | "image" | "audio";
  url?: string;
  seconds?: number;
  loopVideo?: boolean;
}

interface Provider {
  readonly requiresAuth: boolean | (() => boolean);
  getPresentations?(path: string, auth?: ContentProviderAuthData | null): Promise<{ allFiles?: unknown[] } | null>;
  getPlaylist?(path: string, auth?: ContentProviderAuthData | null, resolution?: number): Promise<unknown[] | null>;
}

interface BuildContext {
  repos: Repos;
  churchId: string;
  files: Map<string, Promise<ProviderFile[] | null>>;
  auth: Map<string, Promise<ContentProviderAuthData | null>>;
}

const TOKEN_URLS: Record<string, (fileId: string) => string> = {
  googledrive: (fileId) => `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
  onedrive: (fileId) => `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(fileId)}/content`
};

const CACHE_MS = 5 * 60 * 1000;

export class ScreenManifestHelper {
  private static cache = new Map<string, { expires: number; manifest: ScreenManifest }>();

  static async build(repos: Repos, churchId: string, screenGroupId: string, now = new Date()): Promise<ScreenManifest | null> {
    const group: ScreenGroup = repos.screenGroup.convertToModel(churchId, await repos.screenGroup.load(churchId, screenGroupId));
    if (!group) return null;
    const timeZone = await this.churchTimeZone(churchId);
    const ctx: BuildContext = { repos, churchId, files: new Map(), auth: new Map() };

    const fallbackContent = group.defaultPlaylistId ? await this.playlistContent(ctx, group.defaultPlaylistId) : null;
    const fallback = fallbackContent?.items || null;
    const fallbackTitle = fallbackContent?.title || null;
    const entries: ScheduleEntry[] = repos.scheduleEntry.convertAllToModel(churchId, await repos.scheduleEntry.loadByScreenGroupId(churchId, screenGroupId));
    const expanded = ScreenScheduleHelper.expand(entries, now, timeZone);

    const uniqueEntries = [...new Set(expanded.map((o) => o.entry))];
    const contents = await Promise.all(uniqueEntries.map((entry) => this.entryContent(ctx, entry)));
    const contentByEntry = new Map<string, EntryContent>(uniqueEntries.map((entry, i) => [entry.id, contents[i]]));
    const segments = ScreenScheduleHelper.buildTimeline(expanded.filter((o) => contentByEntry.get(o.entry.id)?.items.length));

    const occurrences: ManifestOccurrence[] = segments.map((s) => ({
      id: s.id,
      title: contentByEntry.get(s.entry.id).title,
      start: s.start.toISOString(),
      end: s.end.toISOString(),
      endBehavior: ScreenScheduleHelper.playbackEndBehavior(s.entry.endBehavior),
      items: contentByEntry.get(s.entry.id).items
    }));
    const rev = crypto.createHash("sha1").update(JSON.stringify({ timeZone, screenGroupName: group.name, fallbackTitle, fallback, occurrences })).digest("hex");
    return {
      timeZone,
      screenGroupName: group.name || "",
      generatedAt: now.toISOString(),
      rev,
      validUntil: new Date(now.getTime() + ScreenScheduleHelper.WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString(),
      fallbackTitle,
      fallback,
      occurrences
    };
  }

  // Churches created after the timeZone backfill have none set, so fall back to the campus zone before New York.
  // FreePlayAdmin reads this too, so the calendar and the TV agree on what a wall-clock time means.
  static async churchTimeZone(churchId: string): Promise<string> {
    const gateway = getMembershipModuleGateway();
    const church = await gateway.loadChurch(churchId);
    return ScreenScheduleHelper.validTimeZone(church?.timeZone || (await gateway.loadCampusTimeZone(churchId)));
  }

  // Warm-instance cache so the media route can find an item without re-querying providers per file.
  static async buildCached(repos: Repos, deviceKey: string, churchId: string, screenGroupId: string, forceFresh = false): Promise<ScreenManifest | null> {
    const now = Date.now();
    const cached = this.cache.get(deviceKey);
    if (!forceFresh && cached && cached.expires > now) return cached.manifest;
    const manifest = await this.build(repos, churchId, screenGroupId);
    for (const [key, value] of this.cache) if (value.expires <= now) this.cache.delete(key);
    if (manifest) this.cache.set(deviceKey, { expires: now + CACHE_MS, manifest });
    return manifest;
  }

  // Drive has no pre-signed links, so the item carries the alt=media url plus a short-lived bearer the TV sends on that request
  // (refreshed on every manifest). OneDrive's /content answers with a 302 to a pre-signed link, which goes out as a plain url.
  private static async directDownload(ctx: BuildContext, providerId: string, fileId: string): Promise<{ url: string; headers?: Record<string, string> } | null> {
    const build = TOKEN_URLS[providerId];
    if (!build) return null;
    const auth = await this.providerAuth(ctx, providerId);
    if (!auth) return null;
    const url = build(fileId);
    const headers = { Authorization: `Bearer ${auth.access_token}` };
    if (providerId !== "onedrive") return { url, headers };
    try {
      const res = await fetch(url, { headers, redirect: "manual" });
      const location = res.headers.get("location");
      if (location) return { url: location };
    } catch (e) {
      console.error("Screen manifest: onedrive link lookup failed", e);
    }
    return { url, headers };
  }

  // One lookup per provider per build; every file in a Drive playlist used to re-read the auth row.
  private static providerAuth(ctx: BuildContext, providerId: string): Promise<ContentProviderAuthData | null> {
    if (!ctx.auth.has(providerId)) ctx.auth.set(providerId, ProviderAuthHelper.getAuth(ctx.repos, ctx.churchId, null, providerId));
    return ctx.auth.get(providerId);
  }

  private static requiresAuth(provider: Provider): boolean {
    return typeof provider.requiresAuth === "function" ? provider.requiresAuth() : provider.requiresAuth;
  }

  private static providerNeedsAuth(providerId: string): boolean {
    const provider = getProvider(providerId) as unknown as Provider | null;
    return !!provider && this.requiresAuth(provider);
  }

  private static providerFiles(ctx: BuildContext, providerId: string, path: string): Promise<ProviderFile[] | null> {
    const key = `${providerId}|${path}`;
    if (!ctx.files.has(key)) ctx.files.set(key, this.loadProviderFiles(ctx, providerId, path));
    return ctx.files.get(key);
  }

  private static async loadProviderFiles(ctx: BuildContext, providerId: string, path: string): Promise<ProviderFile[] | null> {
    try {
      const provider = getProvider(providerId) as unknown as Provider | null;
      if (!provider) return null;
      const needsAuth = this.requiresAuth(provider);
      const auth = needsAuth ? await this.providerAuth(ctx, providerId) : null;
      if (needsAuth && !auth) return null;
      if (provider.getPlaylist) return ((await provider.getPlaylist(path, auth)) || []) as ProviderFile[];
      if (provider.getPresentations) return ((await provider.getPresentations(path, auth))?.allFiles || []) as ProviderFile[];
      return null;
    } catch (e) {
      console.error(`Screen manifest: ${providerId} playlist lookup failed`, e);
      return null;
    }
  }

  // Auth-provider urls are short-lived links, so only stable urls take part in the cache key.
  private static async toItem(ctx: BuildContext, file: ProviderFile, providerId: string | undefined, providerPath: string | undefined, fileId: string | undefined, keyUrl: string | undefined): Promise<ManifestItem> {
    const resolve = ScreenScheduleHelper.resolveType(providerId);
    const mediaType = file.mediaType || ScreenScheduleHelper.mediaTypeFromUrl(file.url);
    const ephemeralUrl = resolve === "url" && !!providerId && !!fileId && this.providerNeedsAuth(providerId);
    const direct = providerId && fileId && TOKEN_URLS[providerId] ? await this.directDownload(ctx, providerId, fileId) : null;
    return {
      cacheKey: ScreenScheduleHelper.cacheKey(providerId, fileId, ephemeralUrl ? undefined : keyUrl),
      title: file.title || "",
      mediaType,
      seconds: file.seconds || (mediaType === "image" ? 10 : 0),
      loopVideo: !!file.loopVideo,
      url: direct?.url || file.url,
      headers: direct?.headers,
      resolve,
      providerId,
      providerPath,
      fileId
    };
  }

  private static async playlistContent(ctx: BuildContext, playlistId: string): Promise<EntryContent | null> {
    const playlist = ctx.repos.playlist.convertToModel(ctx.churchId, await ctx.repos.playlist.load(ctx.churchId, playlistId));
    if (!playlist) return null;
    const result = await Promise.all(((playlist.items || []) as PlaylistItem[]).map(async (item) => {
      const fileId = item.fileId || item.id;
      let url = item.url;
      if (item.providerId && item.providerPath && ScreenScheduleHelper.resolveType(item.providerId) === "url" && this.providerNeedsAuth(item.providerId)) {
        const match = (await this.providerFiles(ctx, item.providerId, item.providerPath))?.find((f) => f.id === fileId);
        if (match?.url) url = match.url;
      }
      return this.toItem(ctx, { ...item, url }, item.providerId, item.providerPath, fileId, item.url);
    }));
    return { title: playlist.name || "", items: result };
  }

  private static async planTypeTitle(ctx: BuildContext, planTypeId: string): Promise<string> {
    const planType: PlanType = await ctx.repos.planType.load(ctx.churchId, planTypeId);
    if (!planType) return "";
    const ministry = planType.ministryId ? await getMembershipModuleGateway().loadGroup(ctx.churchId, planType.ministryId) : null;
    return ministry?.name ? `${ministry.name} — ${planType.name || ""}` : planType.name || "";
  }

  private static async planTypeContent(ctx: BuildContext, planTypeId: string): Promise<EntryContent> {
    const title = await this.planTypeTitle(ctx, planTypeId);
    const plan = (await ctx.repos.plan.loadCurrentByPlanTypeId(planTypeId)) as Plan;
    if (!plan || plan.churchId !== ctx.churchId) return { title, items: [] };
    const planItems = (await ctx.repos.planItem.loadForPlan(ctx.churchId, plan.id)) as PlanItem[];
    const { messages } = await SignageFeedHelper.buildPlanFeed(plan, planItems);
    const items = await Promise.all(messages.flatMap((m) => m.files.map((f) => this.toItem(ctx, { title: f.name || m.name, url: f.url, seconds: f.seconds, loopVideo: f.loopVideo }, undefined, undefined, undefined, f.url))));
    return { title, items };
  }

  // The cloud can't reach a LAN provider, so its folder ships as one reference item (no fileId) the TV expands locally.
  private static async folderItems(ctx: BuildContext, providerId: string, path: string): Promise<ManifestItem[]> {
    if (ScreenScheduleHelper.resolveType(providerId) === "lan") {
      return [{ cacheKey: ScreenScheduleHelper.cacheKey(providerId, path, ""), title: path, mediaType: "video", seconds: 0, loopVideo: false, resolve: "lan", providerId, providerPath: path }];
    }
    const files = (await this.providerFiles(ctx, providerId, path)) || [];
    return Promise.all(files.filter((f) => f.url).map((f) => this.toItem(ctx, f, providerId, path, f.id, f.url)));
  }

  private static async entryContent(ctx: BuildContext, entry: ScheduleEntry): Promise<EntryContent> {
    if (entry.targetType === "playlist" && entry.targetId) return (await this.playlistContent(ctx, entry.targetId)) || { title: "", items: [] };
    if (entry.targetType === "planType" && entry.targetId) return this.planTypeContent(ctx, entry.targetId);
    if (entry.targetType === "providerFolder" && entry.providerId && entry.providerPath) return { title: entry.providerPath, items: await this.folderItems(ctx, entry.providerId, entry.providerPath) };
    return { title: "", items: [] };
  }
}
