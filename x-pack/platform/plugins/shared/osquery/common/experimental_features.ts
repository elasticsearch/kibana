/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * A list of allowed values that can be used in `xpack.osquery.enableExperimental`.
 * This object is then used to validate and parse the value entered.
 */
export const allowedExperimentalValues = Object.freeze({
  /**
   * This feature flag hides all 9.4 UI changes:
   *   - Enables the copy/duplicate functionality for packs and saved queries,
   *     and the kebab row-action menus in list tables.
   *   - Renames "Live queries" tab to "History" and "Saved queries" to "Queries"
   *   - Introduces /history and /new routes, redirects legacy /live_queries paths
   *   - Introduces search input and users filter
   *   - Introduces scheduled responses support
   */
  queryHistoryRework: true,
  /**
   * Replaces the legacy EuiDataGrid results table with UnifiedDataTable,
   * adding KQL search, document flyout, per-row actions, and column curation.
   */
  unifiedDataTable: true,
  /**
   * Enables the "Export Results" button and server-side streaming export endpoints
   * for downloading osquery results as NDJSON, JSON, or CSV files.
   */
  exportResults: true,
  /**
   * Enables RFC 5545 RRULE-based recurrence scheduling for packs and pack queries
   * as an alternative to native interval-based scheduling. When enabled, the
   * pack form and pack query flyout expose a Schedule section, the API accepts
   * `schedule_type` / `interval` (pack-level) / `rrule_schedule` fields, and the
   * Fleet config fans the pack-level schedule onto each query that doesn't have
   * its own override. Requires osquerybeat with RRULE support.
   */
  rruleScheduling: false,
});

type ExperimentalFeatures = { [K in keyof typeof allowedExperimentalValues]: boolean };

type ExperimentalConfigKeys = Array<keyof ExperimentalFeatures>;
type Mutable<T> = { -readonly [P in keyof T]: T[P] };

const allowedKeys = Object.keys(allowedExperimentalValues) as Readonly<ExperimentalConfigKeys>;

const disableExperimentalPrefix = 'disable:' as const;

/**
 * Parses the string value used in `xpack.osquery.enableExperimental` kibana configuration,
 * which should be an array of strings corresponding to allowedExperimentalValues keys.
 * Use the `disable:` prefix to disable a feature.
 *
 * @param configValue
 */
export const parseExperimentalConfigValue = (
  configValue: string[]
): { features: ExperimentalFeatures; invalid: string[] } => {
  const enabledFeatures: Mutable<Partial<ExperimentalFeatures>> = {};
  const invalidKeys: string[] = [];

  for (let value of configValue) {
    const isDisabled = value.startsWith(disableExperimentalPrefix);

    if (isDisabled) {
      value = value.replace(disableExperimentalPrefix, '');
    }

    if (!allowedKeys.includes(value as keyof ExperimentalFeatures)) {
      invalidKeys.push(value);
    } else {
      enabledFeatures[value as keyof ExperimentalFeatures] = !isDisabled;
    }
  }

  return {
    features: {
      ...allowedExperimentalValues,
      ...enabledFeatures,
    },
    invalid: invalidKeys,
  };
};

export const getExperimentalAllowedValues = (): string[] => [...allowedKeys];

export type { ExperimentalFeatures };
