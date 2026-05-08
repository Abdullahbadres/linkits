# LINKIT — setup after clone

This guide covers repository layout, tech stack, local setup, Docker, Neon, migrations, and troubleshooting.

---

## Repository layout & stack

The app is a **Next.js**: UI and API routes live in one project (`src/app`). **PostgreSQL** is accessed through **Prisma ORM**.

### Frontend

| Technology | Version (indicative) | Role |
|------------|----------------------|------|
| **Next.js** (App Router) | 16.x | Routing, SSR/CSR, API Routes |
| **React** | 19.x | UI components |
| **TypeScript** | 5.x | Static typing |
| **Tailwind CSS** | 3.x | Styling |
| **PostCSS** + **Autoprefixer** | — | CSS pipeline |

### Backend (inside Next.js)

| Technology | Version (indicative) | Role |
|------------|----------------------|------|
| **Next.js Route Handlers** | 16.x | REST API in `src/app/api/**/route.ts` |
| **Prisma** + **@prisma/client** | 6.x | Database access, migrations |
| **Zod** | 4.x | Body/query validation |
| **jose** | 6.x | JWT (sign / verify) |
| **bcryptjs** | 3.x | Password hashing |

### Database & tooling

| Component | Role |
|-----------|------|
| **PostgreSQL** | Dev/prod database (Neon or Docker) |
| **Neon** | Managed Postgres (`postgresql://…?sslmode=require`) |
| **Docker / Docker Compose** | Local Postgres + app image (`Dockerfile`) |
| **prisma.config.ts** | Prisma CLI config (schema + migrations path; loads `dotenv` for CLI) |
| **ESLint** + **eslint-config-next** | Linting |

### npm dependencies (summary)

- **dependencies:** `@prisma/client`, `bcryptjs`, `jose`, `next`, `prisma`, `react`, `react-dom`, `zod`
- **devDependencies:** `@types/*`, `autoprefixer`, `eslint`, `eslint-config-next`, `postcss`, `tailwindcss`, `typescript`

*(Exact versions are in `package.json` / `package-lock.json`.)*

### Folder layout (main)

```
linkit-app/
├── prisma/
│   ├── schema.prisma          # DB models + PostgreSQL datasource
│   └── migrations/            # SQL migrations (avoid manual edits after apply)
├── prisma.config.ts           # Prisma CLI config
├── public/                    # Static assets
├── src/
│   ├── app/                   # App Router: pages + API
│   │   ├── api/               # Route handlers (auth, movies, sales, health, …)
│   │   ├── dashboard/         # Dashboard UI (middleware-protected)
│   │   ├── login/ / register/
│   │   ├── layout.tsx / page.tsx / globals.css
│   │   └── …
│   ├── components/            # Shared React components
│   └── lib/                   # prisma, auth, validators, logger, api helpers, …
├── docs/
│   └── DEPLOY-RAILWAY.md      # Railway + Neon deploy
├── Dockerfile                 # Standalone build + migrate on container start
├── docker-compose.yml         # Local Postgres + app
├── package.json
├── next.config.ts             # output: "standalone" (for Docker)
├── middleware.ts              # JWT for /api/* and /dashboard
├── logs/                      # Runtime logs (optional)
└── .env                       # Create locally — not to commit and share
```

---

## After `git clone` — local setup

**Prerequisites:** **Node.js 20+**, **npm**, and for local DB: **Docker Desktop** (or a running Postgres instance).

```bash
cd linkit-app
npm install
```

