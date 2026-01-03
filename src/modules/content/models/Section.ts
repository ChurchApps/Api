import { Element } from "./Element.js";

export class Section {
  public id?: string;
  public churchId?: string;
  public pageId?: string;
  public blockId?: string;
  public zone?: string;
  public background?: string;
  public textColor?: string;
  public headingColor?: string;
  public linkColor?: string;
  public sort?: number;
  public targetBlockId?: string;
  public answersJSON?: string;
  public stylesJSON?: string;
  public animationsJSON?: string;

  public answers?: any;
  public styles?: any;
  public animations?: any;
  public elements?: Element[];
  public sections?: Section[];
}
