# Setup Guide (EN)

## Prerequisites

- Node.js 20+
- pnpm 10+
- MySQL 8+

## Environment

1. Copy `.env.example` to `.env`
2. Set database credentials and integration secrets
3. Ensure `WEB_BASE_URL` and `VITE_API_BASE_URL` match your deployment

## Install

```bash
pnpm install
```

## Database

```bash
pnpm db:migrate
```

Optional seed:

```bash
pnpm db:seed
```

## Run in Development

```bash
pnpm dev:api
pnpm dev:worker
pnpm dev:web
```

## Run Quality Checks

```bash
pnpm lint
pnpm test
```

## Production Notes

- Use strong secrets for JWT and integration credentials
- Keep `.env` private and never commit real credentials
- Restrict DB network access
- Use HTTPS for public endpoints
