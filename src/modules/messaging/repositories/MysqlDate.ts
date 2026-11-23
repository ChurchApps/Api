import { sql, RawBuilder } from "kysely";
import { DateHelper } from "../../../shared/helpers/DateHelper.js";

// Binds the MySQL-formatted string as a plain parameter, typed as the Date column it is compared with or written to.
export const mysqlDate = (date: Date | string | null | undefined): RawBuilder<Date> => sql<Date>`${DateHelper.toMysqlDate(date)}`;
