/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRole } from '@kbn/scout-oblt';

/**
 * Custom roles used by the Observability cases / RBAC Scout suites, ported from
 * the FTR `observability.users.defineBasicObservabilityRole` helper
 * (x-pack/solutions/observability/test/functional/services/observability/users.ts).
 *
 * The FTR helper grants `cluster: ['all']` plus index privileges keyed off the
 * requested feature set; for `{ logs: ['all'] }` that means `['filebeat-*',
 * 'logs-*']`. We replicate the same elasticsearch + kibana feature privileges
 * here and drive them through `browserAuth.loginWithCustomRole`.
 */
const LOGS_INDEX_PRIVILEGES = { names: ['filebeat-*', 'logs-*'], privileges: ['all'] };

const observabilityRole = (feature: Record<string, string[]>): KibanaRole => ({
  elasticsearch: {
    cluster: ['all'],
    indices: [LOGS_INDEX_PRIVILEGES],
  },
  kibana: [
    {
      base: [],
      feature,
      spaces: ['*'],
    },
  ],
});

/** `observabilityCasesV3: ['all']` + `logs: ['all']` — full cases access. */
export const CASES_ALL_ROLE: KibanaRole = observabilityRole({
  observabilityCasesV3: ['all'],
  logs: ['all'],
});

/** `observabilityCasesV3: ['read']` + `logs: ['all']` — read-only cases access. */
export const CASES_READ_ROLE: KibanaRole = observabilityRole({
  observabilityCasesV3: ['read'],
  logs: ['all'],
});

/**
 * No observability privileges at all — only `discover: ['all']`. Mirrors the FTR
 * "no observability privileges" role and is expected to hit the cases feature
 * 403 page.
 */
export const NO_CASES_ROLE: KibanaRole = {
  elasticsearch: { cluster: [], indices: [] },
  kibana: [
    {
      base: [],
      feature: { discover: ['all'] },
      spaces: ['*'],
    },
  ],
};

/**
 * Add-to-case suites need the role to also *see* the alerts table rows. The
 * Scout alert generator (`generateObservabilityAlerts`) writes APM alerts into
 * `.alerts-observability.apm.alerts-default`, so unlike the FTR (which restored
 * an es_archive visible to a logs-only user) we additionally grant `apm: ['read']`
 * so the alerts render for the custom role under test.
 */
export const CASES_ALL_WITH_ALERTS_ROLE: KibanaRole = observabilityRole({
  observabilityCasesV3: ['all'],
  apm: ['read'],
  logs: ['all'],
});

export const CASES_READ_WITH_ALERTS_ROLE: KibanaRole = observabilityRole({
  observabilityCasesV3: ['read'],
  apm: ['read'],
  logs: ['all'],
});

/**
 * Roles used to exercise the per-rule-type "View rule" link gating on the
 * Observability alerts page.
 *
 * Both roles grant `observabilityAlerts: ['read']`, which authorizes alert read
 * for *every* observability rule type (so the alerts table shows both the logs
 * and metrics alerts) but grants no rule read. Each role then layers a single
 * solution feature on top to authorize rule read for one rule type only:
 * `logs` for `logs.alert.document.count` and `infrastructure` for
 * `metrics.alert.threshold`. The rule links must therefore appear for the rule
 * the user can read and stay hidden for the one it cannot.
 *
 * Elasticsearch privileges are intentionally empty: alerts-as-data reads go
 * through Kibana's internal user + RAC, so the gating is driven purely by the
 * Kibana feature privileges under test.
 */
export const ALERTS_WITH_LOGS_RULES_ROLE: KibanaRole = {
  elasticsearch: { cluster: [], indices: [] },
  kibana: [
    {
      base: [],
      feature: { observabilityAlerts: ['read'], logs: ['read'] },
      spaces: ['*'],
    },
  ],
};

/**
 * Same as `ALERTS_WITH_LOGS_RULES_ROLE` but additionally grants full
 * observability cases access. Used to assert that the alert details "Add to
 * case" button is shown only when the user has cases privileges.
 */
export const ALERTS_WITH_LOGS_RULES_AND_CASES_ROLE: KibanaRole = {
  elasticsearch: { cluster: [], indices: [] },
  kibana: [
    {
      base: [],
      feature: {
        observabilityAlerts: ['read'],
        logs: ['read'],
        observabilityCasesV3: ['all'],
      },
      spaces: ['*'],
    },
  ],
};

export const ALERTS_WITH_METRICS_RULES_ROLE: KibanaRole = {
  elasticsearch: { cluster: [], indices: [] },
  kibana: [
    {
      base: [],
      feature: { observabilityAlerts: ['read'], infrastructure: ['read'] },
      spaces: ['*'],
    },
  ],
};

/**
 * `observabilityAlerts: ['read']` only — authorizes alert read for every
 * observability rule type but grants no rule read. This persona can view the
 * alerts table but must not see any rule management affordances (Manage rules
 * button, rule stats) or per-alert rule links.
 */
export const ALERTS_ONLY_ROLE: KibanaRole = {
  elasticsearch: { cluster: [], indices: [] },
  kibana: [
    {
      base: [],
      feature: { observabilityAlerts: ['read'] },
      spaces: ['*'],
    },
  ],
};
