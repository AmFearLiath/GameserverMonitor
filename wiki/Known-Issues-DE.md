# Known Issues (DE)

## Aktuell

1. **Web-Lint kann wegen bestehendem Altproblem fehlschlagen**
   - Datei: `apps/web/src/layout/Header.tsx`
   - Symptom: `pageTitle` ist definiert, aber ungenutzt
   - Auswirkung: `pnpm --filter @gm/web lint` schlägt fehl, bis behoben

2. **SVGrepo-Rate-Limits bei automatisierter Icon-Suche**
   - Symptom: HTTP 429 bei vielen schnellen Requests
   - Workaround: Seiten manuell im Browser öffnen oder später erneut versuchen

3. **Worker unterdrückt zu Beginn kurzzeitig Alerts (gewollt)**
   - Verhalten: Startup-Grace unterdrückt initial Alerts
   - Auswirkung: erwartetes Verhalten zur Reduktion von Fehlalarmen

## Bereits adressiert / Kontext

- Discord-Alerts unterstützen gebündelte Nachrichten bei gleichzeitigen Übergängen.
- Planned-Restart-Suppression wurde verbessert, um Fehlalarme bei Neustarts zu reduzieren.
