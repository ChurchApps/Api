export interface PlaylistItem {
  id?: string;
  title?: string;
  mediaType?: "video" | "image" | "audio";
  thumbnail?: string;
  url?: string;
  seconds?: number;
  loopVideo?: boolean;
  providerId?: string;
  providerPath?: string;
  fileId?: string;
}

export class Playlist {
  public id?: string;
  public churchId?: string;
  public name?: string;
  public items?: PlaylistItem[];
  public updatedAt?: Date;
}
