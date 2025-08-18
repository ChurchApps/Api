import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";
import { Readable } from "stream";

export class PollyHelper {
  static async SsmlToMp3(ssmlString: string) {
    const meta = await this.getMetadata(ssmlString);
    const buffer = await this.getMp3(ssmlString);
    return { buffer, meta };
  }

  static async getMp3(ssmlString: string) {
    const pollyClient = new PollyClient({ region: "us-east-1" });
    const synthesizeSpeechCommand = new SynthesizeSpeechCommand({
      OutputFormat: "mp3",
      Text: ssmlString,
      TextType: "ssml",
      VoiceId: "Matthew",
      Engine: "neural"
    });

    try {
      const response = await pollyClient.send(synthesizeSpeechCommand);
      if (response.AudioStream instanceof Readable) {
        const chunks: Buffer[] = [];
        for await (const chunk of response.AudioStream) chunks.push(chunk);
        const buffer = Buffer.concat(chunks);
        return buffer.toString("base64");
      } else throw new Error("Failed to generate audio stream");
    } catch (error) {
      throw new Error(`Failed to synthesize speech: ${error.message || error}`);
    }
  }

  static async getMetadata(ssmlString: string) {
    const pollyClient = new PollyClient({ region: "us-east-1" });
    const synthesizeSpeechCommand = new SynthesizeSpeechCommand({
      OutputFormat: "json",
      Text: ssmlString,
      TextType: "ssml",
      VoiceId: "Matthew",
      Engine: "neural",
      SpeechMarkTypes: ["ssml"]
    });

    try {
      const response = await pollyClient.send(synthesizeSpeechCommand);
      if (response.AudioStream instanceof Readable) {
        const chunks: Buffer[] = [];
        for await (const chunk of response.AudioStream) chunks.push(chunk);
        const buffer = Buffer.concat(chunks);
        const json = "[" + buffer.toString().trim().replaceAll("\n", ",") + "]";
        const obj = JSON.parse(json);
        return obj;
      } else throw new Error("Failed to generate audio stream");
    } catch (error) {
      throw new Error(`Failed to get speech metadata: ${error.message || error}`);
    }
  }
}
