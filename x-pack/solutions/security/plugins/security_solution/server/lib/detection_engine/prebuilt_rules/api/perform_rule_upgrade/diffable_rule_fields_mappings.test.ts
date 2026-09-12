/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { PrebuiltRuleAsset } from '../../model/rule_assets/prebuilt_rule_asset';
import {
  transformDiffableFieldValues,
  mapDiffableRuleFieldValueToRuleSchemaFormat,
} from './diffable_rule_fields_mappings';

// 'query' / 'language' / 'filters' / 'saved_id' are valid PrebuiltRuleAsset fields only for the
// query / saved_query rule type variants, so `keyof PrebuiltRuleAsset` (the intersection of keys
// across the whole discriminated union) does not include them directly.
const QUERY_FIELD_NAME = 'query' as keyof PrebuiltRuleAsset;
const LANGUAGE_FIELD_NAME = 'language' as keyof PrebuiltRuleAsset;
const FILTERS_FIELD_NAME = 'filters' as keyof PrebuiltRuleAsset;
const SAVED_ID_FIELD_NAME = 'saved_id' as keyof PrebuiltRuleAsset;

describe('transformDiffableFieldValues', () => {
  it('does NOT transform "from" in rule_schedule', () => {
    const result = transformDiffableFieldValues('from', {
      interval: '5m',
      from: 'now-10m',
      to: 'now',
    });

    expect(result).toEqual({ type: 'NON_TRANSFORMED_FIELD' });
  });

  it('does NOT transform "to" in rule_schedule', () => {
    const result = transformDiffableFieldValues('to', {
      interval: '5m',
      from: 'now-10m',
      to: 'now',
    });

    expect(result).toEqual({ type: 'NON_TRANSFORMED_FIELD' });
  });
});

describe('mapDiffableRuleFieldValueToRuleSchemaFormat', () => {
  describe('query / language / filters for a SavedKqlQuery merged value', () => {
    const savedKqlQuery = { type: 'saved_query', saved_query_id: 'my-saved-query-id' };

    it('resolves "query" to undefined instead of the whole kql_query object', () => {
      expect(
        mapDiffableRuleFieldValueToRuleSchemaFormat(QUERY_FIELD_NAME, savedKqlQuery)
      ).toBeUndefined();
    });

    it('resolves "language" to undefined instead of the whole kql_query object', () => {
      expect(
        mapDiffableRuleFieldValueToRuleSchemaFormat(LANGUAGE_FIELD_NAME, savedKqlQuery)
      ).toBeUndefined();
    });

    it('resolves "filters" to undefined instead of the whole kql_query object', () => {
      expect(
        mapDiffableRuleFieldValueToRuleSchemaFormat(FILTERS_FIELD_NAME, savedKqlQuery)
      ).toBeUndefined();
    });

    it('still resolves "saved_id" to the saved_query_id value', () => {
      expect(mapDiffableRuleFieldValueToRuleSchemaFormat(SAVED_ID_FIELD_NAME, savedKqlQuery)).toBe(
        'my-saved-query-id'
      );
    });
  });

  describe('query / language / filters for an InlineKqlQuery merged value', () => {
    const inlineKqlQuery = {
      type: 'inline_query',
      query: '*:*',
      language: 'kuery',
      filters: [{ query: { match_all: {} } }],
    };

    it('resolves "query" to the inline query string', () => {
      expect(mapDiffableRuleFieldValueToRuleSchemaFormat(QUERY_FIELD_NAME, inlineKqlQuery)).toBe(
        '*:*'
      );
    });

    it('resolves "language" to the inline query language', () => {
      expect(mapDiffableRuleFieldValueToRuleSchemaFormat(LANGUAGE_FIELD_NAME, inlineKqlQuery)).toBe(
        'kuery'
      );
    });

    it('resolves "filters" to the inline query filters array', () => {
      expect(
        mapDiffableRuleFieldValueToRuleSchemaFormat(FILTERS_FIELD_NAME, inlineKqlQuery)
      ).toEqual(inlineKqlQuery.filters);
    });
  });
});
