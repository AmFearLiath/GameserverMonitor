# Setup-Anleitung (DE)

## Voraussetzungen

- Node.js 20+
- pnpm 10+
- MySQL 8+

## Umgebung

1. `.env.example` nach `.env` kopieren
2. DB-Zugangsdaten und Integrations-Secret setzen
3. `WEB_BASE_URL` und `VITE_API_BASE_URL` auf Deployment abstimmen

## Installation

```bash
pnpm install
```

## Datenbank

```bash
pnpm db:migrate
```

Optional Seed:

```bash
pnpm db:seed
```

## Entwicklung starten

```bash
pnpm dev:api
pnpm dev:worker
pnpm dev:web
```

## Qualitätschecks

```bash
pnpm lint
pnpm test
```

## Produktiv-Hinweise

- Starke Secrets für JWT und Integrationen verwenden
- `.env` privat halten und keine echten Credentials committen
- DB-Netzwerkzugriff einschränken
- Öffentliche Endpunkte nur per HTTPS bereitstellen
