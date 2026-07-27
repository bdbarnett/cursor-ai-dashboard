declare module "sql.js" {
  export interface SqlJsStatic {
    Database: new (data?: ArrayLike<number> | Buffer | null) => Database;
  }
  export interface Database {
    prepare(sql: string): Statement;
    exec(sql: string): Array<{ columns: string[]; values: unknown[][] }>;
    close(): void;
  }
  export interface Statement {
    bind(values: unknown[]): void;
    step(): boolean;
    getAsObject(): Record<string, unknown>;
    free(): void;
  }
  export default function initSqlJs(config?: unknown): Promise<SqlJsStatic>;
}
