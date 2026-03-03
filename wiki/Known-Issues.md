# Known Issues (EN)

## Current

1. **Web lint can fail due to unrelated existing issue**
   - File: `apps/web/src/layout/Header.tsx`
   - Symptom: `pageTitle` defined but never used
   - Impact: `pnpm --filter @gm/web lint` fails until fixed

2. **SVGrepo fetch rate limits during automated icon lookup**
   - Symptom: HTTP 429 when fetching many icon pages quickly
   - Workaround: open pages manually in browser or retry later

3. **First worker cycles may suppress alerts intentionally**
   - Behavior: startup grace period suppresses alerts briefly after worker start
   - Impact: expected behavior to reduce false positives

## Resolved / Contextual

- Discord alerts now support batched messages for concurrent transitions.
- Planned restart suppression logic has been improved to reduce restart false alarms.
