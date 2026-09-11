/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { BadRequestError } from '@kbn/securitysolution-es-utils';
import { stringifyZodError } from '@kbn/zod-helpers/v4';
import { addEcsToRequiredFields } from '../../../../../../../common/detection_engine/rule_management/utils';
import type {
  EqlRule,
  EqlRuleResponseFields,
  EsqlRule,
  EsqlRuleResponseFields,
  MachineLearningRule,
  MachineLearningRuleResponseFields,
  NewTermsRule,
  NewTermsRuleResponseFields,
  QueryRule,
  QueryRuleResponseFields,
  RuleResponse,
  SavedQueryRule,
  SavedQueryRuleResponseFields,
  ThreatMatchRule,
  ThreatMatchRuleResponseFields,
  ThresholdRule,
  ThresholdRuleResponseFields,
  TypeSpecificResponse,
} from '../../../../../../../common/api/detection_engine/model/rule_schema';
import {
  EqlRulePatchFields,
  EsqlRulePatchFields,
  MachineLearningRulePatchFields,
  NewTermsRulePatchFields,
  QueryRulePatchFields,
  SavedQueryRulePatchFields,
  ThreatMatchRulePatchFields,
  ThresholdRulePatchFields,
} from '../../../../../../../common/api/detection_engine/model/rule_schema';
import type { PatchRuleRequestBody } from '../../../../../../../common/api/detection_engine/rule_management';
import {
  normalizeMachineLearningJobIds,
  normalizeThresholdObject,
} from '../../../../../../../common/detection_engine/utils';
import { validateRuleSchedule } from '../../../../../../../common/utils/request_validation/rule_schedule';
import { assertUnreachable } from '../../../../../../../common/utility_types';
import type { IPrebuiltRuleAssetsClient } from '../../../../prebuilt_rules/logic/rule_assets/prebuilt_rule_assets_client';
import { calculateRuleSource } from './rule_source/calculate_rule_source';

interface ApplyRulePatchProps {
  prebuiltRuleAssetClient: IPrebuiltRuleAssetsClient;
  existingRule: RuleResponse;
  rulePatch: PatchRuleRequestBody;
}

// eslint-disable-next-line complexity
export const applyRulePatch = async ({
  rulePatch,
  existingRule,
  prebuiltRuleAssetClient,
}: ApplyRulePatchProps): Promise<RuleResponse> => {
  const typeSpecificParams = patchTypeSpecificParams(rulePatch, existingRule);

  const nextRule: RuleResponse = {
    // Keep existing values for these fields
    id: existingRule.id,
    rule_id: existingRule.rule_id,
    revision: existingRule.revision,
    immutable: existingRule.immutable,
    rule_source: existingRule.rule_source,
    updated_at: existingRule.updated_at,
    updated_by: existingRule.updated_by,
    created_at: existingRule.created_at,
    created_by: existingRule.created_by,

    // Update values for these fields
    enabled: rulePatch.enabled ?? existingRule.enabled,
    name: rulePatch.name ?? existingRule.name,
    tags: rulePatch.tags ?? existingRule.tags,
    author: rulePatch.author ?? existingRule.author,
    building_block_type: rulePatch.building_block_type ?? existingRule.building_block_type,
    description: rulePatch.description ?? existingRule.description,
    false_positives: rulePatch.false_positives ?? existingRule.false_positives,
    investigation_fields: rulePatch.investigation_fields ?? existingRule.investigation_fields,
    from: rulePatch.from ?? existingRule.from,
    license: rulePatch.license ?? existingRule.license,
    output_index: rulePatch.output_index ?? existingRule.output_index,
    alias_purpose: rulePatch.alias_purpose ?? existingRule.alias_purpose,
    alias_target_id: rulePatch.alias_target_id ?? existingRule.alias_target_id,
    timeline_id: rulePatch.timeline_id ?? existingRule.timeline_id,
    timeline_title: rulePatch.timeline_title ?? existingRule.timeline_title,
    meta: rulePatch.meta ?? existingRule.meta,
    max_signals: rulePatch.max_signals ?? existingRule.max_signals,
    related_integrations: rulePatch.related_integrations ?? existingRule.related_integrations,
    required_fields: rulePatch.required_fields
      ? addEcsToRequiredFields(rulePatch.required_fields)
      : existingRule.required_fields,
    risk_score: rulePatch.risk_score ?? existingRule.risk_score,
    risk_score_mapping: rulePatch.risk_score_mapping ?? existingRule.risk_score_mapping,
    rule_name_override: rulePatch.rule_name_override ?? existingRule.rule_name_override,
    setup: rulePatch.setup ?? existingRule.setup,
    severity: rulePatch.severity ?? existingRule.severity,
    severity_mapping: rulePatch.severity_mapping ?? existingRule.severity_mapping,
    threat: rulePatch.threat ?? existingRule.threat,
    timestamp_override: rulePatch.timestamp_override ?? existingRule.timestamp_override,
    timestamp_override_fallback_disabled:
      rulePatch.timestamp_override_fallback_disabled ??
      existingRule.timestamp_override_fallback_disabled,
    to: rulePatch.to ?? existingRule.to,
    references: rulePatch.references ?? existingRule.references,
    namespace: rulePatch.namespace ?? existingRule.namespace,
    note: rulePatch.note ?? existingRule.note,
    version: rulePatch.version ?? existingRule.version,
    exceptions_list: rulePatch.exceptions_list ?? existingRule.exceptions_list,
    interval: rulePatch.interval ?? existingRule.interval,
    throttle: rulePatch.throttle ?? existingRule.throttle,
    actions: rulePatch.actions ?? existingRule.actions,
    response_actions: rulePatch.response_actions ?? existingRule.response_actions,
    ...typeSpecificParams,
  };

  const [scheduleError] = validateRuleSchedule(nextRule);
  if (scheduleError != null) {
    throw new BadRequestError(scheduleError);
  }

  nextRule.rule_source = await calculateRuleSource({
    nextRule,
    currentRule: existingRule,
    prebuiltRuleAssetClient,
  });

  return nextRule;
};

