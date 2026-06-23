/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Severity } from '../../api/detection_engine';
import { DEFAULT_TRANSLATION_FIELDS } from '../constants';
import type { ElasticRule, ElasticRulePartial, OriginalRule } from '../model/rule_migration.gen';

export interface MigrationTranslationFields {
  from: string;
  to: string;
  interval: string;
}

export type MigrationPrebuiltRule = ElasticRulePartial &
  Required<
    Pick<
      ElasticRulePartial,
      'title' | 'description' | 'prebuilt_rule_id' | 'severity' | 'risk_score'
    >
  >;

export type MigrationCustomRule = ElasticRulePartial &
  Required<
    Pick<
      ElasticRulePartial,
      'title' | 'description' | 'query' | 'query_language' | 'severity' | 'risk_score'
    >
  >;

export const isMigrationPrebuiltRule = (rule?: ElasticRule): rule is MigrationPrebuiltRule =>
  !!(rule?.title && rule?.description && rule?.prebuilt_rule_id);

export const isMigrationCustomRule = (rule?: ElasticRule): rule is MigrationCustomRule =>
  !isMigrationPrebuiltRule(rule) &&
  !!(rule?.title && rule?.description && rule?.query && rule?.query_language);

export const getTranslationFieldsFromAnnotations = (
  originalRule: OriginalRule
): MigrationTranslationFields => {
  const { annotations } = originalRule;

  return {
    from:
      typeof annotations?.from === 'string' ? annotations.from : DEFAULT_TRANSLATION_FIELDS.from,
    to: typeof annotations?.to === 'string' ? annotations.to : DEFAULT_TRANSLATION_FIELDS.to,
    interval:
      typeof annotations?.interval === 'string'
        ? annotations.interval
        : DEFAULT_TRANSLATION_FIELDS.interval,
  };
};

export const convertMigrationCustomRuleToSecurityRulePayload = (
  rule: MigrationCustomRule,
  enabled: boolean,
  translationFields?: MigrationTranslationFields
) => {
  return {
    type: rule.query_language,
    language: rule.query_language,
    query: rule.query,
    name: rule.title,
    description: rule.description,
    enabled,
    severity: rule.severity as Severity,
    risk_score: rule.risk_score,
    threat: rule.threat ?? [],
    ...DEFAULT_TRANSLATION_FIELDS,
    ...(translationFields != null ? translationFields : {}),
  };
};
