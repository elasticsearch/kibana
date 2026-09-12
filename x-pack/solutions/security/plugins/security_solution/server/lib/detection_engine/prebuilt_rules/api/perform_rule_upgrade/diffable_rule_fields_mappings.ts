/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { get, has } from 'lodash';
import type { RuleSchedule } from '../../../../../../common/api/detection_engine/model/rule_schema/rule_schedule';
import type {
  DataSourceIndexPatterns,
  DataSourceDataView,
  InlineKqlQuery,
  ThreeWayDiff,
  DiffableRuleTypes,
  AllThreeWayFieldsDiff,
} from '../../../../../../common/api/detection_engine';
import type { PrebuiltRuleAsset } from '../../model/rule_assets/prebuilt_rule_asset';

/**
 * Retrieves and transforms the value for a specific field from a DiffableRule group.
 *
 * Maps PrebuiltRuleAsset schema fields to their corresponding DiffableRule group values. It also
 * applies necessary transformations to ensure the returned value matches the expected format
 * for the PrebuiltRuleAsset schema.
 *
 * @param {keyof PrebuiltRuleAsset} field - The field name in the PrebuiltRuleAsset schema.
 * @param {ThreeWayDiff<unknown>['merged_version']} diffableField - The corresponding field value from the DiffableRule.
 *
 * @example
 * // For an 'index' field
 * mapDiffableRuleFieldValueToRuleSchema('index', { index_patterns: ['logs-*'] })
 * // Returns: ['logs-*']
 *
 */
export const mapDiffableRuleFieldValueToRuleSchemaFormat = (
  fieldName: keyof PrebuiltRuleAsset,
  diffableField: ThreeWayDiff<unknown>['merged_version']
) => {
  const diffableRuleSubfieldName = mapRuleFieldToDiffableRuleSubfield(fieldName);

  const transformedValue = transformDiffableFieldValues(fieldName, diffableField);
  if (transformedValue.type === 'TRANSFORMED_FIELD') {
    return transformedValue.value;
  }

  if (!SUBFIELD_MAPPING[fieldName] && !has(diffableField, diffableRuleSubfieldName)) {
    return diffableField;
  }

  // From the ThreeWayDiff, get the specific field that maps to the diffable rule field
  // Otherwise, the diffableField itself already matches the rule field, so retrieve that value.
  const mappedField = get(diffableField, diffableRuleSubfieldName);

  return mappedField;
};

interface MapRuleFieldToDiffableRuleFieldParams {
  ruleType: DiffableRuleTypes;
  fieldName: string;
}
/**
 * Maps a PrebuiltRuleAsset schema field name to its corresponding DiffableRule group.
 *
 * Determines which group in the DiffableRule schema a given field belongs to. Handles special
 * cases for query-related fields based on the rule type.
 *
 * @param {string} fieldName - The field name from the PrebuiltRuleAsset schema.
 * @param {string} ruleType - The type of the rule being processed.
 *
 * @example
 * mapRuleFieldToDiffableRuleField('index', 'query')
 * // Returns: 'data_source'
 *
 * @example
 * mapRuleFieldToDiffableRuleField('query', 'eql')
 * // Returns: 'eql_query'
 *
 */
export function mapRuleFieldToDiffableRuleField({
  ruleType,
  fieldName,
}: MapRuleFieldToDiffableRuleFieldParams): keyof AllThreeWayFieldsDiff {
  // Handle query, filters and language fields based on rule type
  if (fieldName === 'query' || fieldName === 'language' || fieldName === 'filters') {
    switch (ruleType) {
      case 'query':
      case 'saved_query':
        return 'kql_query' as const;
      case 'eql':
        return 'eql_query';
      case 'esql':
        return 'esql_query';
      default:
        return 'kql_query';
    }
  }

  const diffableRuleFieldMap: Record<string, keyof AllThreeWayFieldsDiff> = {
    building_block_type: 'building_block',
    saved_id: 'kql_query',
    event_category_override: 'eql_query',
    tiebreaker_field: 'eql_query',
    timestamp_field: 'eql_query',
    threat_query: 'threat_query',
    threat_language: 'threat_query',
    threat_filters: 'threat_query',
    index: 'data_source',
    data_view_id: 'data_source',
    rule_name_override: 'rule_name_override',
    interval: 'rule_schedule',
    from: 'rule_schedule',
    to: 'rule_schedule',
    timeline_id: 'timeline_template',
    timeline_title: 'timeline_template',
    timestamp_override: 'timestamp_override',
    timestamp_override_fallback_disabled: 'timestamp_override',
  };

  return diffableRuleFieldMap[fieldName] || fieldName;
}

