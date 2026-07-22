/**
 * A minimal in-memory stand-in for the Supabase JS query builder, used to
 * integration-test our service modules (lib/api/*-service.ts) without a
 * live database.
 *
 * Crucially, it simulates Row Level Security: every table row that has a
 * `user_id` column is invisible to reads/writes unless it matches the fake
 * client's `asUser`, exactly like a real RLS policy of
 * `user_id = auth.uid()`. This lets tests genuinely exercise "a user can
 * never see another user's rows" against the real service code, the same
 * code path production traffic uses, rather than asserting against SQL
 * text.
 */

type Row = Record<string, unknown>;

function matchesRls(row: Row, asUser: string): boolean {
  return !("user_id" in row) || row.user_id === asUser;
}

class FakeQueryBuilder {
  private filters: Array<(row: Row) => boolean> = [];
  private orderCol: string | null = null;
  private orderAsc = true;
  private limitN: number | null = null;
  private op: "select" | "insert" | "update" | "upsert" | "delete" = "select";
  private payload: Row[] = [];
  private onConflict: string | null = null;

  constructor(
    private readonly client: FakeSupabaseClient,
    private readonly tableName: string,
  ) {}

  select(): this {
    return this;
  }
  eq(col: string, val: unknown): this {
    this.filters.push((r) => r[col] === val);
    return this;
  }
  in(col: string, vals: unknown[]): this {
    this.filters.push((r) => vals.includes(r[col]));
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }): this {
    this.orderCol = col;
    this.orderAsc = opts?.ascending ?? true;
    return this;
  }
  limit(n: number): this {
    this.limitN = n;
    return this;
  }
  insert(rows: Row | Row[]): this {
    this.op = "insert";
    this.payload = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  update(patch: Row): this {
    this.op = "update";
    this.payload = [patch];
    return this;
  }
  upsert(rows: Row | Row[], opts?: { onConflict?: string }): this {
    this.op = "upsert";
    this.payload = Array.isArray(rows) ? rows : [rows];
    this.onConflict = opts?.onConflict ?? null;
    return this;
  }
  delete(): this {
    this.op = "delete";
    return this;
  }

  private table(): Row[] {
    return this.client.tables[this.tableName] ?? (this.client.tables[this.tableName] = []);
  }

  /** Rows visible under RLS, before this query's explicit filters. */
  private visible(): Row[] {
    return this.table().filter((r) => matchesRls(r, this.client.asUser));
  }

  private run(): { data: Row[]; error: { message: string } | null } {
    const table = this.table();

    if (this.op === "insert") {
      const inserted = this.payload.map((row) => ({
        id: row.id ?? `id-${Math.random().toString(36).slice(2)}`,
        ...row,
      }));
      // Row Level Security's WITH CHECK clause: an insert whose user_id
      // doesn't match the session is rejected, so a client can never
      // spoof another user's rows.
      for (const row of inserted) {
        if ("user_id" in row && row.user_id !== this.client.asUser) {
          return { data: [], error: { message: "new row violates row-level security policy" } };
        }
      }
      table.push(...inserted);
      return { data: inserted, error: null };
    }

    // select/update/upsert/delete all start from what's RLS-visible, then
    // apply this query's own .eq()/.in() filters on top.
    const visibleMatches = this.visible().filter((r) => this.filters.every((f) => f(r)));

    if (this.op === "update") {
      for (const row of visibleMatches) Object.assign(row, this.payload[0]);
      return { data: visibleMatches, error: null };
    }

    if (this.op === "upsert") {
      const conflictCols = (this.onConflict ?? "id").split(",");
      const results: Row[] = [];
      for (const incoming of this.payload) {
        const existing = table.find(
          (r) =>
            matchesRls(r, this.client.asUser) && conflictCols.every((c) => r[c] === incoming[c]),
        );
        if (existing) {
          Object.assign(existing, incoming);
          results.push(existing);
        } else {
          const created = { id: `id-${Math.random().toString(36).slice(2)}`, ...incoming };
          table.push(created);
          results.push(created);
        }
      }
      return { data: results, error: null };
    }

    if (this.op === "delete") {
      const remaining = table.filter((r) => !visibleMatches.includes(r));
      this.client.tables[this.tableName] = remaining;
      return { data: visibleMatches, error: null };
    }

    // select
    let rows = visibleMatches;
    if (this.orderCol) {
      const col = this.orderCol;
      rows = [...rows].sort((a, b) => {
        const av = String(a[col] ?? "");
        const bv = String(b[col] ?? "");
        const cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return this.orderAsc ? cmp : -cmp;
      });
    }
    if (this.limitN != null) rows = rows.slice(0, this.limitN);
    return { data: rows, error: null };
  }

  maybeSingle(): Promise<{ data: Row | null; error: { message: string } | null }> {
    const { data, error } = this.run();
    return Promise.resolve({ data: data[0] ?? null, error });
  }

  single(): Promise<{ data: Row | null; error: { message: string } | null }> {
    return this.maybeSingle();
  }

  // Makes `await builder` (without .maybeSingle()) work, like the real SDK.
  then<TResult1 = { data: Row[]; error: { message: string } | null }, TResult2 = never>(
    onfulfilled?:
      | ((value: {
          data: Row[];
          error: { message: string } | null;
        }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.run()).then(onfulfilled ?? undefined, onrejected ?? undefined);
  }
}

/** Minimal fake matching only the query-builder surface our services use. */
export class FakeSupabaseClient {
  tables: Record<string, Row[]> = {};
  rpcResults: Record<string, Row[]> = {};

  constructor(public asUser: string) {}

  seed(table: string, rows: Row[]): this {
    this.tables[table] = [...rows];
    return this;
  }

  from(table: string): FakeQueryBuilder {
    return new FakeQueryBuilder(this, table);
  }

  rpc(name: string) {
    return Promise.resolve({ data: this.rpcResults[name] ?? [], error: null });
  }

  storage = {
    from: () => ({
      remove: async () => ({ data: null, error: null }),
      download: async () => ({ data: null, error: null }),
      createSignedUrl: async () => ({
        data: { signedUrl: "https://example.test/signed" },
        error: null,
      }),
    }),
  };
}
