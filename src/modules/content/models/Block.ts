import { Section } from "./Section.js";

export class Block {
  public id?: string;
  public churchId?: string;
  public blockType?: string;
  public name?: string;

  public sections?: Section[];
}
