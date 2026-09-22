# PC-Tech

React, TypeScript, Vite, and Cloudflare Pages application in `D:\PC-Tech`.

## Getting Started

```bash
npm install
npm run dev
```

`npm run dev` is the complete local startup command. It applies pending local D1 migrations, starts the authentication/API backend on port 8788, waits until it is ready, and then starts the Vite frontend on port 5173.

## Available Scripts

- `npm run dev` — start the local database, backend, and frontend in the required order
- `npm run dev:backend` — start only the local Pages Functions backend
- `npm run dev:frontend` — start only the Vite frontend
- `npm run build` — build the production bundle
- `npm run preview` — serve the production build locally
- `npm run lint` — lint source files
- `npm run format` — format files with Prettier
