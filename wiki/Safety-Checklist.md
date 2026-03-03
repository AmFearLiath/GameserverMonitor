# Safety Checklist (EN)

Use this checklist before going live.

## Secrets & Access

- [ ] `.env` is not committed
- [ ] JWT secrets are long/random and not defaults
- [ ] Discord, OAuth, and API credentials are stored only in environment variables
- [ ] Admin accounts use strong passwords

## Infrastructure

- [ ] Database is not publicly exposed
- [ ] TLS/HTTPS is enabled for all public endpoints
- [ ] Firewall allows only required inbound ports
- [ ] Reverse proxy headers and timeouts are configured

## Application

- [ ] Migrations are applied in correct order
- [ ] Health endpoints return success for API/worker stack
- [ ] Alert test messages are validated before production usage
- [ ] Suppression and cooldown settings are reviewed

## Monitoring & Recovery

- [ ] Backups are configured and restore-tested
- [ ] Logs are retained with reasonable rotation
- [ ] Incident/alert tables are monitored for anomalies
- [ ] Rollback plan is documented

## Release Hygiene

- [ ] `.gitignore` excludes local/debug artifacts
- [ ] No sensitive files are tracked in Git
- [ ] Release notes are updated
- [ ] Tag and branch versions are consistent
