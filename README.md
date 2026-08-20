# PayTimePro

A local PERN development environment using PostgreSQL, Express, React (Vite), and Node.js.

## Requirements

- Node.js 22+
- npm 10+
- A locally installed PostgreSQL 15+ server

## Start locally

This machine has PostgreSQL 18 installed in `C:\Program Files\PostgreSQL\18`. First create the application database from PowerShell:

```powershell
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
- `npm run db:migrate` applies `database/init.sql`.
- `npm test` runs the server unit tests.
- `npm run check` validates server syntax, runs tests, and builds the client.

Environment values are loaded from the repository-root `.env` when commands run from the root directory.

Incremental SQL migrations live in `database/migrations` and are recorded in the
`schema_migrations` table. Migration files are applied once in filename order.

## Production configuration

Production refuses to start with the built-in development session secret. Set a
long random `SESSION_SECRET`. Enable `DATABASE_SSL=true` only when the database
server presents a certificate trusted by Node.js. Set `TRUST_PROXY=true` when the
API runs behind a trusted reverse proxy that terminates HTTPS.

## Administrator login

Running `npm run db:migrate` creates or updates the development Administrator account using `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `ADMIN_NAME` from `.env`.

The default local credentials are:

- Email: `admin@paytimepro.local`
- Password: `ChangeMe123!`

Change the password and `SESSION_SECRET` in `.env` before using the application outside local development, then rerun `npm run db:migrate` to update the seeded Administrator password.

## Role-based access control

The application stores roles, modules, and per-module Create/View/Update/Delete permissions in PostgreSQL. The migration seeds:

- `Administrator` with full access to all modules.
- `Employee` with View access to Overview and Timetracking.

Administrators can manage roles and permissions from **Dashboard → Roles & Access**, and assign roles from **Dashboard → Users**. API routes enforce the same permissions server-side under `/api/rbac`; hiding a dashboard item is not treated as authorization.

## Workforce

The **Dashboard → Workforce** module manages employee profiles, including employee ID, contact details, job title, department, hire date, and employment status. Create, View, Update, and Delete actions are independently controlled by the role's Workforce permissions and enforced under `/api/workforce`.

Creating an employee also creates a linked login account using the profile email and the temporary password supplied in the form. The account receives the `Employee` role. Editing the profile can reset its password, and deleting the profile removes the linked login account.
