import OpenAI from "openai";
import axios from "axios";
import { Environment } from "../../../shared/helpers/Environment.js";

export class OpenAiHelper {
  private static openai: OpenAI | null = null;
  private static provider: string = Environment.aiProvider || "openrouter";
  private static OPENAI_API_KEY = Environment.openAiApiKey || "";
  private static OPENROUTER_API_KEY = Environment.openRouterApiKey || "";

  public static async initialize() {
    if (this.provider === "openai") {
      if (!this.OPENAI_API_KEY) {
        throw new Error("Missing ApiKey for OpenAi provider.");
      }
      if (!this.openai) {
        this.openai = new OpenAI({ apiKey: this.OPENAI_API_KEY });
      }
    }

    if (this.provider === "openrouter" && !this.OPENROUTER_API_KEY) {
      throw new Error("Missing ApiKey for OpenRouter provider.");
    }

    return this.openai;
  }

  private static async getCompletion(prompt: string) {
    if (this.provider === "openai") {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: "You are a church social media strategist."
          },
          { role: "user", content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 500
      });

      return response.choices[0]?.message?.content || "";
    }

    if (this.provider === "openrouter") {
      const response = await axios.post(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          model: "mistralai/devstral-small:free",
          messages: [
            {
              role: "system",
              content: "You are a church social media strategist."
            },
            { role: "user", content: prompt }
          ]
        },
        {
          headers: {
            Authorization: `Bearer ${this.OPENROUTER_API_KEY}`,
            "Content-Type": "application/json"
          }
        }
      );

      return response.data.choices[0]?.message?.content || "";
    }

    throw new Error(`Unsupported provider: ${this.provider}`);
  }

  private static parsePosts(rawResponse: string) {
    try {
      // try parsing json
      const jsonStart = rawResponse.indexOf("[");
      const jsonEnd = rawResponse.lastIndexOf("]") + 1;
      const jsonString = rawResponse.slice(jsonStart, jsonEnd);

      const parsed = JSON.parse(jsonString);

      if (Array.isArray(parsed)) {
        return parsed.map((item: any) => ({
          postIdea: item.postIdea || "",
          visual: item.visual || "",
          caption: item.caption || ""
        }));
      }
      throw new Error("Invalid format returned from AI.");
    } catch {
      throw new Error("Failed to parse AI response");
    }
  }

  public static async generateSocialMediaPosts(notes: string) {
    const prompt =
      `You are a church social media manager. I want you to create three posts that will be used the week after this sermon to remind people what was discussed, prompt them to apply it this week and engage with the post.
      These are posts that will be shared after the sermon.  Do not hype an upcoming sermon.

        For each idea, return an object with the following format:
        {
            postIdea: string,
            visual: string,
            caption: string
        }

        Only populate postIdea with the exact contents of the post.  The other two field should be empty strings.

        Return the response as a JSON array of 3 objects.

        Notes: ${notes}
        `.trim();

    /*
    const prompt =
      `You are a church social media manager. Based on the notes below, generate 3 engaging and inspiring social media content ideas.

        For each idea, return an object with the following format:
        {
            postIdea: string,
            visual: string,
            caption: string
        }

        Return the response as a JSON array of 3 objects.

        Notes: ${notes}
        `.trim();*/

    if (!notes || notes.length === 0) {
      // prompt = `You are a church social media manager. Generate 3 engaging and inspiring social media content ideas for church's socials.

      // For each idea, return an object with the following format:
      // {
      //     postIdea: string,
      //     visual: string,
      //     caption: string
      // }

      // Return the response as a JSON array of 3 objects.
      // `.trim();
      throw new Error("No notes provided");
    }
    const completion = await this.getCompletion(prompt);

    const parsedPosts = this.parsePosts(completion);
    return parsedPosts;
  }

  public static async generateLessonOutline(url: string, title: string, author: string) {
    const prompt = `Give me a 45 minutes detailed small group lesson outline based on this URL: ${url}. If the link doesn't work then, create the detailed small group lesson outline based on the title of the sermon and it's author/speaker. The sermon title is ${title} and it's author/speaker is ${author}.`;
    const completion = await this.getCompletion(prompt);

    return { outline: completion };
  }
}
