// Installs (or replaces) the Resend key the update reminder sends with, in the Vault of the real
// Supabase project, under the name `resend_reminder_key` (spec of the reminder, « L’e-mail »).
// Nicolas runs it himself; the key comes from Proton Pass through the environment and is never
// printed, logged, nor written to a file:
//   RESEND_KEY="$(pass-cli item view '<pass:// path of the key>')" mise exec -- npx tsx scripts/install-reminder-key.ts
// Changing the key later (a key dedicated to the reminder) is the same command with the other path.

const SECRET_NAME = 'resend_reminder_key'

function need(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing environment variable ${name}`)
  return value
}

async function main(): Promise<void> {
  const token = need('SUPABASE_ACCESS_TOKEN')
  const ref = need('SUPABASE_PROJECT_REF')
  const key = need('RESEND_KEY')
  // A Resend key is `re_` then letters, digits and `_`: checking it keeps it safe inside the SQL
  // literal below, and catches a wrong Proton Pass path before anything is written.
  if (!/^re_[A-Za-z0-9_]+$/.test(key)) throw new Error('RESEND_KEY does not look like a Resend key; nothing written')

  const query = `do $$
begin
  if exists (select 1 from vault.secrets where name = '${SECRET_NAME}') then
    perform vault.update_secret((select id from vault.secrets where name = '${SECRET_NAME}'), '${key}');
  else
    perform vault.create_secret('${key}', '${SECRET_NAME}');
  end if;
end $$;`

  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  // Only the status: the answer could echo the query, and so the key.
  if (!response.ok) throw new Error(`Management API answered ${response.status}; key not installed`)
  console.log(`Clé installée dans Vault sous le nom ${SECRET_NAME}.`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Installation failed')
  process.exit(1)
})