const patchEqlParams = (
  rulePatch: EqlRulePatchFields,
  existingRule: EqlRule
): EqlRuleResponseFields => {
  return {
    type: existingRule.type,
    language: rulePatch.language ?? existingRule.language,
    index: rulePatch.index ?? existingRule.index,
    data_view_id: rulePatch.data_view_id ?? existingRule.data_view_id,
    query: rulePatch.query ?? existingRule.query,
    filters: rulePatch.filters ?? existingRule.filters,
    timestamp_field: rulePatch.timestamp_field ?? existingRule.timestamp_field,
    event_category_override:
      rulePatch.event_category_override ?? existingRule.event_category_override,
    tiebreaker_field: rulePatch.tiebreaker_field ?? existingRule.tiebreaker_field,
    alert_suppression: rulePatch.alert_suppression ?? existingRule.alert_suppression,
  };
};

const patchEsqlParams = (
  rulePatch: EsqlRulePatchFields,
  existingRule: EsqlRule
): EsqlRuleResponseFields => {
  return {
    type: existingRule.type,
    language: rulePatch.language ?? existingRule.language,
    query: rulePatch.query ?? existingRule.query,
    alert_suppression: rulePatch.alert_suppression ?? existingRule.alert_suppression,
  };
};

const patchThreatMatchParams = (
  rulePatch: ThreatMatchRulePatchFields,
  existingRule: ThreatMatchRule
): ThreatMatchRuleResponseFields => {
  return {
    type: existingRule.type,
    language: rulePatch.language ?? existingRule.language,
    index: rulePatch.index ?? existingRule.index,
    data_view_id: rulePatch.data_view_id ?? existingRule.data_view_id,
    query: rulePatch.query ?? existingRule.query,
    filters: rulePatch.filters ?? existingRule.filters,
    saved_id: rulePatch.saved_id ?? existingRule.saved_id,
    threat_filters: rulePatch.threat_filters ?? existingRule.threat_filters,
    threat_query: rulePatch.threat_query ?? existingRule.threat_query,
    threat_mapping: rulePatch.threat_mapping ?? existingRule.threat_mapping,
    threat_language: rulePatch.threat_language ?? existingRule.threat_language,
    threat_index: rulePatch.threat_index ?? existingRule.threat_index,
    threat_indicator_path: rulePatch.threat_indicator_path ?? existingRule.threat_indicator_path,
    concurrent_searches: rulePatch.concurrent_searches ?? existingRule.concurrent_searches,
    items_per_search: rulePatch.items_per_search ?? existingRule.items_per_search,
    alert_suppression: rulePatch.alert_suppression ?? existingRule.alert_suppression,
  };
};

const patchQueryParams = (
  rulePatch: QueryRulePatchFields,
  existingRule: QueryRule
): QueryRuleResponseFields => {
  return {
    type: existingRule.type,
    language: rulePatch.language ?? existingRule.language,
    index: rulePatch.index ?? existingRule.index,
    data_view_id: rulePatch.data_view_id ?? existingRule.data_view_id,
    query: rulePatch.query ?? existingRule.query,
    filters: rulePatch.filters ?? existingRule.filters,
    saved_id: rulePatch.saved_id ?? existingRule.saved_id,
    alert_suppression: rulePatch.alert_suppression ?? existingRule.alert_suppression,
  };
};

const patchSavedQueryParams = (
  rulePatch: SavedQueryRulePatchFields,
  existingRule: SavedQueryRule
): SavedQueryRuleResponseFields => {
  return {
    type: existingRule.type,
    language: rulePatch.language ?? existingRule.language,
    index: rulePatch.index ?? existingRule.index,
    data_view_id: rulePatch.data_view_id ?? existingRule.data_view_id,
    query: rulePatch.query ?? existingRule.query,
    filters: rulePatch.filters ?? existingRule.filters,
    saved_id: rulePatch.saved_id ?? existingRule.saved_id,
    alert_suppression: rulePatch.alert_suppression ?? existingRule.alert_suppression,
  };
};

