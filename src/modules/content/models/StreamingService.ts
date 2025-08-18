export class StreamingService {
  id?: string;
  churchId: string;
  serviceTime: Date;
  earlyStart: number;
  chatBefore: number;
  chatAfter: number;
  provider: string;
  providerKey: string;
  videoUrl: string;
  timezoneOffset: number;
  recurring: boolean;
  label: string;
  sermonId: string;
}
