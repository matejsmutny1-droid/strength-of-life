# Klientsky portál StrengthofLife

Toto je frontend portálu napojený na Supabase. Podporuje samostatnú registráciu klientov priamo na portáli, prihlásenie trénera aj klienta, súkromnú knižnicu videí/fotografií/PDF a trvalé priraďovanie návodov ku klientom. Klient po registrácii uvidí len návody pridelené trénerom.

## Lokálne spustenie

1. Otvor priečinok `klientsky-portal` vo VS Code.
2. Spusti `index.html` cez rozšírenie Live Server.
3. Po nastavení Supabase používaj adresu, ktorú Live Server vypíše (zvyčajne `http://127.0.0.1:5500`). Samotné `file://` prihlásenie nepodporuje.

## Čo treba nastaviť v Supabase

1. Supabase projekt vytvorí vlastník klientskych údajov.
2. V Supabase SQL Editore spustiť celý súbor `supabase/migrations/001_initial_schema.sql`.
3. Do `supabase-config.js` doplniť Project URL a publishable key. Tento súbor je v poriadku commitnúť, ale nikdy doň nedávať service-role/secret key.
4. V Auth povoliť registráciu používateľov, zapnúť potvrdenie e-mailu a pridať lokálnu aj produkčnú adresu portálu do povolených redirect URL.
5. Nastaviť vlastného SMTP odosielateľa. Bez neho predvolený Supabase e-mailový server neposiela správy ľubovoľným klientom a má nízky limit.
6. Vytvoriť trénerov účet a v SQL Editore mu nastaviť rolu trénera (príklad nižšie).

Vzor jednorazového povýšenia trénerovho profilu (zmeň e-mail a meno podľa toho, kto bude účet používať):

```sql
update public.profiles
set role = 'trainer', display_name = 'Miroslav Hájek'
where email = 'EMAIL_TRENERA';
```

Tréner sa prihlási e-mailom a heslom. Klient otvorí rovnakú adresu portálu, klikne **Ešte nemáš účet? Vytvor si ho**, vyplní svoje údaje a potvrdí e-mail. Účet sa automaticky zobrazí trénerovi v zozname klientov. Tréner mu potom priradí návody. Tréner a klient používajú samostatné e-mailové účty.

## Súkromie a prístup

- Databáza používa RLS politiky: klient číta len svoj profil, svoje priradenia a publikované pridelené návody.
- Súbory sú v privátnom buckete `training-media`; po overení prístupu sa vytvára dočasný odkaz platný 10 minút. Samotné pridelenie návodu neexpiruje.
- Klient sa zaregistruje cez formulár na portáli. Každý nový účet dostane rolu `client`; klient nedokáže zmeniť vlastnú rolu ani sa dostať k neprideleným súborom.
- Nikdy nedávať service-role/secret key do JavaScriptu, HTML, GitHubu ani správy. Browser používa publishable key; hranicou ochrany sú databázové RLS pravidlá.

## Nasadenie

Netreba samostatný repozitár ani doménu. Po nakonfigurovaní hostingu môže byť portál napríklad na `https://strengthoflife.sk/klientsky-portal/`. Samotný priečinok a lokálny Live Server túto adresu nevytvoria; pred zdieľaním s Miroslavom treba web nasadiť a nastaviť produkčné povolené URL, origin aj `PORTAL_SITE_URL`.