const SUBFIELD_MAPPING: Record<string, string> = {
  index: 'index_patterns',
  data_view_id: 'data_view_id',
  saved_id: 'saved_query_id',
  // 'query' rules always produce an InlineKqlQuery for the 'kql_query' diffable group, so these
  // subfields are always present there. 'saved_query' rules referencing a saved search (no inline
  // override) produce a SavedKqlQuery instead, which has neither `query`, `language`, nor
  // `filters`. Without an explicit mapping here, the generic "diffableField IS the value"
  // fallback below would return the whole kql_query object (e.g. { type: 'saved_query',
  // saved_query_id }) as the PrebuiltRuleAsset's `query`/`language`/`filters` value, which fails
  // schema validation. Mapping them lets `get()` correctly resolve to `undefined` when the
  // subfield is absent, matching these fields' optional-for-saved_query semantics.
  query: 'query',
  language: 'language',
  filters: 'filters',
  event_category_override: 'event_category_override',
  tiebreaker_field: 'tiebreaker_field',
  timestamp_field: 'timestamp_field',
  threat_query: 'query',
  threat_language: 'language',
  threat_filters: 'filters',
  building_block_type: 'type',
  rule_name_override: 'field_name',
  timestamp_override: 'field_name',
  timestamp_override_fallback_disabled: 'fallback_disabled',
  timeline_id: 'timeline_id',
  timeline_title: 'timeline_title',
  interval: 'interval',
  from: 'from',
  to: 'to',
};

/**
 * Maps a PrebuiltRuleAsset schema field name to its corresponding property
 * name within a DiffableRule group.
 *
 * @param {string} fieldName - The field name from the PrebuiltRuleAsset schema.
 * @returns {string} The corresponding property name in the DiffableRule group.
 *
 * @example
 * mapRuleFieldToDiffableRuleSubfield('index')
 * // Returns: 'index_patterns'
 *
 */
export function mapRuleFieldToDiffableRuleSubfield(fieldName: string): string {
  return SUBFIELD_MAPPING[fieldName] || fieldName;
}

type TransformValuesReturnType =
  | {
      type: 'TRANSFORMED_FIELD';
      value: unknown;
    }
  | { type: 'NON_TRANSFORMED_FIELD' };

/**
 * Transforms specific field values from the DiffableRule format to the PrebuiltRuleAsset/RuleResponse format.
 *
 * This function is used in the rule upgrade process to ensure that certain fields
 * are correctly formatted when creating the updated rules payload. It handles
 * special cases where the format differs between the DiffableRule and the
 * PrebuiltRuleAsset/RuleResponse schemas.
 *
 * @param {string} fieldName - The name of the field being processed.
 * @param {RuleSchedule | InlineKqlQuery | unknown} diffableFieldValue - The value of the field in DiffableRule format.
 *
 * @returns {TransformValuesReturnType} An object indicating whether the field was transformed
 * and its new value if applicable.
 *   - If transformed: { type: 'TRANSFORMED_FIELD', value: transformedValue }
 *   - If not transformed: { type: 'NON_TRANSFORMED_FIELD' }
 *
 * @example
 * // Transforms 'saved_id' field for inline queries
 * transformDiffableFieldValues('saved_id', { type: 'inline_query', ... })
 * // Returns: { type: 'TRANSFORMED_FIELD', value: undefined }
 *
 */
export const transformDiffableFieldValues = (
  fieldName: string,
  diffableFieldValue: RuleSchedule | InlineKqlQuery | unknown
): TransformValuesReturnType => {
  if (fieldName === 'saved_id' && isInlineQuery(diffableFieldValue)) {
    // saved_id should be set only for rules with SavedKqlQuery, undefined otherwise
    return { type: 'TRANSFORMED_FIELD', value: undefined };
  } else if (fieldName === 'data_view_id' && isDataSourceIndexPatterns(diffableFieldValue)) {
    return { type: 'TRANSFORMED_FIELD', value: undefined };
  } else if (fieldName === 'index' && isDataSourceDataView(diffableFieldValue)) {
    return { type: 'TRANSFORMED_FIELD', value: undefined };
  }

  return { type: 'NON_TRANSFORMED_FIELD' };
};

function isInlineQuery(value: unknown): value is InlineKqlQuery {
  return (
    typeof value === 'object' && value !== null && 'type' in value && value.type === 'inline_query'
  );
}

function isDataSourceIndexPatterns(value: unknown): value is DataSourceIndexPatterns {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    value.type === 'index_patterns'
  );
}

function isDataSourceDataView(value: unknown): value is DataSourceDataView {
  return (
    typeof value === 'object' && value !== null && 'type' in value && value.type === 'data_view'
  );
}
