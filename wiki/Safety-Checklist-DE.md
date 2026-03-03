# Safety Checklist (DE)

Diese Checkliste vor Go-Live prüfen.

## Secrets & Zugriff

- [ ] `.env` ist nicht committet
- [ ] JWT-Secrets sind lang/zufällig und keine Defaults
- [ ] Discord-, OAuth- und API-Credentials liegen nur in Umgebungsvariablen
- [ ] Admin-Konten haben starke Passwörter

## Infrastruktur

- [ ] Datenbank ist nicht öffentlich erreichbar
- [ ] TLS/HTTPS ist für alle öffentlichen Endpunkte aktiv
- [ ] Firewall erlaubt nur benötigte Inbound-Ports
- [ ] Reverse-Proxy-Header und Timeouts sind korrekt gesetzt

## Anwendung

- [ ] Migrationen sind in korrekter Reihenfolge angewendet
- [ ] Health-Endpoints liefern OK für API/Worker-Stack
- [ ] Alert-Testnachrichten wurden vor Produktion geprüft
- [ ] Suppression- und Cooldown-Settings sind validiert

## Monitoring & Recovery

- [ ] Backups sind eingerichtet und Restore wurde getestet
- [ ] Logs haben sinnvolle Rotation/Aufbewahrung
- [ ] Incident-/Alert-Tabellen werden auf Auffälligkeiten überwacht
- [ ] Rollback-Plan ist dokumentiert

## Release-Hygiene

- [ ] `.gitignore` schließt lokale/debug Artefakte aus
- [ ] Keine sensiblen Dateien sind in Git getrackt
- [ ] Release Notes sind aktualisiert
- [ ] Tag- und Branch-Versionen sind konsistent
