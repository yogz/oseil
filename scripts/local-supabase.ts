// Reads the connection details of the local Supabase copy (Docker) from the CLI.
// These are the CLI's fixed demonstration keys, not secrets, but they are never printed.
import { execFileSync } from "node:child_process";

export type LocalSupabaseEnv = {
  url: string;
  publishableKey: string;
  secretKey: string;
  dbUrl: string;
};

export function localSupabaseEnv(): LocalSupabaseEnv {
  let raw: string;
  try {
    raw = execFileSync("supabase", ["status", "-o", "json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    throw new Error("La copie locale de Supabase ne tourne pas : lance npm run db:start");
  }
  const status = JSON.parse(raw.slice(raw.indexOf("{"))) as Record<string, string | undefined>;
  const pick = (...names: string[]): string => {
    for (const name of names) if (status[name]) return status[name] as string;
    throw new Error(`Missing ${names.join(" / ")} in supabase status output`);
  };
  return {
    url: pick("API_URL"),
    publishableKey: pick("PUBLISHABLE_KEY", "ANON_KEY"),
    secretKey: pick("SECRET_KEY", "SERVICE_ROLE_KEY"),
    dbUrl: pick("DB_URL"),
  };
}
