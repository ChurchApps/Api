import { sql, type RawBuilder } from "kysely";

// The Kysely table types are the models, so DATE/DATETIME columns are typed as Date and TINYINT(1) columns as boolean.
// MySQL also takes "YYYY-MM-DD[ HH:mm:ss]" strings and 1/0 for them. This binds such a value as a typed parameter;
// it compiles to the same "?" placeholder and parameter as passing the value directly.
export function mysqlValue<T>(value: string | number): RawBuilder<T> {
  return sql<T>`${value}`;
}
