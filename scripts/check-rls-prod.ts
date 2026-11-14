// Reads the real Supabase project (through the Management API, SELECT only) and
// compares its grants, whether RLS is on, the exact policies and who may execute each function
// to the expected list. Writes nothing.
import {
  FUNCTIONS_QUERY,
  GRANTS_QUERY,
  POLICIES_QUERY,
  RLS_QUERY,
  grantsProblems,
  policiesProblems,
  functionsProblems,
  rlsProblems,
} from "./expected-access";
import type { FunctionRow, GrantRow, PolicyRow, RlsRow } from "./expected-access";

function need(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

const token = need("SUPABASE_ACCESS_TOKEN");
const ref = need("SUPABASE_PROJECT_REF");
// `npm run check:rls:dev` points the same check at the dev base.
const base = ref === process.env.DEV_SUPABASE_PROJECT_REF ? "Base de dev" : "Base réelle";

async function select<T>(query: string): Promise<T[]> {
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!response.ok) throw new Error(`Management API answered ${response.status}`);
  return (await response.json()) as T[];
}

async function main(): Promise<void> {
  const problems = [
    ...grantsProblems(await select<GrantRow>(GRANTS_QUERY)).map((p) => `droits : ${p}`),
    ...rlsProblems(await select<RlsRow>(RLS_QUERY)).map((p) => `RLS : ${p}`),
    ...policiesProblems(await select<PolicyRow>(POLICIES_QUERY)).map((p) => `règles : ${p}`),
    ...functionsProblems(await select<FunctionRow>(FUNCTIONS_QUERY)).map((p) => `fonctions : ${p}`),
  ];
  if (problems.length === 0) {
    console.log(`✓ ${base} : droits, règles et fonctions conformes à la liste attendue`);
    return;
  }
  console.error(`✗ ${base} : écarts avec la liste attendue :`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

main().catch((e: unknown) => {
  console.error(`error: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