const patchThresholdParams = (
  rulePatch: ThresholdRulePatchFields,
  existingRule: ThresholdRule
): ThresholdRuleResponseFields => {
  return {
    type: existingRule.type,
    language: rulePatch.language ?? existingRule.language,
    index: rulePatch.index ?? existingRule.index,
    data_view_id: rulePatch.data_view_id ?? existingRule.data_view_id,
    query: rulePatch.query ?? existingRule.query,
    filters: rulePatch.filters ?? existingRule.filters,
    saved_id: rulePatch.saved_id ?? existingRule.saved_id,
    threshold: rulePatch.threshold
      ? normalizeThresholdObject(rulePatch.threshold)
      : existingRule.threshold,
    alert_suppression: rulePatch.alert_suppression ?? existingRule.alert_suppression,
  };
};

const patchMachineLearningParams = (
  params: MachineLearningRulePatchFields,
  existingRule: MachineLearningRule
): MachineLearningRuleResponseFields => {
  return {
    type: existingRule.type,
    anomaly_threshold: params.anomaly_threshold ?? existingRule.anomaly_threshold,
    machine_learning_job_id: params.machine_learning_job_id
      ? normalizeMachineLearningJobIds(params.machine_learning_job_id)
      : existingRule.machine_learning_job_id,
    alert_suppression: params.alert_suppression ?? existingRule.alert_suppression,
  };
};

const patchNewTermsParams = (
  params: NewTermsRulePatchFields,
  existingRule: NewTermsRule
): NewTermsRuleResponseFields => {
  return {
    type: existingRule.type,
    language: params.language ?? existingRule.language,
    index: params.index ?? existingRule.index,
    data_view_id: params.data_view_id ?? existingRule.data_view_id,
    query: params.query ?? existingRule.query,
    filters: params.filters ?? existingRule.filters,
    new_terms_fields: params.new_terms_fields ?? existingRule.new_terms_fields,
    history_window_start: params.history_window_start ?? existingRule.history_window_start,
    alert_suppression: params.alert_suppression ?? existingRule.alert_suppression,
  };
};

export const patchTypeSpecificParams = (
  params: PatchRuleRequestBody,
  existingRule: RuleResponse
): TypeSpecificResponse => {
  // Here we do the validation of patch params by rule type to ensure that the fields that are
  // passed in to patch are of the correct type, e.g. `query` is a string. Since the combined patch schema
  // is a union of types where everything is optional, it's hard to do the validation before we know the rule type -
  // a patch request that defines `event_category_override` as a number would not be assignable to the EQL patch schema,
  // but would be assignable to the other rule types since they don't specify `event_category_override`.
  switch (existingRule.type) {
    case 'eql': {
      const result = EqlRulePatchFields.safeParse(params);
      if (!result.success) {
        throw new BadRequestError(stringifyZodError(result.error));
      }
      return patchEqlParams(result.data, existingRule);
    }
    case 'esql': {
      const result = EsqlRulePatchFields.safeParse(params);
      if (!result.success) {
        throw new BadRequestError(stringifyZodError(result.error));
      }
      return patchEsqlParams(result.data, existingRule);
    }
    case 'threat_match': {
      const result = ThreatMatchRulePatchFields.safeParse(params);
      if (!result.success) {
        throw new BadRequestError(stringifyZodError(result.error));
      }
      return patchThreatMatchParams(result.data, existingRule);
    }
    case 'query': {
      const result = QueryRulePatchFields.safeParse(params);
      if (!result.success) {
        throw new BadRequestError(stringifyZodError(result.error));
      }
      return patchQueryParams(result.data, existingRule);
    }
    case 'saved_query': {
      const result = SavedQueryRulePatchFields.safeParse(params);
      if (!result.success) {
        throw new BadRequestError(stringifyZodError(result.error));
      }
      return patchSavedQueryParams(result.data, existingRule);
    }
    case 'threshold': {
      const result = ThresholdRulePatchFields.safeParse(params);
      if (!result.success) {
        throw new BadRequestError(stringifyZodError(result.error));
      }
      return patchThresholdParams(result.data, existingRule);
    }
    case 'machine_learning': {
      const result = MachineLearningRulePatchFields.safeParse(params);
      if (!result.success) {
        throw new BadRequestError(stringifyZodError(result.error));
      }
      return patchMachineLearningParams(result.data, existingRule);
    }
    case 'new_terms': {
      const result = NewTermsRulePatchFields.safeParse(params);
      if (!result.success) {
        throw new BadRequestError(stringifyZodError(result.error));
      }
      return patchNewTermsParams(result.data, existingRule);
    }
    default: {
      return assertUnreachable(existingRule);
    }
  }
};
