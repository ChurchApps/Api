export class Sermon {
  id?: string;
  churchId: string;
  playlistId: string;
  videoType: string;
  videoData: string;
  videoUrl: string;
  title: string;
  description: string;
  publishDate: Date;
  thumbnail: string;
  duration: number;
  permanentUrl: boolean;
}
