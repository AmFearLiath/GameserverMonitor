# GameserverMonitor

GameserverMonitor is a full-stack monitoring platform for Pterodactyl-managed and external game servers.

It provides real-time status tracking, incident history, alerting (Discord webhook), server detail views, admin configuration, and background health checks.

## Documentation

- Multilingual Wiki (EN/DE):
  - Repository docs: [wiki/Home.md](wiki/Home.md)
  - Repository docs (DE): [wiki/Home-DE.md](wiki/Home-DE.md)
  - GitHub Wiki (published): <https://github.com/AmFearLiath/GameserverMonitor/wiki>

## Features

- Live server monitoring with status normalization (`ONLINE`, `OFFLINE`, `TRANSITION`, `MAINTENANCE`)
- Pterodactyl integration and external server onboarding
- Historical check buckets and incident timeline
- Discord webhook alerting with suppression/cooldown logic
- Public overview page and authenticated admin area
- Configurable worker interval/concurrency via app settings
- Optional release update checks via GitHub releases

## Project Structure

- `apps/api` – REST API
- `apps/web` – React + Vite frontend
- `apps/worker` – scheduler and monitoring jobs
- `packages/db` – data access and migration scripts
- `packages/core`, `packages/shared`, `packages/logger`, `packages/config` – shared modules
- `migrations` – SQL migrations

## Tech Stack

- TypeScript (monorepo)
- Node.js + Express
- React + Vite
- MySQL
- pnpm workspaces

## Quick Start

### 1) Install dependencies

```bash
pnpm install
```

### 2) Configure environment

- Copy `.env.example` to `.env`
- Fill in database and integration values

### 3) Run migrations

```bash
pnpm db:migrate
```

### 4) Start services

```bash
pnpm dev:api
pnpm dev:worker
pnpm dev:web
```

## Available Scripts

From repository root:

```bash
pnpm dev:api
pnpm dev:worker
pnpm dev:web
pnpm db:migrate
pnpm db:seed
pnpm build
pnpm lint
pnpm test
```

## Release Notes

- Current repository release target: `v1.0.0`
- For setup, operations, troubleshooting, and safety guidance, see the multilingual wiki linked above.

## License

This project is licensed under the terms in [LICENSE](LICENSE).
