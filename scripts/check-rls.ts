// Proves, against the LOCAL Supabase copy (npm run db:start), that one user can
// neither read nor write another user's rows, that the grants, policies and function rights are
// exactly the expected ones, and that the e-mail reminder picks the right accounts.
// Creates two throwaway users and always deletes them. No check sends a real e-mail.
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  FUNCTIONS_QUERY,
  GRANTS_QUERY,
  POLICIES_QUERY,
  grantsProblems,
  RLS_QUERY,
  functionsProblems,
  policiesProblems,
  rlsProblems,
  type FunctionRow,
  type GrantRow,
  type PolicyRow,
  type RlsRow,
} from "./expected-access";
import { localSupabaseEnv } from "./local-supabase";

const TOTAL_CHECKS = 34;

const { url, publishableKey, dbUrl } = localSupabaseEnv();

// Runs a SELECT through psql on the local database and returns its rows.
function psqlRows<T>(query: string): T[] {
  const json = execFileSync(
    "psql",
    [dbUrl, "-At", "-c", `select coalesce(json_agg(t), '[]') from (${query}) t`],
    { encoding: "utf8" },
  );
  return JSON.parse(json) as T[];
}

// Runs SQL statements through psql (one implicit transaction) and returns what they print.
function psqlRun(sql: string): string {
  return execFileSync("psql", [dbUrl, "-At", "-q", "-v", "ON_ERROR_STOP=1", "-c", sql], {
    encoding: "utf8",
  }).trim();
}

