# The French auth e-mails Supabase sends (via Resend). Writes templates.json (the Management API
# auth config keys) and one preview .html per e-mail into the folder given, default ./out.
#   python3 -I scripts/emails/gen_emails.py [out-folder]
# Installing them is a production change (Nicolas's approval): PATCH the JSON to
# https://api.supabase.com/v1/projects/<ref>/config/auth. Supabase takes ~10 minutes to use them.
#
# Also the update reminder (spec 2026-11-11-rappel-mise-a-jour-design.md), sent by the database
# itself, not by Supabase Auth: its preview is reminder.html, and
#   python3 -I scripts/emails/gen_emails.py --reminder-sql
# prints the SQL function reminder_email_html, to paste in a new migration after any change.
import json, os, re, sys
REMINDER_SQL = "--reminder-sql" in sys.argv[1:]
_ARGS = [a for a in sys.argv[1:] if a != "--reminder-sql"]
OUT = _ARGS[0] if _ARGS else os.path.join(os.path.dirname(__file__), "out")

# The colours come from the site's own tokens (app/globals.css), so the e-mails follow a change of
# palette: regenerate and reinstall after one. An e-mail is read on white: they are those of the light
# theme (the `:root[data-theme="light"]` block, chosen by Nicolas on 10 November 2026), its
# categories, its ink, its discreet text and its ground. The fonts stay the device's: most mail
# clients drop web fonts.
_CSS = open(os.path.join(os.path.dirname(__file__), "..", "..", "app", "globals.css"), encoding="utf-8").read()
_LIGHT = re.search(r'\n:root\[data-theme="light"\] \{([^}]*)\}', _CSS)
if not _LIGHT: raise SystemExit('the light theme block (:root[data-theme="light"]) is not in app/globals.css')
def _token(name):
    found = re.search(r"--" + name + r":\s*(#[0-9A-Fa-f]{6})\s*;", _LIGHT.group(1))
    if not found: raise SystemExit(f"token --{name} not found in the light theme of app/globals.css")
    return found.group(1)
AV, SE, MA, GO, PR = (_token(f"cat-{c}") for c in ("available", "secured", "markets", "gold", "property"))
os.makedirs(OUT, exist_ok=True)
N = " "
FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
INK = _token("ink"); SOFT = _token("ink-muted"); BG = _token("ground"); CARD = "#ffffff"; RULE = "#e5e7eb"
ON_INK = BG  # the text of the full pill: the ground, as on the site


def p(text, color=INK, size=15):
    return f'<p style="margin:0 0 16px 0;font-family:{FONT};font-size:{size}px;line-height:1.55;color:{color};">{text}</p>\n'


AUTH_URL = "{{ .ConfirmationURL }}"


def button(label, href=AUTH_URL):
    return (f'<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 20px 0;"><tr>'
            f'<td style="background-color:{INK};border-radius:999px;">'
            f'<a href="{href}" style="display:inline-block;padding:13px 26px;font-family:{FONT};font-size:15px;font-weight:600;line-height:1;color:{ON_INK};text-decoration:none;border-radius:999px;">{label}</a>'
            f'</td></tr></table>\n'
            + p(f"Si le bouton ne marche pas, copie ce lien dans ton navigateur{N}:", SOFT, 13)
            + f'<p style="margin:0 0 20px 0;font-family:{FONT};font-size:13px;line-height:1.5;color:{INK};word-break:break-all;"><a href="{href}" style="color:{INK};text-decoration:underline;">{href}</a></p>\n')


def code():
    return f'<p style="margin:8px 0 20px 0;font-family:{FONT};font-size:28px;font-weight:600;letter-spacing:4px;line-height:1.2;color:{INK};">{{{{ .Token }}}}</p>\n'


def page(title, parts, ignore):
    body = "".join(parts)
    return f'''<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>{title}</title>
</head>
<body style="margin:0;padding:0;background-color:{BG};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:{BG};">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;background-color:{CARD};border:1px solid {RULE};border-radius:10px;overflow:hidden;">
<tr><td style="padding:0;font-size:0;line-height:0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td width="20%" height="6" style="background-color:{AV};"></td><td width="20%" height="6" style="background-color:{SE};"></td><td width="25%" height="6" style="background-color:{MA};"></td><td width="5%" height="6" style="background-color:{GO};"></td><td width="30%" height="6" style="background-color:{PR};"></td></tr></table></td></tr>
<tr><td style="padding:24px 28px 8px 28px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0;"><tr>
<td style="padding:0 10px 0 0;"><table role="presentation" cellpadding="0" cellspacing="2" border="0"><tr><td width="9" height="9" style="background-color:{AV};border-radius:2px;"></td><td width="9" height="9" style="background-color:{MA};border-radius:2px;"></td></tr><tr><td width="9" height="9" style="background-color:{GO};border-radius:2px;"></td><td width="7" height="7" style="border:1px solid {INK};border-radius:2px;"></td></tr></table></td>
<td style="font-family:{FONT};font-size:17px;font-weight:700;line-height:1;color:{INK};">Oseil</td>
</tr></table>
{body}<p style="margin:0 0 20px 0;padding-top:16px;border-top:1px solid {RULE};font-family:{FONT};font-size:13px;line-height:1.5;color:{SOFT};">{ignore}</p>
</td></tr>
</table>
<p style="margin:16px 0 0 0;font-family:{FONT};font-size:12px;line-height:1.5;color:{SOFT};">Oseil</p>
</td></tr>
</table>
</body>
</html>'''


