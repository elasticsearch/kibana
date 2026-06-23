/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { OriginalRule } from '../model/rule_migration.gen';
import {
  convertMigrationCustomRuleToSecurityRulePayload,
  getTranslationFieldsFromAnnotations,
  type MigrationCustomRule,
} from './utils';

const customRule: MigrationCustomRule = {
  title: 'Translated Sentinel rule',
  description: 'Translated rule description',
  query: 'FROM logs-*',
  query_language: 'esql',
  severity: 'medium',
  risk_score: 47,
};

const originalRule: OriginalRule = {
  id: 'sentinel-rule-id',
  vendor: 'microsoft-sentinel',
  title: 'Sentinel rule',
  description: 'Sentinel rule description',
  query: 'SecurityEvent | where EventID == 1102',
  query_language: 'kql',
};

describe('convertMigrationCustomRuleToSecurityRulePayload', () => {
  it('uses the default translation schedule when no overrides are provided', () => {
    expect(convertMigrationCustomRuleToSecurityRulePayload(customRule, false)).toMatchObject({
      from: 'now-360s',
      to: 'now',
      interval: '5m',
    });
  });

  it('uses translation fields when provided', () => {
    expect(
      convertMigrationCustomRuleToSecurityRulePayload(customRule, false, {
        from: 'now-60s',
        to: 'now',
        interval: '60s',
      })
    ).toMatchObject({
      from: 'now-60s',
      to: 'now',
      interval: '60s',
    });
  });
});

describe('getTranslationFieldsFromAnnotations', () => {
  it('uses timing overrides from original rule annotations', () => {
    expect(
      getTranslationFieldsFromAnnotations({
        ...originalRule,
        annotations: {
          from: 'now-1h',
          to: 'now',
          interval: '20m',
          timestamp_override: 'event.ingested',
          ignored_annotation: 'do not copy',
        },
      })
    ).toEqual({
      from: 'now-1h',
      to: 'now',
      interval: '20m',
    });
  });

  it('uses shared defaults when timing annotations are missing', () => {
    expect(
      getTranslationFieldsFromAnnotations({
        ...originalRule,
        annotations: undefined,
      })
    ).toEqual({
      from: 'now-360s',
      to: 'now',
      interval: '5m',
    });
  });
});