`postinstall` runs **`prisma generate`** — on Windows, ensure no other process locks Prisma engine files (see [Troubleshoot](#9-troubleshoot)).

Create a **`.env`** file in the `linkit-app` root (use the variable list in [§3](#3-do-not-commit-secrets); fill in real values).

---

### 1. Backend setup

Backend = Next.js **Route Handlers** + Prisma.

1. Ensure **`.env`** has a valid `DATABASE_URL` (Neon or local Postgres).
2. Apply the schema to the database:

   ```bash
   npx prisma migrate deploy
   ```

   For ongoing development when you add new schema changes:

   ```bash
   npm run db:migrate
   ```

3. Regenerate the client if needed:

   ```bash
   npm run db:generate
   ```

---

### 2. Frontend setup

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Login, register, and dashboard pages use React UI under `src/app`.

Production build locally:

```bash
npm run build
npm start
```

---

### 3. Do not commit secrets

- **Never** commit `.env`, API keys, database passwords, or `JWT_SECRET` to Git.
- This repo ignores **`.env*`** via `.gitignore` — still run `git status` before every commit.
- For CI/CD and hosting, set variables in your **provider’s dashboard** (Railway, Vercel, etc.), not in tracked files.
- Rotate Neon passwords / API keys if they were ever exposed.

Application environment variables (reference):

| Variable | Required | Notes |
|----------|----------|-------|
| `DATABASE_URL` | Yes | `postgresql://…` URI (Neon: include `sslmode=require` when Neon recommends it) |
| `JWT_SECRET` | Strongly recommended | Long random string (e.g. 32+ characters) |
| `DEFAULT_ADMIN_USERNAME` | Optional | Defaults to `admin` |
| `DEFAULT_ADMIN_PASSWORD` | Optional | Defaults to `admin123` — change in production |
| `OMDB_API_KEY` | For movie sync | OMDb API key |
| `TMDB_API_KEY` | Optional | Extra enrichment movie list |
| `TMDB_WATCH_REGION` | Optional | e.g. `US` |

---

### 4. Docker & Neon database setup

**Local Postgres (Docker Compose)**

Database only:

```bash
docker compose up -d db
```

Set `DATABASE_URL` to:

`postgresql://postgres:postgres@localhost:5432/linkit?schema=public`

**Neon**

1. Create a project at [neon.tech](https://neon.tech).
2. Copy the **connection string** (URI) into `DATABASE_URL`.
3. Ensure it works with Prisma (SSL: often `?sslmode=require`).

**Docker: app + DB**

```bash
docker compose up --build
```

The `app` service uses an internal `DATABASE_URL` pointing at the `db` service. Adjust secrets via a Compose env file or export variables before `docker compose up`.

---

### 5. Deploy Neon and Docker

- **Neon:** store `DATABASE_URL` in your deployment platform’s environment (not in the repo).
- **Dockerfile:** builds Next.js standalone; on container start runs `prisma migrate deploy` then `node server.js`.
- Step-by-step **Railway + Neon** guide: [`docs/DEPLOY-RAILWAY.md`](docs/DEPLOY-RAILWAY.md) (set the Railway **Root Directory** to the folder that contains `Dockerfile` / `package.json`).

---

### 6. Neon database — migrate and seed

**Migrate**

```bash
npx prisma migrate deploy
```

This applies every folder under `prisma/migrations/` to the database pointed to by `DATABASE_URL`.

**Seed**

This project **does not** ship a Prisma `seed` script. The default admin user is created **automatically** the first time auth runs `ensureDefaultUser()` (see [`src/lib/auth.ts`](src/lib/auth.ts)): if no user exists with `DEFAULT_ADMIN_USERNAME`, that user is created with the **ADMIN** role.

After logging in as admin, run **movie sync** from the dashboard if you need to populate the `Movie` table (requires a valid `OMDB_API_KEY`).

---

### 7. PowerShell / Bash — quick reference

| Task | PowerShell | Bash (Git Bash / WSL / Linux / macOS) |
|------|------------|----------------------------------------|
| Change directory | `cd path\to\linkit-app` | `cd ~/path/to/linkit-app` |
| Remove Next cache | `Remove-Item -Recurse -Force .next` | `rm -rf .next` |
| Install | `npm install` | `npm install` |
| Dev server | `npm run dev` | `npm run dev` |
| Migrate deploy | `npx prisma migrate deploy` | `npx prisma migrate deploy` |
| Prisma generate | `npx prisma generate` | `npx prisma generate` |

**Windows:** if `prisma generate` fails with **EPERM**, stop `npm run dev` and other Node processes, then retry.

---

### 8. Auth

- **Login:** `POST /api/auth/login` — JSON body `{ "username", "password" }` → returns JWT + user payload.
- **Register:** `POST /api/auth/register`.
- **Profile:** `GET /api/auth/profile` — header `Authorization: Bearer <token>`.
- **Middleware** ([`src/middleware.ts`](src/middleware.ts)): protects **`/api/*`** (except public paths) and **`/dashboard`**. Public paths: `/api/auth/login`, `/api/auth/register`, `/api/health`, `/login`, `/register`.
- Token may be sent as **Bearer** or via the `token` cookie (per client implementation).
- Roles: **ADMIN** (full access + catalog sync) vs **USER**; default admin is ensured by `ensureDefaultUser()`.

---

### 9. Troubleshoot

| Symptom | Likely cause | What to do |
|---------|----------------|------------|
| `POST /api/auth/login` **500** | Stale Prisma client (e.g. old SQLite build) or bad `DATABASE_URL` | Stop dev server → delete `.next` → `npx prisma generate` → restart |
| **EPERM** on `prisma generate` | Prisma engine DLL locked by Node / IDE | Close dev server and other terminals; Task Manager → end Node; retry |
| Prisma: URL must be `file:` | Client/schema out of sync with PostgreSQL | Ensure `prisma/schema.prisma` has `provider = "postgresql"` and run `npx prisma generate` again |
| **401** on API | Missing/expired token or non-public path | Log in again; send `Authorization: Bearer …` |
| Neon connection fails | Firewall, wrong string, SSL | Verify URI; add `?sslmode=require` if needed |
| `migrate deploy` fails | DB unreachable or migration conflict | Check `DATABASE_URL`; do not delete migrations already used by the team |

Optional application logs may appear under `logs/`.

---

```bash
npm install              # runs prisma generate (postinstall)
npx prisma migrate deploy
npm run dev
npm run build && npm start
npm run lint
```

---

*This document describes the **linkit-app** project setup.
