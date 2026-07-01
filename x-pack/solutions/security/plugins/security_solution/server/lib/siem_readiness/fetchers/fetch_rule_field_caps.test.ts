/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core/server';
import type { IndexToRulesMap, RequiredField } from '@kbn/siem-readiness';
import { fetchRuleFieldCaps } from './fetch_rule_field_caps';

const makeRule = (id: string, name: string) => ({ id, name, tactics: [], enabled: true });

const makeRequiredField = (name: string, type = 'keyword'): RequiredField => ({
  name,
  type,
  ecs: true,
});

const makeEsClient = (fieldsByCall: Array<Record<string, unknown>>) => {
  let callCount = 0;
  return {
    fieldCaps: jest.fn().mockImplementation(() => {
      const fields = fieldsByCall[callCount] ?? {};
      callCount++;
      return Promise.resolve({ fields });
    }),
  } as unknown as ElasticsearchClient;
};

describe('fetchRuleFieldCaps', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('when all required fields are mapped', () => {
    it('returns an empty array', async () => {
      const indexToRules: IndexToRulesMap = new Map([
        ['logs-endpoint-000001', [makeRule('rule-1', 'Rule 1')]],
      ]);
      const ruleRequiredFields = new Map<string, RequiredField[]>([
        ['rule-1', [makeRequiredField('process.command_line')]],
      ]);

      const esClient = makeEsClient([{ 'process.command_line': { keyword: {} } }]);

      const result = await fetchRuleFieldCaps({ esClient, indexToRules, ruleRequiredFields });

      expect(result).toHaveLength(0);
      expect(esClient.fieldCaps).toHaveBeenCalledTimes(1);
    });
  });

  describe('when a required field is not mapped', () => {
    it('returns one entry with the missing field', async () => {
      const indexToRules: IndexToRulesMap = new Map([
        ['logs-endpoint-000001', [makeRule('rule-1', 'Rule 1')]],
      ]);
      const ruleRequiredFields = new Map<string, RequiredField[]>([
        [
          'rule-1',
          [makeRequiredField('process.command_line'), makeRequiredField('process.parent.name')],
        ],
      ]);

      // Only process.command_line is present; process.parent.name is absent
      const esClient = makeEsClient([{ 'process.command_line': { keyword: {} } }]);

      const result = await fetchRuleFieldCaps({ esClient, indexToRules, ruleRequiredFields });

      expect(result).toHaveLength(1);
      expect(result[0].ruleId).toBe('rule-1');
      expect(result[0].ruleName).toBe('Rule 1');
      expect(result[0].missingFields).toEqual(['process.parent.name']);
    });
  });

  describe('deduplication — rules sharing the same (indexPattern, fieldSet)', () => {
    it('makes ONE fieldCaps call for two rules with identical indices and required fields', async () => {
      const indexToRules: IndexToRulesMap = new Map([
        ['logs-endpoint-000001', [makeRule('rule-1', 'Rule 1'), makeRule('rule-2', 'Rule 2')]],
      ]);
      const ruleRequiredFields = new Map<string, RequiredField[]>([
        ['rule-1', [makeRequiredField('process.command_line'), makeRequiredField('user.name')]],
        ['rule-2', [makeRequiredField('process.command_line'), makeRequiredField('user.name')]],
      ]);

      const esClient = makeEsClient([
        { 'process.command_line': { keyword: {} }, 'user.name': { keyword: {} } },
      ]);

      const result = await fetchRuleFieldCaps({ esClient, indexToRules, ruleRequiredFields });

      // Both rules share the same group → only 1 fieldCaps call
      expect(esClient.fieldCaps).toHaveBeenCalledTimes(1);
      // Neither rule has missing fields
      expect(result).toHaveLength(0);
    });

    it('makes TWO fieldCaps calls for rules with different field sets', async () => {
      const indexToRules: IndexToRulesMap = new Map([
        ['logs-endpoint-000001', [makeRule('rule-1', 'Rule 1'), makeRule('rule-2', 'Rule 2')]],
      ]);
      const ruleRequiredFields = new Map<string, RequiredField[]>([
        ['rule-1', [makeRequiredField('process.command_line')]],
        ['rule-2', [makeRequiredField('process.parent.name')]],
      ]);

      // Both calls return all fields present
      const esClient = makeEsClient([
        { 'process.command_line': { keyword: {} } },
        { 'process.parent.name': { keyword: {} } },
      ]);

      const result = await fetchRuleFieldCaps({ esClient, indexToRules, ruleRequiredFields });

      expect(esClient.fieldCaps).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(0);
    });
  });

  describe('rules with empty required_fields', () => {
    it('skips rules with no required_fields — no fieldCaps call is made', async () => {
      const indexToRules: IndexToRulesMap = new Map([
        ['logs-endpoint-000001', [makeRule('rule-1', 'Rule 1')]],
      ]);
      const ruleRequiredFields = new Map<string, RequiredField[]>([
        ['rule-1', []], // empty — should be skipped
      ]);

      const esClient = makeEsClient([]);

      const result = await fetchRuleFieldCaps({ esClient, indexToRules, ruleRequiredFields });

      expect(esClient.fieldCaps).not.toHaveBeenCalled();
      expect(result).toHaveLength(0);
    });
  });

  describe('rules not present in indexToRules', () => {
    it('skips rules with no resolved indices', async () => {
      const indexToRules: IndexToRulesMap = new Map(); // empty — no index → rule mapping
      const ruleRequiredFields = new Map<string, RequiredField[]>([
        ['rule-1', [makeRequiredField('process.command_line')]],
      ]);

      const esClient = makeEsClient([]);

      const result = await fetchRuleFieldCaps({ esClient, indexToRules, ruleRequiredFields });

      expect(esClient.fieldCaps).not.toHaveBeenCalled();
      expect(result).toHaveLength(0);
    });
  });

  describe('fieldCaps call failure', () => {
    it('skips the failing group and continues processing others', async () => {
      const indexToRules: IndexToRulesMap = new Map([
        ['logs-endpoint-000001', [makeRule('rule-1', 'Rule 1')]],
        ['logs-aws-000001', [makeRule('rule-2', 'Rule 2')]],
      ]);
      const ruleRequiredFields = new Map<string, RequiredField[]>([
        ['rule-1', [makeRequiredField('process.command_line')]],
        ['rule-2', [makeRequiredField('aws.cloudtrail.event_name')]],
      ]);

      const esClient = {
        fieldCaps: jest
          .fn()
          // First call (rule-1 group) throws
          .mockRejectedValueOnce(new Error('index_not_found_exception'))
          // Second call (rule-2 group) succeeds with the field present
          .mockResolvedValueOnce({ fields: { 'aws.cloudtrail.event_name': { keyword: {} } } }),
      } as unknown as ElasticsearchClient;

      const result = await fetchRuleFieldCaps({ esClient, indexToRules, ruleRequiredFields });

      // rule-1 group failed → skipped; rule-2 has all fields → no missing fields
      expect(result).toHaveLength(0);
    });
  });
});