IGN = f"Si tu n’as rien demandé, ignore cet e-mail{N}: rien ne changera."
T = {}


def add(key, subject, parts, ignore=IGN):
    T[f"mailer_subjects_{key}"] = subject
    T[f"mailer_templates_{key}_content"] = page(subject, parts, ignore)


add("confirmation", "Confirme ton adresse",
    [p("Bonjour,"),
     p(f"Il reste une étape pour ouvrir ton compte Oseil{N}: confirmer ton adresse. Le lien t’amène ensuite à la page de connexion."),
     # Announced before the screen that shows it (audit of the account screens, Nicolas, 10 November 2026).
     p(f"À ta première connexion, on te remettra une clé de secours{N}: prévois de quoi la noter."),
     button("Confirmer mon adresse")],
    f"Si tu n’as pas créé de compte sur Oseil, ignore cet e-mail{N}: aucun compte ne sera ouvert.")

add("recovery", "Choisis un nouveau mot de passe",
    [p("Bonjour,"),
     p("Tu as demandé à changer ton mot de passe Oseil. Ce lien t’amène au choix d’un nouveau mot de passe."),
     button("Choisir un nouveau mot de passe"),
     p(f"<strong>À savoir avant de commencer.</strong> Tes chiffres sont chiffrés dans ton navigateur{N}: personne d’autre que toi ne peut les lire, pas même Oseil. Pour les retrouver après avoir changé ton mot de passe, il te faudra ta clé de secours."),
     p("Sans elle, tu pourras repartir de zéro, avec un coffre vide. Oseil ne peut pas récupérer tes chiffres à ta place.")])

add("email_change", "Confirme ta nouvelle adresse",
    [p("Bonjour,"),
     p("Tu as demandé à changer l’adresse e-mail de ton compte Oseil. Confirme-la pour que le changement prenne effet."),
     button("Confirmer cette adresse")],
    f"Si tu n’as rien demandé, ignore cet e-mail{N}: ton adresse actuelle reste la même.")

add("magic_link", "Ton lien de connexion",
    [p("Bonjour,"),
     p("Voici ton lien pour te connecter à Oseil. Il ne sert qu’une fois."),
     button("Me connecter")])

add("reauthentication", "Ton code de confirmation",
    [p("Bonjour,"),
     p(f"Pour confirmer cette action sur ton compte Oseil, saisis ce code{N}:"),
     code()])

add("invite", "Une invitation à Oseil",
    [p("Bonjour,"),
     p(f"On t’invite à ouvrir un compte sur Oseil, pour suivre ton argent au calme. Tes chiffres y sont chiffrés dans ton navigateur{N}: personne d’autre que toi ne peut les lire."),
     button("Accepter l’invitation")],
    f"Si tu ne t’attendais pas à cette invitation, ignore cet e-mail{N}: aucun compte ne sera ouvert.")

# The update reminder (6 months without an update). Draft words, to be validated by Nicolas.
# {{UNSUBSCRIBE}} is replaced by the database with the account's own unsubscribe link.
REMINDER_SUBJECT = "Tes chiffres ont plus de six mois"
REMINDER = page(REMINDER_SUBJECT,
    [p("Tes chiffres n’ont pas été mis à jour depuis plus de six mois. Un tour de tes banques, et ils seront de nouveau justes."),
     button("Mettre à jour", "https://oseil.fr")],
    f'Tu reçois ce rappel parce que tu as un compte Oseil. <a href="{{{{UNSUBSCRIBE}}}}" style="color:{SOFT};text-decoration:underline;">Ne plus recevoir ce rappel</a>')

if REMINDER_SQL:
    TAG = "$email$"
    for quote in (TAG, "$fn$"):
        if quote in REMINDER: raise SystemExit(f"{quote} appears in the e-mail: pick another dollar-quote tag")
    if "{{UNSUBSCRIBE}}" not in REMINDER: raise SystemExit("the e-mail has no {{UNSUBSCRIBE}} link")
    print(f"""-- Generated by: python3 -I scripts/emails/gen_emails.py --reminder-sql (do not edit by hand).
-- The reminder e-mail's HTML, with the account's unsubscribe link in place of {{{{UNSUBSCRIBE}}}}.
create function public.reminder_email_html(unsubscribe_url text) returns text
language sql
immutable
set search_path = ''
as $fn$
  select replace({TAG}{REMINDER}{TAG}, '{{{{UNSUBSCRIBE}}}}', reminder_email_html.unsubscribe_url);
$fn$;

revoke all on function public.reminder_email_html(text) from public, anon, authenticated;""")
    sys.exit(0)

with open(os.path.join(OUT, "templates.json"), "w", encoding="utf-8") as f:
    json.dump(T, f, ensure_ascii=False, indent=2)
for k in ["confirmation", "recovery", "email_change", "magic_link", "reauthentication", "invite"]:
    with open(os.path.join(OUT, f"{k}.html"), "w", encoding="utf-8") as f:
        f.write(T[f"mailer_templates_{k}_content"])
with open(os.path.join(OUT, "reminder.html"), "w", encoding="utf-8") as f:
    f.write(REMINDER)

# checks
import re
for k, v in [*T.items(), ("reminder", REMINDER), ("reminder_subject", REMINDER_SUBJECT)]:
    s = re.sub(r"<[^>]+>", "", v)
    bad = re.findall(r" [:;?!]", s)
    apos = "'" in s
    print(k, len(v), "BAD-PUNCT" if bad else "punct-ok", "STRAIGHT-APOS" if apos else "apos-ok")
