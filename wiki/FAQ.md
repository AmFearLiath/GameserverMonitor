# FAQ (EN)

## What does GameserverMonitor support?

Pterodactyl-managed servers and externally hosted game servers.

## Why do I sometimes see suppressed alerts?

The worker applies suppression logic (maintenance, planned power action, startup grace, cooldown, duplicate protection).

## How often are checks executed?

By default based on worker settings (`worker_check_interval_sec`) and global tick timing.

## Where can I configure alert test messages?

In Admin settings under alerts (`test_message_enabled`) and via alert channel test action.

## Is auto-update automatic deployment?

No. It performs release checks against GitHub and reports availability in settings; update rollout remains manual.

## Why can lint fail with no code errors from my changes?

Existing unrelated lint issues can still fail the global lint command. Fix or suppress those separately.
