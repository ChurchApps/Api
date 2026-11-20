import "reflect-metadata";

jest.mock("../../db/index.js", () => ({ getDb: jest.fn() }));
jest.mock("@churchapps/apihelper", () => ({ UniqueIdHelper: { shortId: () => "gen" } }));

import { RawNode, ValueNode, type RawBuilder } from "kysely";
import { QuestionRepo } from "../QuestionRepo.js";
import { getDb } from "../../db/index.js";

interface Row {
  id: string;
  sort: number | string;
  removed?: boolean;
  [col: string]: unknown;
}
type Where = [string, string, unknown];
interface SelectChain {
  select: () => SelectChain;
  selectAll: () => SelectChain;
  where: (...w: Where) => SelectChain;
  orderBy: () => SelectChain;
  execute: () => Promise<Row[]>;
  executeTakeFirst: () => Promise<Row | undefined>;
}
interface UpdateChain {
  set: (v: Record<string, unknown>) => UpdateChain;
  where: (...w: Where) => UpdateChain;
  execute: () => Promise<void>;
}

const isRaw = (v: unknown): v is RawBuilder<unknown> => typeof v === "object" && v !== null && "toOperationNode" in v;

// In-memory stand-in for the questions table that applies the updates the repo issues.
function fakeDb(rows: Row[]) {
  const matches = (row: Row, wheres: Where[]) => wheres.every(([col, , val]) => (typeof val === "number" ? Number(row[col]) === val : row[col] === val));
  const select = () => {
    const wheres: Where[] = [];
    const chain: SelectChain = {
      select: () => chain,
      selectAll: () => chain,
      where: (...w) => { wheres.push(w); return chain; },
      orderBy: () => chain,
      execute: async () => rows.filter((r) => !r.removed && matches(r, wheres)).sort((a, b) => +a.sort - +b.sort),
      executeTakeFirst: async () => rows.find((r) => matches(r, wheres))
    };
    return chain;
  };
  const update = () => {
    const wheres: Where[] = [];
    let values: Record<string, unknown> = {};
    const chain: UpdateChain = {
      set: (v) => { values = v; return chain; },
      where: (...w) => { wheres.push(w); return chain; },
      execute: async () => {
        rows.filter((r) => matches(r, wheres)).forEach((r) => {
          Object.keys(values).forEach((k) => {
            const value = values[k];
            const node = isRaw(value) ? value.toOperationNode() : null;
            const sqlText = node ? JSON.stringify(node) : null;
            if (sqlText?.includes("sort+1")) r[k] = Number(r[k]) + 1;
            else if (sqlText?.includes("sort-1")) r[k] = Number(r[k]) - 1;
            // A bound value such as sql`${2}`: apply the parameter.
            else if (node && RawNode.is(node) && node.parameters.length === 1 && ValueNode.is(node.parameters[0])) r[k] = node.parameters[0].value;
            else r[k] = value;
          });
        });
      }
    };
    return chain;
  };
  (getDb as jest.Mock).mockReturnValue({ selectFrom: select, updateTable: update });
}

const order = (rows: Row[]) => rows.filter((r) => !r.removed).sort((a, b) => +a.sort - +b.sort).map((r) => r.id);

// Issue 1254: moves swapped with the row at sort +/- 1, so a form with gaps in its sort
// values (left by save and delete) changed only the moved row and the order did not change.
describe("QuestionRepo move (issue 1254)", () => {
  const repo = new QuestionRepo();
  const form = () => [
    { id: "A", churchId: "c1", formId: "f1", sort: 1, removed: false },
    { id: "B", churchId: "c1", formId: "f1", sort: 2, removed: false },
    { id: "C", churchId: "c1", formId: "f1", sort: 4, removed: false }
  ];

  it("moves a question up past a gap in sort values", async () => {
    const rows = form();
    fakeDb(rows);
    await repo.moveQuestionUp("c1", "C");
    expect(order(rows)).toEqual(["A", "C", "B"]);
  });

  it("moves a question down past a gap in sort values", async () => {
    const rows = form();
    fakeDb(rows);
    await repo.moveQuestionDown("c1", "B");
    expect(order(rows)).toEqual(["A", "C", "B"]);
  });

  it("moves a question up and down on consecutive sort values", async () => {
    const rows = form();
    rows[2].sort = 3;
    fakeDb(rows);
    await repo.moveQuestionUp("c1", "B");
    expect(order(rows)).toEqual(["B", "A", "C"]);
    await repo.moveQuestionDown("c1", "B");
    expect(order(rows)).toEqual(["A", "B", "C"]);
  });

  it("leaves the first question in place when moved up", async () => {
    const rows = form();
    fakeDb(rows);
    await repo.moveQuestionUp("c1", "A");
    expect(order(rows)).toEqual(["A", "B", "C"]);
  });
});
