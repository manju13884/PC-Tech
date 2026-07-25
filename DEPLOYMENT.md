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

Before a production deployment, inspect the pending remote migrations:

```bash
npm run db:migrations:list:production
```

Apply production migrations before deploying the Pages application:

```bash
npm run db:migrate:production
```

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
