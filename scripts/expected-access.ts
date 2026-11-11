// The single definition of who may do what on the tables and functions, shared by the
// local test (check-rls.ts) and the read-only production check (check-rls-prod.ts).

export const TABLES = ["vaults", "documents", "vault_passkeys", "update_reminders"] as const;
type Table = (typeof TABLES)[number];

// Which commands each table allows; a command not listed has no privilege and no policy.
const COMMANDS: Record<Table, string[]> = {
  vaults: ["select", "insert", "update", "delete"],
  documents: ["select", "insert", "update", "delete"],
  vault_passkeys: ["select", "insert", "delete"],
  // No direct access at all: only the security-definer functions of its migration touch it.
  update_reminders: [],
};

const privilegesOf = (table: Table): string[] => COMMANDS[table].map((c) => c.toUpperCase()).sort();

export const EXPECTED_POLICIES = TABLES.flatMap((table) => COMMANDS[table].map((op) => `${table}_${op}`)).sort();

const tableList = TABLES.map((t) => `'${t}'`).join(", ");

export const GRANTS_QUERY = `select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name in (${tableList})
  and grantee in ('anon', 'authenticated', 'PUBLIC')`;

export const RLS_QUERY = `select c.relname, c.relrowsecurity
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in (${tableList})`;

export const POLICIES_QUERY = `select tablename, policyname, array_to_string(roles, ',') as roles,
  cmd, permissive, qual, with_check
from pg_policies
where schemaname = 'public' and tablename in (${tableList})`;

export type GrantRow = { table_name: string; grantee: string; privilege_type: string };
export type PolicyRow = {
  tablename: string;
  policyname: string;
  roles: string;
  cmd: string;
  permissive: string;
  qual: string | null;
  with_check: string | null;
};
export type RlsRow = { relname: string; relrowsecurity: boolean };

// How Postgres prints the one condition every policy uses (read from the local copy).
const OWN_ROWS = "(user_id = ( SELECT auth.uid() AS uid))";
const EXPECTED_COMMANDS = ["select", "insert", "update", "delete"] as const;
// Which of `qual` (rows already there) and `with_check` (rows written) each command carries.
const EXPECTED_CONDITIONS: Record<string, { qual: string | null; withCheck: string | null }> = {
  select: { qual: OWN_ROWS, withCheck: null },
  insert: { qual: null, withCheck: OWN_ROWS },
  update: { qual: OWN_ROWS, withCheck: OWN_ROWS },
  delete: { qual: OWN_ROWS, withCheck: null },
};

const squash = (text: string | null): string | null => (text === null ? null : text.replace(/\s+/g, " ").trim());

// Returns the list of differences from the expectation; empty means it matches.
export function grantsProblems(rows: GrantRow[]): string[] {
  const problems: string[] = [];
  for (const table of TABLES) {
    const mine = rows.filter((r) => r.table_name === table);
    // A table with no command must have no grant at all; its existence is checked by
    // rlsProblems (RLS_QUERY), since an empty grant list cannot tell it apart from a missing table.
    if (mine.length === 0) {
      if (COMMANDS[table].length > 0) problems.push(`${table} has no grants: table missing, migration not applied?`);
      continue;
    }
    const everyone = mine.filter((r) => r.grantee === "PUBLIC").map((r) => r.privilege_type);
    if (everyone.length > 0) problems.push(`PUBLIC holds ${everyone.sort().join(", ")} on ${table}`);
    const anon = mine.filter((r) => r.grantee === "anon").map((r) => r.privilege_type);
    if (anon.length > 0) problems.push(`anon holds ${anon.sort().join(", ")} on ${table}`);
    const held = mine
      .filter((r) => r.grantee === "authenticated")
      .map((r) => r.privilege_type)
      .sort();
    if (held.join(", ") !== privilegesOf(table).join(", ")) {
      problems.push(`authenticated holds ${held.join(", ") || "nothing"} on ${table}`);
    }
  }
  return problems;
}

