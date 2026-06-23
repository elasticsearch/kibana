/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Threat } from '../../../../../../common/api/detection_engine';
import type { OriginalRule } from '../../../../../../common/siem_migrations/model/rule_migration.gen';
import type { SentinelRule } from '../../../../../../common/siem_migrations/parsers/sentinel/types';
import type { MigrationTranslationFields } from '../../../../../../common/siem_migrations/rules/utils';
import {
  TACTICS_BASE_URL,
  TECHNIQUES_BASE_URL,
  SENTINEL_TACTIC_NAME_TO_ID,
  SENTINEL_TACTIC_NAME_TO_DISPLAY,
  ISO_8601_DURATION_PATTERN,
  SENTINEL_RULE_KIND_ANNOTATION_KEY,
  SENTINEL_NRT_RULE_KIND,
  SENTINEL_DEFAULT_QUERY_FREQUENCY,
} from './constants';

/**
 * Transforms Sentinel tactic and technique arrays (as exported in ARM templates)
 * into the Elastic Threat format used by detection rules.
 *
 * Sentinel exports tactic names like "InitialAccess" and technique IDs like "T1078".
 *
 * Note: Sentinel ARM templates export tactics and techniques as separate flat arrays
 * with no correlation between them. When only one tactic is present, all techniques
 * are associated with it (unambiguous). When multiple tactics are present, techniques
 * are omitted from individual tactic entries to avoid creating false tactic-technique
 * associations (e.g., claiming T1078 applies to Execution when it does not).
 */
export function transformSentinelMitreMapping(
  tactics: string[] | undefined,
  techniques: string[] | undefined
): Threat[] {
  if (!tactics || tactics.length === 0) {
    return [];
  }

  const validTactics = tactics.filter((name) => SENTINEL_TACTIC_NAME_TO_ID[name]);

  // Only associate techniques when there is a single tactic (mapping is unambiguous)
  const ruleTechniques =
    validTactics.length === 1
      ? (techniques ?? []).map((techniqueId) => ({
          id: techniqueId,
          reference: `${TECHNIQUES_BASE_URL}${techniqueId}/`,
          name: techniqueId,
        }))
      : [];

  return validTactics.map((tacticName) => {
    const tacticId = SENTINEL_TACTIC_NAME_TO_ID[tacticName];
    const tacticDisplayName = SENTINEL_TACTIC_NAME_TO_DISPLAY[tacticName] ?? tacticName;

    return {
      framework: 'MITRE ATT&CK',
      tactic: {
        id: tacticId,
        reference: `${TACTICS_BASE_URL}${tacticId}/`,
        name: tacticDisplayName,
      },
      technique: ruleTechniques,
    };
  });
}

function convertIsoDurationToDateMath(isoString: string): string | undefined {
  const match = isoString.match(ISO_8601_DURATION_PATTERN);
  if (!match?.groups) {
    return undefined;
  }

  const years = Number(match.groups.years ?? 0);
  const months = Number(match.groups.months ?? 0);
  const days = Number(match.groups.days ?? 0);
  const hours = Number(match.groups.hours ?? 0);
  const minutes = Number(match.groups.minutes ?? 0);
  const seconds = Number(match.groups.seconds ?? 0);

  const dateUnits = [
    { value: years, suffix: 'y' },
    { value: months, suffix: 'M' },
    { value: days, suffix: 'd' },
  ].filter(({ value }) => value > 0);
  const totalTimeSeconds = hours * 60 * 60 + minutes * 60 + seconds;

  if (dateUnits.length > 1 || (dateUnits.length === 1 && totalTimeSeconds > 0)) {
    return undefined;
  }

  if (dateUnits.length === 1) {
    const [dateUnit] = dateUnits;
    return `${dateUnit.value}${dateUnit.suffix}`;
  }

  if (seconds > 0) {
    return `${totalTimeSeconds}s`;
  }
  if (minutes > 0) {
    return `${hours * 60 + minutes}m`;
  }
  if (hours > 0) {
    return `${hours}h`;
  }

  return undefined;
}

const isNonEmptyString = (value: string | undefined): value is string =>
  value != null && value !== '';

const transformQueryPeriodToTimeRange = (
  queryPeriodIso: string
): Pick<MigrationTranslationFields, 'from' | 'to'> | undefined => {
  const period = convertIsoDurationToDateMath(queryPeriodIso);
  if (!period) {
    return undefined;
  }

  return {
    from: `now-${period}`,
    to: 'now',
  };
};

const transformQueryFrequencyToInterval = (
  queryFrequencyIso: string
): Pick<MigrationTranslationFields, 'interval'> | undefined => {
  const interval = convertIsoDurationToDateMath(queryFrequencyIso);

  return interval ? { interval } : undefined;
};

const getSentinelIntervalAnnotation = (
  rule: SentinelRule
): Pick<MigrationTranslationFields, 'interval'> | undefined => {
  if (isNonEmptyString(rule.queryFrequency)) {
    return transformQueryFrequencyToInterval(rule.queryFrequency);
  }

  return rule.kind === SENTINEL_NRT_RULE_KIND
    ? { interval: SENTINEL_DEFAULT_QUERY_FREQUENCY }
    : undefined;
};

/**
 * Transforms a parsed Sentinel rule into the OriginalRule format
 * used by the SIEM migrations pipeline.
 */
export function transformSentinelRuleToOriginalRule(rule: SentinelRule): OriginalRule {
  const threat = transformSentinelMitreMapping(rule.tactics, rule.techniques);

  const originalRule: OriginalRule = {
    id: rule.id,
    vendor: 'microsoft-sentinel',
    title: rule.displayName,
    description: rule.description,
    query: rule.query,
    query_language: 'kql',
    severity: rule.severity.toLowerCase(),
    annotations: {
      [SENTINEL_RULE_KIND_ANNOTATION_KEY]: rule.kind,
      ...(isNonEmptyString(rule.queryPeriod)
        ? transformQueryPeriodToTimeRange(rule.queryPeriod)
        : {}),
      ...getSentinelIntervalAnnotation(rule),
    },
  };

  if (threat.length > 0) {
    originalRule.threat = threat;
  }

  return originalRule;
}
