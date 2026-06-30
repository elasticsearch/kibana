/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  RuleResponse as V2RuleResponse,
  ExceptionListReference,
} from '@kbn/alerting-v2-schemas';
import { getBreachEsqlQuery } from '@kbn/alerting-v2-schemas';
import type { Rule } from '../../detection_engine/rule_management/logic/types';

export const V2_RULE_MARKER = '__isV2Rule__' as const;

export type V2AdaptedRule = Rule & {
  [V2_RULE_MARKER]: true;
  _v2Exceptions: ExceptionListReference[];
};

/**
 * Adapts a v2 RuleResponse to the shape expected by ExceptionsViewer and
 * related v1 exception components. Only the fields actually read by the
 * exception UI are populated; everything else is stubbed with safe defaults.
 *
 * Carries `_v2Exceptions` and a `__isV2Rule__` marker so the flyout hooks
 * can detect v2 rules and use the Lists API + v2 rule update instead of the
 * v1 `POST /rules/:id/exceptions` endpoint.
 */
export const toV1ExceptionRuleShape = (v2Rule: V2RuleResponse): V2AdaptedRule => {
  const v2Exceptions = v2Rule.exceptions ?? [];
  const exceptionsList = v2Exceptions.map((ref) => ({
    id: ref.id,
    list_id: ref.list_id,
    type: ref.type as Rule['exceptions_list'][number]['type'],
    namespace_type: ref.namespace_type as Rule['exceptions_list'][number]['namespace_type'],
  }));

  return {
    [V2_RULE_MARKER]: true,
    _v2Exceptions: v2Exceptions,
    id: v2Rule.id,
    name: v2Rule.metadata.name,
    description: v2Rule.metadata.description ?? '',
    enabled: v2Rule.enabled,
    type: 'esql',
    language: 'esql',
    query: getBreachEsqlQuery(v2Rule.query),
    severity: 'low',
    severity_mapping: [],
    risk_score: 0,
    risk_score_mapping: [],
    tags: v2Rule.metadata.tags ?? [],
    exceptions_list: exceptionsList,
    immutable: false,
    rule_source: { type: 'internal' as const },
    related_integrations: [],
    required_fields: [],
    references: v2Rule.params?.references ?? [],
    false_positives: [],
    threat: [],
    author: [],
    from: 'now-6m',
    to: 'now',
    interval: v2Rule.schedule.every,
    max_signals: 100,
    actions: [],
    throttle: undefined,
    version: 1,
    created_at: v2Rule.createdAt,
    created_by: v2Rule.createdBy ?? '',
    updated_at: v2Rule.updatedAt,
    updated_by: v2Rule.updatedBy ?? '',
    rule_id: v2Rule.id,
    revision: 0,
    outcome: undefined,
  } as unknown as V2AdaptedRule;
};

export const isV2AdaptedRule = (rule: Rule): rule is V2AdaptedRule =>
  V2_RULE_MARKER in rule && (rule as V2AdaptedRule)[V2_RULE_MARKER] === true;
