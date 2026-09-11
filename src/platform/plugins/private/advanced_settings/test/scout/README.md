# Advanced Settings Scout tests

Scout (Playwright) tests for the Advanced Settings plugin.

## UI tests

Specs live in `ui/tests`:

- `advanced_settings_security.spec.ts`
- `advanced_settings_spaces.spec.ts`

Run against a persistent stateful stack:

```bash
node scripts/scout start-server --arch stateful --domain classic
node scripts/scout run-tests --arch stateful --domain classic \
  --config src/platform/plugins/private/advanced_settings/test/scout/ui/playwright.config.ts
```

## API tests

Specs live in `api/tests`:

- `feature_controls.spec.ts` — asserts that Kibana feature privileges (`advancedSettings`,
  `savedObjectsManagement`) and per-space privileges allow/deny saving an advanced setting
  (`POST /internal/kibana/settings`) and telemetry opt-in (`POST /internal/telemetry/optIn`).

Run against a persistent stateful stack:

```bash
node scripts/scout start-server --arch stateful --domain classic
node scripts/scout run-tests --arch stateful --domain classic \
  --config src/platform/plugins/private/advanced_settings/test/scout/api/playwright.config.ts
```
