import { Section } from "./Section.js";

export class Page {
  public id?: string;
  public churchId?: string;
  public url?: string;
  public title?: string;
  public layout?: string;
  public publishedJSON?: string;
  public publishedAt?: Date;

  public sections?: Section[];
}
