# Deployment Guide

## 1. Build the frontend

```bash
npm run build
```

The production files will be generated in the dist folder.

## 2. Apply D1 migrations

Development uses an isolated local D1 database:

```bash
npm run db:migrate:dev
```

Every migration command first runs the immutable/additive migration audit. Existing
migration checksums must not be changed; add a new sequential migration instead.

Dev, Test and Stage share the named `nonproduction` Wrangler environment and the
`pc-tech` Pages project. The current Cloudflare setup points that environment at
the same physical D1 UUID as Production. Treat every non-production remote
migration as a Production database migration: audit, list, back up and review it
before applying. Local development remains isolated through `--local`.

Inspect pending shared Non-Production/Stage migrations:

```bash
npm run db:migrations:list:nonproduction
```

Apply them only after explicit approval and a verified D1 backup:

```bash
npm run db:migrate:nonproduction
```

Before a production deployment, inspect the pending remote migrations:

```bash
npm run db:migrations:list:production
```

Apply production migrations before deploying the Pages application:

```bash
npm run db:migrate:production
```

Production commands explicitly select `--env production`; they must never be used
for Local, Dev, Test, or Stage validation.

Environment database mapping:

- `nonproduction`: `pc-tech-db` (`0d749a66-9654-4767-b56a-afd4f8bcd9a1`)
- `production`: `pc-tech-production-db` (`e863e5c3-b60f-48a5-8fdd-862f1ac52eaf`)

The production GitHub Actions workflow performs this migration step automatically
before deploying the application. Never use `--remote` for development validation.

## 3. Run the Zoho API backend

Create a .env file based on .env.example and set your Zoho credentials.

```bash
npm install
node server/start-zoho-api.js
```

The API will run on port 4001 by default.

## 4. Host the frontend

Upload the contents of the dist folder to your hosting provider.

## 5. DNS for GoDaddy

- Point www.polarcanvas.in to your frontend hosting provider
- Point api.polarcanvas.in to your backend server if you use a subdomain

## 6. Production CORS

Update the CORS origin in the backend to your public domain, for example:

```text
https://www.polarcanvas.in
```
