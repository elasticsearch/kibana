/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  convertObjectKeysToCamelCase,
  convertObjectKeysToSnakeCase,
} from '../../../../../../utils/object_case_converters';
import { addEcsToRequiredFields } from '../../../../../../../common/detection_engine/rule_management/utils';
import type {
  RuleCreateProps,
  RuleSource,
  TypeSpecificCreateProps,
} from '../../../../../../../common/api/detection_engine/model/rule_schema';
import { DEFAULT_RULE_SCHEDULE } from '../../../../../../../common/api/detection_engine/model/rule_schema/rule_schedule';
import {
  DEFAULT_INDICATOR_SOURCE_PATH,
  DEFAULT_MAX_SIGNALS,
} from '../../../../../../../common/constants';
import {
  normalizeMachineLearningJobIds,
  normalizeThresholdObject,
} from '../../../../../../../common/detection_engine/utils';
import { assertUnreachable } from '../../../../../../../common/utility_types';
import { normalizeRuleSource } from '../converters/normalize_rule_source';

export const RULE_DEFAULTS = {
  enabled: false,
  risk_score_mapping: [],
  severity_mapping: [],
  ...DEFAULT_RULE_SCHEDULE,
  exceptions_list: [],
  false_positives: [],
  max_signals: DEFAULT_MAX_SIGNALS,
  actions: [],
  related_integrations: [],
  required_fields: [],
  setup: '',
  references: [],
  threat: [],
  tags: [],
  author: [],
  output_index: '',
  version: 1,
};

export function applyRuleDefaults(
  rule: RuleCreateProps & { immutable?: boolean; rule_source?: RuleSource }
) {
  const typeSpecificParams = setTypeSpecificDefaults(rule);
  const immutable = rule.immutable ?? false;

  return {
    ...RULE_DEFAULTS,
    ...rule,
    ...typeSpecificParams,
    rule_id: rule.rule_id ?? uuidv4(),
    immutable,
    rule_source: convertObjectKeysToSnakeCase(
      normalizeRuleSource({
        immutable,
        ruleSource: rule.rule_source ? convertObjectKeysToCamelCase(rule.rule_source) : undefined,
      })
    ),
    required_fields: addEcsToRequiredFields(rule.required_fields),
  };
}

export const setTypeSpecificDefaults = (props: TypeSpecificCreateProps) => {
  switch (props.type) {
    case 'eql': {
      return {
        type: props.type,
        language: props.language,
        index: props.index,
        data_view_id: props.data_view_id,
        query: props.query,
        filters: props.filters,
        timestamp_field: props.timestamp_field,
        event_category_override: props.event_category_override,
        tiebreaker_field: props.tiebreaker_field,
        alert_suppression: props.alert_suppression,
      };
    }
    case 'esql': {
      return {
        type: props.type,
        language: props.language,
        query: props.query,
        alert_suppression: props.alert_suppression,
      };
    }
    case 'threat_match': {
      return {
        type: props.type,
        language: props.language ?? 'kuery',
        index: props.index,
        data_view_id: props.data_view_id,
        query: props.query,
        filters: props.filters,
        saved_id: props.saved_id,
        threat_filters: props.threat_filters,
        threat_query: props.threat_query,
        threat_mapping: props.threat_mapping,
        threat_language: props.threat_language,
        threat_index: props.threat_index,
        threat_indicator_path: props.threat_indicator_path ?? DEFAULT_INDICATOR_SOURCE_PATH,
        concurrent_searches: props.concurrent_searches,
        items_per_search: props.items_per_search,
        alert_suppression: props.alert_suppression,
      };
    }
    case 'query': {
      return {
        type: props.type,
        language: props.language ?? 'kuery',
        index: props.index,
        data_view_id: props.data_view_id,
        query: props.query ?? '',
        filters: props.filters,
        saved_id: props.saved_id,
        alert_suppression: props.alert_suppression,
      };
    }
    case 'saved_query': {
      return {
        type: props.type,
        language: props.language ?? 'kuery',
        index: props.index,
        query: props.query,
        filters: props.filters,
        saved_id: props.saved_id,
        data_view_id: props.data_view_id,
        alert_suppression: props.alert_suppression,
      };
    }
    case 'threshold': {
      return {
        type: props.type,
        language: props.language ?? 'kuery',
        index: props.index,
        data_view_id: props.data_view_id,
        query: props.query,
        filters: props.filters,
        saved_id: props.saved_id,
        threshold: normalizeThresholdObject(props.threshold),
        alert_suppression: props.alert_suppression?.duration
          ? { duration: props.alert_suppression.duration }
          : undefined,
      };
    }
    case 'machine_learning': {
      return {
        type: props.type,
        anomaly_threshold: props.anomaly_threshold,
        machine_learning_job_id: normalizeMachineLearningJobIds(props.machine_learning_job_id),
        alert_suppression: props.alert_suppression,
      };
    }
    case 'new_terms': {
      return {
        type: props.type,
        query: props.query,
        new_terms_fields: props.new_terms_fields,
        history_window_start: props.history_window_start,
        index: props.index,
        filters: props.filters,
        language: props.language ?? 'kuery',
        data_view_id: props.data_view_id,
        alert_suppression: props.alert_suppression,
      };
    }
    default: {
      return assertUnreachable(props);
    }
  }
};
