export class Query {
  public keyName?: string;
  public db?: string;
  public sqlLines?: string[];
  public depth?: number;
  public value?: Record<string, unknown>[];
  public joinConditions?: { parent: string; child: string }[];
}