// Row-level security must be switched on for every table, or the policies do nothing.
export function rlsProblems(rows: RlsRow[]): string[] {
  return TABLES.flatMap((table) => {
    const row = rows.find((r) => r.relname === table);
    if (!row) return [`${table} not found: table missing, migration not applied?`];
    return row.relrowsecurity ? [] : [`row-level security is off on ${table}`];
  });
}

export function policiesProblems(rows: PolicyRow[]): string[] {
  const problems: string[] = [];
  const names = rows.map((r) => r.policyname).sort();
  if (names.join(", ") !== EXPECTED_POLICIES.join(", ")) {
    problems.push(`policies are ${names.join(", ") || "none"}`);
  }
  for (const r of rows) {
    if (r.roles !== "authenticated") problems.push(`${r.policyname} applies to ${r.roles}`);
    if (r.permissive !== "PERMISSIVE") problems.push(`${r.policyname} is ${r.permissive}`);
    for (const op of EXPECTED_COMMANDS) {
      if (r.policyname !== `${r.tablename}_${op}`) continue;
      const want = EXPECTED_CONDITIONS[op];
      if (r.cmd.toLowerCase() !== op) problems.push(`${r.policyname} applies to ${r.cmd}`);
      if (squash(r.qual) !== want.qual) problems.push(`${r.policyname} reads rows with ${r.qual ?? "no condition"}`);
      if (squash(r.with_check) !== want.withCheck) {
        problems.push(`${r.policyname} checks written rows with ${r.with_check ?? "no condition"}`);
      }
    }
  }
  return problems;
}

// Who may execute each function of the public schema we wrote, among anon, authenticated and
// PUBLIC (everyone). Supabase grants execute to anon and authenticated on every new function by
// default, so each migration revokes it, then grants only what is listed here.
const FUNCTIONS: Record<string, string[]> = {
  keep_alive: ["anon"],
  my_reminder_email: ["authenticated"],
  set_my_reminder_email: ["authenticated"],
  stop_reminder: ["anon", "authenticated"],
  // The e-mail reminder runs inside the database (pg_cron): nobody outside calls these.
  due_reminders: [],
  mark_reminder_sent: [],
  reminder_email_html: [],
  reminder_email: [],
  send_reminder: [],
  send_due_reminders: [],
};

const WATCHED_ROLES = ["anon", "authenticated", "PUBLIC"];

const functionList = Object.keys(FUNCTIONS)
  .map((f) => `'${f}'`)
  .join(", ");

// One row per function: who holds EXECUTE on it. A null proacl means the default rights
// (execute for PUBLIC), which acldefault spells out; grantee 0 is PUBLIC.
export const FUNCTIONS_QUERY = `select p.proname as routine_name,
  coalesce((select string_agg(g, ',' order by g) from (
    select distinct case a.grantee when 0 then 'PUBLIC' else a.grantee::regrole::text end as g
    from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where a.privilege_type = 'EXECUTE') s), '') as grantees
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in (${functionList})`;

export type FunctionRow = { routine_name: string; grantees: string };

export function functionsProblems(rows: FunctionRow[]): string[] {
  const problems: string[] = [];
  for (const [name, expected] of Object.entries(FUNCTIONS)) {
    const mine = rows.filter((r) => r.routine_name === name);
    if (mine.length === 0) problems.push(`${name} not found: function missing, migration not applied?`);
    if (mine.length > 1) problems.push(`${name} exists ${mine.length} times`);
    for (const r of mine) {
      const held = r.grantees
        .split(",")
        .filter((g) => WATCHED_ROLES.includes(g))
        .sort();
      if (held.join(", ") !== [...expected].sort().join(", ")) {
        problems.push(`${name} is executable by ${held.join(", ") || "nobody"}`);
      }
    }
  }
  return problems;
}
