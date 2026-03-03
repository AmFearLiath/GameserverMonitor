# FAQ (DE)

## Was unterstützt GameserverMonitor?

Pterodactyl-verwaltete Server und extern gehostete Gameserver.

## Warum sehe ich manchmal unterdrückte Alerts?

Der Worker nutzt Suppression-Logik (Wartung, geplante Power-Aktion, Startup-Grace, Cooldown, Duplicate-Schutz).

## Wie oft werden Checks ausgeführt?

Standardmäßig über Worker-Settings (`worker_check_interval_sec`) und globales Tick-Intervall.

## Wo konfiguriere ich Alert-Testnachrichten?

In den Admin-Settings unter Alerts (`test_message_enabled`) und über die Test-Aktion beim Alert-Channel.

## Bedeutet Auto-Update automatische Deployment-Aktualisierung?

Nein. Es ist ein GitHub-Release-Check mit Statusanzeige; das eigentliche Update bleibt manuell.

## Warum kann Lint fehlschlagen, obwohl meine Änderung korrekt ist?

Bereits vorhandene, unabhängige Lint-Probleme können den Gesamt-Run trotzdem fehlschlagen lassen.
