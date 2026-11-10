# Deploy FMS on the CloudPanel server

Target: app at **https://fms.mdvfleet.co.tz**, using the self-hosted Supabase already running on the same server at **https://db.mdvfleet.co.tz**.

```
Browser ──> fms.mdvfleet.co.tz  (CloudPanel Node.js site, nginx) ──> Next.js on 127.0.0.1:3010 (PM2)
        └─> db.mdvfleet.co.tz   (existing Supabase)               ──> Supabase Kong (Docker)
                                                                       └─ Postgres, Auth, REST, Storage, Realtime
```

The app needs Supabase (Postgres plus Auth, REST and Storage). CloudPanel's own databases are MySQL and cannot be used.

## 1. Check the existing Supabase

Supabase is already running at `https://db.mdvfleet.co.tz`, so there is no new subdomain and no new install. From your PC, open:

```
https://db.mdvfleet.co.tz/auth/v1/health
```

JSON, or a 401 asking for an apikey, means the API is reachable on that address.

On the server, open the `.env` of that Supabase install (the folder where its `docker-compose.yml` is) and make sure these are set:

```
SITE_URL=https://fms.mdvfleet.co.tz
ADDITIONAL_REDIRECT_URLS=https://fms.mdvfleet.co.tz/auth/callback
API_EXTERNAL_URL=https://db.mdvfleet.co.tz
SUPABASE_PUBLIC_URL=https://db.mdvfleet.co.tz

# Accounts are created by invitation only; the app sends all email itself.
DISABLE_SIGNUP=true
```

If you changed any of them, apply with `docker compose up -d` in that folder. Copy `ANON_KEY` and `SERVICE_ROLE_KEY` from the same file; the app needs them in step 5.

Find the name of the database container (usually `supabase-db`):

```bash
docker ps --format '{{.Names}}' | grep -i db
```

If it is not `supabase-db`, put `DB_CONTAINER=<name>` in front of the commands in step 4.

## 2. CloudPanel site for the app

You already created `fms.mdvfleet.co.tz`. In its Settings make sure:
- Node.js version: 22
- App Port: **3010**
- SSL/TLS: Let's Encrypt certificate issued

## 3. Database: migrations, base data, owner (as root, in the app folder)

Get the code onto the server first (step 4 clones it), then from the app folder:

```bash
cd /home/<site-user>/htdocs/fms.mdvfleet.co.tz
bash scripts/migrate.sh --seed-base
```

This applies every migration in order, records them in `public.fms_migrations`, and loads the modules, roles and packages. It does not load demo data. It talks to the `supabase-db` container directly, so it must run as a user allowed to use Docker (root).

Create your owner account:

```bash
docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -v email='you@mdvfleet.co.tz' -v name='Your Name' -v password='a-strong-password' \
  < supabase/create_owner.sql
```

## 4. The app (as the CloudPanel site user)

SSH in as the site user CloudPanel created for `fms.mdvfleet.co.tz`, or use `su - <site-user>` from root.

```bash
cd ~/htdocs/fms.mdvfleet.co.tz
rm -rf ./* ./.[!.]* 2>/dev/null || true        # the folder must be empty for git clone
git clone https://github.com/joshuaMarandi/fms.git .
cp .env.example .env.local
nano .env.local
```

Fill `.env.local`. These values are built into the app, so set them before the first build:

```
NEXT_PUBLIC_SUPABASE_URL=https://db.mdvfleet.co.tz
NEXT_PUBLIC_SUPABASE_ANON_KEY=<ANON_KEY from the Supabase .env>
SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY from the Supabase .env>
NEXT_PUBLIC_APP_URL=https://fms.mdvfleet.co.tz

SMTP_USER=<gmail address>
SMTP_PASSWORD=<16-character Google app password>
MAIL_FROM_NAME=Fleet Management System
CRON_SECRET=<openssl rand -hex 32>
```

Install PM2 once, then build and start:

```bash
npm install -g pm2
bash scripts/deploy.sh
pm2 status          # fms should be "online"
```

Keep it running after a reboot. Add this to the site user's crontab (`crontab -e`):

```
@reboot cd ~/htdocs/fms.mdvfleet.co.tz && pm2 resurrect
```

Open https://fms.mdvfleet.co.tz and sign in with the owner account from step 3.

## 5. Daily email digest

The reminder check runs inside Postgres every day at 06:00 (pg_cron). Add the digest to the site user's crontab:

```
15 6 * * * curl -fsS -H "Authorization: Bearer <CRON_SECRET>" https://fms.mdvfleet.co.tz/api/cron/notifications > /dev/null
```

Test it once by hand: run the same `curl` without `> /dev/null`. It answers with how many emails were sent.

## 6. Updating later

From your PC push to GitHub as usual, then on the server:

```bash
# as root, only when there are new files in supabase/migrations
cd /home/<site-user>/htdocs/fms.mdvfleet.co.tz && git pull && bash scripts/migrate.sh

# as the site user
cd ~/htdocs/fms.mdvfleet.co.tz && bash scripts/deploy.sh
```

`deploy.sh` pulls `main`, runs `npm ci`, builds and reloads PM2 without downtime.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| 502 Bad Gateway on fms | `pm2 logs fms`; the App Port in CloudPanel must be 3010 |
| Build stops with "JavaScript heap out of memory" | The server needs about 3 GB free RAM for the build; add swap: `fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile` |
| Sign in fails, "Invalid API key" | `NEXT_PUBLIC_SUPABASE_ANON_KEY` does not match `ANON_KEY`; rebuild after fixing `.env.local` |
| Invite says "SUPABASE_SERVICE_ROLE_KEY is not set" | Add it to `.env.local`, then `pm2 reload fms --update-env` |
| Invite or reset link opens login with an error | `ADDITIONAL_REDIRECT_URLS` and `SITE_URL` in the Supabase `.env`; then `docker compose up -d` |
| Emails fail with "rejected the login" | Use a Google app password, not the account password; 2-Step Verification must be on |
| Uploads fail | `docker compose ps` shows `storage` healthy; buckets exist in Studio, Storage |
| Supabase Studio | https://db.mdvfleet.co.tz with the dashboard login |
