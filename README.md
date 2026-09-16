# PayTimePro

A local PERN development environment using PostgreSQL, Express, React (Vite), and Node.js.

## Requirements

- Node.js 22++
- npm 10+
- A locally installed PostgreSQL 15+ server

## Start locally

This machine has PostgreSQL 18 installed in `C:\Program Files\PostgreSQL\18`. First create the application database from PowerShell:

```powershells
& "C:\Program Files\PostgreSQL\18\bin\createdb.exe" -U postgres paytimepro
```

Enter the password chosen when PostgreSQL was installed. Then configure and start the application:

```powershell
Copy-Item .env.example .env
npm install
npm run db:migrate
npm run dev
```

Before running the migration, replace `postgres` after the colon in `.env` with your local PostgreSQL password:

```env
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/paytimepro
```

If the password contains URL-reserved characters such as `@`, `:`, `/`, or `#`, URL-encode it in the connection string.

Open http://localhost:5173. The API runs at http://localhost:5000 and the health endpoint is `/api/health`.

## Commands

- `npm run dev` starts the API and React dev servers.
- `npm run build` creates the production client build.
- `npm start` starts the API only.
- `npm run db:migrate` applies the base schema and pending incremental migrations.
- `npm run db:audit` runs read-only relationship, constraint, payroll, and tax integrity checks.
- `npm run smoke:payroll` exercises the local running API with temporary payroll data and cleans it up afterward; it is disabled in production.
- `npm test` runs the server unit tests.
- `npm run check` validates server syntax, runs tests, and builds the client.

Environment values are loaded from the repository-root `.env` when commands run from the root directory.
By default, PayTimePro uses PostgreSQL's `public` schema for compatibility with
existing installations. Set `DATABASE_SCHEMA` to a different lowercase schema
name only when the migrations were applied to that schema intentionally.

Incremental SQL migrations live in `database/migrations` and are recorded in the
`schema_migrations` table. Migration files are applied once in filename order.

## Production configuration

Production refuses to start with the built-in development session secret. Set a
long random `SESSION_SECRET` and set `DATABASE_URL` to the connection string from
Neon. Keep Neon’s `sslmode=require` in that URL; the server preserves that setting.
Set `DATABASE_SCHEMA=public` for the existing production database. Set
`CLIENT_ORIGIN` to the deployed site origin and `TRUST_PROXY=true`.

For Vercel, add these variables for the Production environment and redeploy:

```env
DATABASE_URL=postgresql://...
DATABASE_SCHEMA=public
SESSION_SECRET=<a-long-random-secret>
CLIENT_ORIGIN=https://your-site.vercel.app
TRUST_PROXY=true
```

Apply the migrations against the same Neon database before opening the site:

```powershell
$env:DATABASE_URL = 'postgresql://...'
$env:DATABASE_SCHEMA = 'public'
npm run db:migrate
```

After deployment, check `https://your-site.vercel.app/api/health`. It should return
database and migration checks instead of a Vercel function error.

For local API diagnosis, set `DEBUG_API_ERRORS=true`. Unexpected API failures
remain safe for users but include a request reference; the server log records the
matching full error. Detailed messages are never returned when `NODE_ENV=production`.

## Administrator login

Running `npm run db:migrate` creates or maintains the development Administrator account using `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `ADMIN_NAME` from `.env`.

The default local credentials are:

- Email: `admin@paytimepro.local`
- Password: `ChangeMe123!`

Change the password and `SESSION_SECRET` in `.env` before using the application outside local development. Existing Administrator passwords are preserved during routine migrations; set `RESET_ADMIN_PASSWORD=true` only for the migration run where you intentionally want to reset the seeded Administrator password.

Database migrations do not insert sample attendance or default employee shifts. For a disposable local demo database only, set `SEED_DEMO_DATA=true` before its first migration run. Never enable it for live company data.

## Role-based access control

The application stores roles, modules, and per-module Create/View/Update/Delete permissions in PostgreSQL. The migration seeds:

- `Administrator` with full access to all modules.
- `Employee` with View access to Overview and Timetracking.

Administrators can manage roles and permissions from **Dashboard → Roles & Access**, and assign roles from **Dashboard → Users**. API routes enforce the same permissions server-side under `/api/rbac`; hiding a dashboard item is not treated as authorization.

## Employees

The **Dashboard → Employees** module manages employee profiles, including employee ID, contact details, job title, hire date, and employment status. Create, View, Update, and Delete actions are independently controlled by the role's Employees permissions and enforced under `/api/workforce`.

Creating an employee also creates a linked login account using the profile email and the temporary password supplied in the form. The account receives the `Employee` role. Editing the profile can reset its password, and deleting the profile removes the linked login account.