// Each client holds its own in-memory session, so none leaks into another.
function newClient(key: string): SupabaseClient {
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const packet = { iv: "AAAAAAAAAAAAAAAA", ciphertext: "AAAA" };
const failures: string[] = [];
let passed = 0;

function check(name: string, ok: boolean, detail = ""): void {
  if (ok) passed += 1;
  else failures.push(detail ? `${name} (${detail})` : name);
}

async function signedIn(email: string, password: string): Promise<SupabaseClient> {
  const client = newClient(publishableKey);
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Sign-in failed: ${error.message}`);
  return client;
}

async function main(): Promise<void> {
  const stamp = Date.now();
  const users = [
    { email: `rls-a-${stamp}@example.com`, password: randomBytes(18).toString("base64url"), id: "" },
    { email: `rls-b-${stamp}@example.com`, password: randomBytes(18).toString("base64url"), id: "" },
  ];
  const [a, b] = users;

  try {
    for (const u of users) {
      // Local confirmations are off, so a plain sign-up yields a usable account. The auth
      // admin API is not used: the local auth server rejects the CLI's service key.
      const { data, error } = await newClient(publishableKey).auth.signUp({
        email: u.email,
        password: u.password,
      });
      if (error || !data.user) throw new Error(`signUp failed: ${error?.message}`);
      u.id = data.user.id;
    }

    const clientA = await signedIn(a.email, a.password);
    const clientB = await signedIn(b.email, b.password);

    // 1. A writes a vault and a document.
    const vaultWrite = await clientA.from("vaults").insert({
      kdf: { v: 1 },
      wrapped_by_password: packet,
      wrapped_by_recovery: packet,
    });
    const docWrite = await clientA
      .from("documents")
      .insert({ kind: "profile", ...packet })
      .select("id")
      .single();
    check(
      "1. A writes a vault and a document",
      !vaultWrite.error && !docWrite.error,
      vaultWrite.error?.message ?? docWrite.error?.message,
    );
    const docId = docWrite.data?.id as string | undefined;
    if (!docId) throw new Error("Cannot continue: A's document was not created");

    // 1 bis. Positive control: A reads back its own vault and document.
    const ownVaults = await clientA.from("vaults").select("user_id");
    const ownDocs = await clientA.from("documents").select("ciphertext");
    check(
      "1 bis. A reads back its own vault and document",
      !ownVaults.error &&
        !ownDocs.error &&
        ownVaults.data?.length === 1 &&
        ownDocs.data?.length === 1 &&
        ownDocs.data[0].ciphertext === packet.ciphertext,
      ownVaults.error?.message ?? ownDocs.error?.message,
    );

    // 2. B reads none of A's rows.
    const readDocs = await clientB.from("documents").select("id").eq("id", docId);
    const readVaults = await clientB.from("vaults").select("user_id").eq("user_id", a.id);
    check(
      "2. B reads none of A's rows",
      !readDocs.error &&
        !readVaults.error &&
        readDocs.data?.length === 0 &&
        readVaults.data?.length === 0,
      readDocs.error?.message ?? readVaults.error?.message,
    );

    // 3. B modifies none of A's rows (zero rows touched, A's data intact).
    const upd = await clientB.from("documents").update({ ciphertext: "BBBB" }).eq("id", docId).select("id");
    const del = await clientB.from("documents").delete().eq("id", docId).select("id");
    const updVault = await clientB
      .from("vaults")
      .update({ kdf: { v: 2 } })
      .eq("user_id", a.id)
      .select("user_id");
    const intact = await clientA.from("documents").select("ciphertext").eq("id", docId).single();
    check(
      "3. B modifies none of A's rows",
      !upd.error &&
        !del.error &&
        !updVault.error &&
        upd.data?.length === 0 &&
        del.data?.length === 0 &&
        updVault.data?.length === 0 &&
        intact.data?.ciphertext === packet.ciphertext,
      upd.error?.message ?? del.error?.message ?? updVault.error?.message,
    );

    // 4. B cannot write a document in A's name (RLS refusal, 42501).
    const forged = await clientB.from("documents").insert({ user_id: a.id, kind: "profile", ...packet });
    check("4. B cannot write in A's name", forged.error?.code === "42501", `code ${forged.error?.code ?? "none"}`);

    // 5. An anonymous visitor is refused outright (42501), not just shown nothing.
    const anon = newClient(publishableKey);
    const anonDocs = await anon.from("documents").select("id");
    const anonVaults = await anon.from("vaults").select("user_id");
    check(
      "5. anonymous is refused",
      anonDocs.error?.code === "42501" && anonVaults.error?.code === "42501",
      `codes ${anonDocs.error?.code ?? "none"} / ${anonVaults.error?.code ?? "none"}`,
    );

    // 6. Grants: only authenticated, with the privileges listed per table.
    const grantIssues = grantsProblems(psqlRows<GrantRow>(GRANTS_QUERY));
    check("6. grants are exactly the expected ones", grantIssues.length === 0, grantIssues.join("; "));

    // 7. Policies: exactly the expected ones, all for authenticated, with the expected text.
    const policyIssues = policiesProblems(psqlRows<PolicyRow>(POLICIES_QUERY));
    check("7. policies are exactly the expected ones", policyIssues.length === 0, policyIssues.join("; "));

    // 7 bis. Row-level security is switched on for every table (and each one exists).
    const rlsIssues = rlsProblems(psqlRows<RlsRow>(RLS_QUERY));
    check("7 bis. row-level security is on", rlsIssues.length === 0, rlsIssues.join("; "));

    // 8. A second profile document for A is refused by the unique index.
    const second = await clientA.from("documents").insert({ kind: "profile", ...packet });
    check("8. a second profile for A is refused", second.error?.code === "23505", `code ${second.error?.code ?? "none"}`);

    // 9. The filters the recovery-key renewal and confirmation rely on are applied by the
    // real PostgREST (the fake used in unit tests cannot prove it). A's recovery packet
    // has the iv `packet.iv` and is not confirmed yet.
    const touch = (staleIv: string | null, onlyUnconfirmed: boolean, column: Record<string, string>) => {
      let query = clientA.from("vaults").update(column).eq("user_id", a.id);
      if (staleIv !== null) query = query.eq("wrapped_by_recovery->>iv", staleIv);
      if (onlyUnconfirmed) query = query.is("recovery_confirmed_at", null);
      return query.select("user_id");
    };
    const touched = (r: { error: { message: string } | null; data: unknown[] | null }): string =>
      r.error ? `error ${r.error.message}` : String(r.data?.length);
    const now = (): Record<string, string> => ({ updated_at: new Date().toISOString() });

    const stale = await touch("BBBBBBBBBBBBBBBB", true, now());
    check("9. a stale iv touches 0 rows", touched(stale) === "0", touched(stale));
    const current = await touch(packet.iv, true, now());
    check("9 bis. the current iv while unconfirmed touches 1 row", touched(current) === "1", touched(current));
    const confirm = await touch(packet.iv, false, { recovery_confirmed_at: new Date().toISOString() });
    const afterConfirm = await touch(null, true, now());
    check(
      "9 ter. once confirmed, the unconfirmed filter touches 0 rows",
      touched(confirm) === "1" && touched(afterConfirm) === "0",
      `${touched(confirm)} / ${touched(afterConfirm)}`,
    );

    // 10. Face ID keys: A writes a passkey packet and reads it back.
    const passkey = { credential_id: "cred-a", passkey_id: crypto.randomUUID(), wrapped: packet };
    const passkeyWrite = await clientA.from("vault_passkeys").insert(passkey);
    const passkeyRead = await clientA.from("vault_passkeys").select("credential_id, user_id");
    check(
      "10. A writes a passkey and reads it back",
      !passkeyWrite.error &&
        !passkeyRead.error &&
        passkeyRead.data?.length === 1 &&
        passkeyRead.data[0].credential_id === passkey.credential_id &&
        passkeyRead.data[0].user_id === a.id,
      passkeyWrite.error?.message ?? passkeyRead.error?.message,
    );

    // 11. B reads none of A's passkeys and deletes none of them.
    const passkeyPeek = await clientB.from("vault_passkeys").select("credential_id").eq("user_id", a.id);
    const passkeyDel = await clientB
      .from("vault_passkeys")
      .delete()
      .eq("user_id", a.id)
      .select("credential_id");
    const passkeyIntact = await clientA.from("vault_passkeys").select("credential_id");
    check(
      "11. B reads and deletes none of A's passkeys",
      !passkeyPeek.error &&
        !passkeyDel.error &&
        passkeyPeek.data?.length === 0 &&
        passkeyDel.data?.length === 0 &&
        passkeyIntact.data?.length === 1,
      passkeyPeek.error?.message ?? passkeyDel.error?.message ?? `${passkeyIntact.data?.length} left`,
    );

    // 12. B cannot write a passkey in A's name (RLS refusal, 42501).
    const passkeyForged = await clientB
      .from("vault_passkeys")
      .insert({ ...passkey, credential_id: "cred-forged", passkey_id: crypto.randomUUID(), user_id: a.id });
    check(
      "12. B cannot write a passkey in A's name",
      passkeyForged.error?.code === "42501",
      `code ${passkeyForged.error?.code ?? "none"}`,
    );

    // 13. Nobody updates a passkey: the privilege does not exist (42501), even for its owner.
    const passkeyUpd = await clientA
      .from("vault_passkeys")
      .update({ wrapped: { iv: "BBBBBBBBBBBBBBBB", ciphertext: "BBBB" } })
      .eq("credential_id", passkey.credential_id)
      .select("credential_id");
    const passkeyUpdB = await clientB
      .from("vault_passkeys")
      .update({ wrapped: packet })
      .eq("user_id", a.id)
      .select("credential_id");
    check(
      "13. an update is refused for everyone",
      passkeyUpd.error?.code === "42501" && passkeyUpdB.error?.code === "42501",
      `codes ${passkeyUpd.error?.code ?? "none"} / ${passkeyUpdB.error?.code ?? "none"}`,
    );

    // 14. An anonymous visitor is refused outright on the passkeys too.
    const anonPasskeys = await anon.from("vault_passkeys").select("credential_id");
    check(
      "14. anonymous is refused on passkeys",
      anonPasskeys.error?.code === "42501",
      `code ${anonPasskeys.error?.code ?? "none"}`,
    );

    // 15. Nobody reads the reminders table directly: no privilege at all (42501).
    const anonReminders = await anon.from("update_reminders").select();
    const ownReminders = await clientA.from("update_reminders").select();
    check(
      "15. reminders: anon and authenticated cannot read the table",
      anonReminders.error?.code === "42501" && ownReminders.error?.code === "42501",
      `codes ${anonReminders.error?.code ?? "none"} / ${ownReminders.error?.code ?? "none"}`,
    );

    // 16. A switches its e-mail off; B, who has no row yet, is still on.
    const switchOff = await clientA.rpc("set_my_reminder_email", { enabled: false });
    const emailA = await clientA.rpc("my_reminder_email");
    const emailB = await clientB.rpc("my_reminder_email");
    check(
      "16. reminders: A switches off, B still on",
      !switchOff.error && emailA.data === false && emailB.data === true,
      switchOff.error?.message ?? emailA.error?.message ?? emailB.error?.message ?? `A ${emailA.data} / B ${emailB.data}`,
    );

    // Reads the two test users' reminder rows, in a fixed order.
    const reminderRows = () =>
      psqlRows<{ user_id: string; email_off: boolean; unsubscribe_token: string }>(
        `select user_id, email_off, unsubscribe_token from public.update_reminders
         where user_id in ('${a.id}', '${b.id}') order by user_id`,
      );

    // 17. An unknown token answers like any other and changes nothing.
    const onAgainB = await clientB.rpc("set_my_reminder_email", { enabled: true });
    const before = JSON.stringify(reminderRows());
    const unknown = await anon.rpc("stop_reminder", { token: crypto.randomUUID() });
    const after = JSON.stringify(reminderRows());
    check(
      "17. reminders: stop_reminder with an unknown token returns no error and changes nothing",
      !onAgainB.error && !unknown.error && unknown.data === null && before === after && before.length > 2,
      onAgainB.error?.message ?? unknown.error?.message ?? `${before} -> ${after}`,
    );

    // 18. A's own token (read by psql, as the e-mail would carry it) switches A off, and only A.
    const onAgainA = await clientA.rpc("set_my_reminder_email", { enabled: true });
    const tokenA = reminderRows().find((r) => r.user_id === a.id)?.unsubscribe_token;
    const stop = await anon.rpc("stop_reminder", { token: tokenA });
    const stoppedA = await clientA.rpc("my_reminder_email");
    const stillB = await clientB.rpc("my_reminder_email");
    check(
      "18. reminders: stop_reminder with A's token switches A off",
      !onAgainA.error && !!tokenA && !stop.error && stop.data === null && stoppedA.data === false && stillB.data === true,
      onAgainA.error?.message ?? stop.error?.message ?? `A ${stoppedA.data} / B ${stillB.data}`,
    );

    // 19. An anonymous visitor cannot read or change a reminder setting.
    const anonRead = await anon.rpc("my_reminder_email");
    const anonSet = await anon.rpc("set_my_reminder_email", { enabled: false });
    check(
      "19. reminders: anon cannot call my_reminder_email / set_my_reminder_email",
      !!anonRead.error && !!anonSet.error,
      `errors ${anonRead.error?.code ?? "none"} / ${anonSet.error?.code ?? "none"}`,
    );

    // The e-mail reminder (spec « Par e-mail (6 mois) »). psql plays the database's own job:
    // it backdates the documents and reads due_reminders(), which nobody outside may call.
    const ids = `'${a.id}', '${b.id}'`;
    const due = (): string[] =>
      psqlRows<{ user_id: string }>(`select user_id from public.due_reminders() where user_id in (${ids})`)
        .map((r) => r.user_id)
        .sort();
    const lastSent = (id: string): string | null =>
      psqlRows<{ last_sent_at: string | null }>(
        `select last_sent_at from public.update_reminders where user_id = '${id}'`,
      )[0]?.last_sent_at ?? null;
    const backdate = (id: string, age: string): void => {
      psqlRun(`update public.documents set created_at = now() - interval '${age}' where id = '${id}'`);
    };

    // 20. An account with no snapshot gets nothing, however old its other documents.
    const backOn = await clientA.rpc("set_my_reminder_email", { enabled: true });
    backdate(docId, "8 months");
    const noSnapshot = due();
    check(
      "20. due: no snapshot → not listed",
      !backOn.error && noSnapshot.length === 0,
      backOn.error?.message ?? noSnapshot.join(", "),
    );

    // A's only update is 7 months old; B has an old one and a recent one (the latest counts).
    const snapshot = { kind: "snapshot", ...packet };
    const snapA = await clientA.from("documents").insert(snapshot).select("id").single();
    const snapsB = await clientB.from("documents").insert([snapshot, snapshot]).select("id");
    if (snapA.error || snapsB.error || snapsB.data?.length !== 2) {
      throw new Error("Cannot continue: snapshots not created");
    }
    backdate(snapA.data.id as string, "7 months");
    backdate(snapsB.data[0].id as string, "9 months");
    backdate(snapsB.data[1].id as string, "2 months");

    // 21. A is listed, B (last update 2 months ago) is not.
    const firstDue = due();
    check(
      "21. due: A's last snapshot 7 months old → listed; B's 2 months → not",
      firstDue.join() === a.id,
      firstDue.join(", "),
    );

    // 22. A switched off is not listed.
    await clientA.rpc("set_my_reminder_email", { enabled: false });
    const offDue = due();
    await clientA.rpc("set_my_reminder_email", { enabled: true });
    check("22. due: A switched off → not listed", offDue.length === 0 && due().join() === a.id, offDue.join(", "));

    // 23. An unconfirmed address is not listed.
    psqlRun(`update auth.users set email_confirmed_at = null where id = '${a.id}'`);
    const unconfirmedDue = due();
    psqlRun(`update auth.users set email_confirmed_at = now() where id = '${a.id}'`);
    check("23. due: unconfirmed address → not listed", unconfirmedDue.length === 0, unconfirmedDue.join(", "));

    // 24. One e-mail per 6 months of absence: sent 1 month ago → not listed; 7 months ago → listed.
    const sentAgo = (age: string): string[] => {
      psqlRun(
        `update public.update_reminders set last_sent_at = now() - interval '${age}' where user_id = '${a.id}'`,
      );
      return due();
    };
    const recent = sentAgo("1 month");
    const old = sentAgo("7 months");
    psqlRun(`update public.update_reminders set last_sent_at = null where user_id in (${ids})`);
    check(
      "24. due: last_sent_at 1 month ago → not listed; 7 months ago → listed",
      recent.length === 0 && old.join() === a.id,
      `${recent.join(", ")} / ${old.join(", ")}`,
    );

    // 25. Without the Resend key in Vault, nothing is sent and nothing is marked.
    const keyless = psqlRows<{ secrets: number; batch: number; single: boolean }>(
      `select (select count(*) from vault.decrypted_secrets where name = 'resend_reminder_key')::int as secrets,
              public.send_due_reminders() as batch, public.send_reminder('${a.id}') as single`,
    )[0];
    check(
      "25. send without a key: returns 0 / false, A's last_sent_at stays null",
      keyless?.secrets === 0 && keyless.batch === 0 && keyless.single === false && lastSent(a.id) === null,
      JSON.stringify(keyless),
    );

    // 26. With a dummy key, inside a transaction rolled back before it commits: pg_net only sends
    // committed requests, so nothing ever leaves. Reads what would have been sent.
    const tokenOfA = reminderRows().find((r) => r.user_id === a.id)?.unsubscribe_token;
    const queued = JSON.parse(
      psqlRun(`begin;
        do $$ begin perform vault.create_secret('dummy-not-a-key', 'resend_reminder_key'); end $$;
        create temp table batch_sent as select public.send_due_reminders() as n;
        create temp table single_sent as select public.send_reminder('${b.id}') as ok;
        select json_build_object(
          'n', (select n from batch_sent),
          'ok', (select ok from single_sent),
          'marked', (select coalesce(json_agg(user_id order by user_id), '[]') from public.update_reminders
                     where user_id in (${ids}) and last_sent_at = now()),
          'requests', (select coalesce(json_agg(json_build_object('url', url, 'method', method,
                         'auth', headers->>'Authorization' like 'Bearer %',
                         'body', convert_from(body, 'utf8')::json)), '[]')
                       from net.http_request_queue where url like 'https://api.resend.com/%'));
        rollback;`),
    ) as {
      n: number;
      ok: boolean;
      marked: string[];
      requests: { url: string; method: string; auth: boolean; body: unknown }[];
    };
    type Email = { from: string; to: string[]; subject: string; html: string };
    const batch = queued.requests.find((r) => r.url === "https://api.resend.com/emails/batch");
    const single = queued.requests.find((r) => r.url === "https://api.resend.com/emails");
    const batchEmails = (batch?.body ?? []) as Email[];
    const toA = batchEmails.find((e) => e.to.includes(a.email));
    const toB = single?.body as Email | undefined;
    const leftover = psqlRows<{ n: number }>(
      `select count(*)::int as n from net.http_request_queue where url like 'https://api.resend.com/%'`,
    )[0]?.n;
    check(
      "26. send with a key: A marked and in one batch, B alone by send_reminder, nothing left after rollback",
      queued.requests.length === 2 &&
        queued.n >= 1 &&
        queued.ok === true &&
        JSON.stringify(queued.marked) === JSON.stringify([a.id, b.id].sort()) &&
        batch?.method === "POST" &&
        batch.auth &&
        !batchEmails.some((e) => e.to.includes(b.email)) &&
        toA?.from === "Oseil <noreply@milou.studio>" &&
        toA.subject === "Tes chiffres ont plus de six mois" &&
        !!tokenOfA &&
        toA.html.includes(`https://oseil.fr/rappel/arreter?jeton=${tokenOfA}`) &&
        toB?.to.join() === b.email &&
        single?.auth === true &&
        leftover === 0 &&
        lastSent(a.id) === null,
      JSON.stringify({
        n: queued.n,
        ok: queued.ok,
        marked: queued.marked,
        urls: queued.requests.map((r) => r.url),
        leftover,
      }),
    );

    // 27. Nobody outside the database calls the sending functions, signed in or not.
    const calls: [string, Record<string, unknown>][] = [
      ["due_reminders", {}],
      ["send_due_reminders", {}],
      ["send_reminder", { target: b.id }],
      ["mark_reminder_sent", { target: b.id }],
      ["reminder_email_html", { unsubscribe_url: "https://example.com" }],
      ["reminder_email", { address: b.email, token: crypto.randomUUID() }],
    ];
    const allowed: string[] = [];
    for (const [fn, args] of calls) {
      for (const [who, client] of [
        ["anon", anon],
        ["authenticated", clientB],
      ] as const) {
        const res = await client.rpc(fn, args);
        if (!res.error) allowed.push(`${who} ${fn}`);
      }
    }
    check(
      "27. anon and authenticated cannot execute the sending functions",
      allowed.length === 0 && lastSent(b.id) === null,
      allowed.join(", ") || `B marked at ${lastSent(b.id)}`,
    );

    // 28. Function rights: exactly the expected ones, for every function we wrote.
    const functionIssues = functionsProblems(psqlRows<FunctionRow>(FUNCTIONS_QUERY));
    check("28. function rights are exactly the expected ones", functionIssues.length === 0, functionIssues.join("; "));

    // 29. Marking alone takes A off the list (the date is written before the request).
    const marked = psqlRows<{ token: string }>(`select public.mark_reminder_sent('${a.id}') as token`)[0]?.token;
    const afterMark = due();
    check(
      "29. after mark_reminder_sent(A), due_reminders() no longer lists A",
      !!marked && marked === tokenOfA && afterMark.length === 0 && lastSent(a.id) !== null,
      `${marked} / ${afterMark.join(", ")}`,
    );

    // 30. The e-mail's HTML: the unsubscribe link filled in, the button to the site, no placeholder left.
    const html =
      psqlRows<{ html: string }>(
        `select public.reminder_email_html('https://oseil.fr/rappel/arreter?jeton=abc') as html`,
      )[0]?.html ?? "";
    check(
      "30. reminder_email_html fills the unsubscribe link",
      html.includes('href="https://oseil.fr/rappel/arreter?jeton=abc"') &&
        html.includes('href="https://oseil.fr"') &&
        html.includes("Mettre à jour") &&
        html.includes("Ne plus recevoir ce rappel") &&
        !html.includes("{{"),
      `${html.length} characters`,
    );
  } finally {
    // Always runs, even when a check threw. Deleting the user cascades to its rows.
    for (const u of users) {
      if (!u.id) continue;
      try {
        execFileSync("psql", [dbUrl, "-c", `delete from auth.users where id = '${u.id}'`], {
          stdio: "ignore",
        });
      } catch {
        failures.push("cleanup of a test user failed");
      }
    }
  }
}

main()
  .catch((e: unknown) => {
    failures.push(`error: ${e instanceof Error ? e.message : String(e)}`);
  })
  .finally(() => {
    if (failures.length === 0 && passed === TOTAL_CHECKS) {
      console.log(`✓ RLS : ${passed} vérifications sur ${TOTAL_CHECKS}`);
      process.exit(0);
    }
    console.error(`✗ RLS : ${passed} vérifications sur ${TOTAL_CHECKS}, échecs :`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  });
