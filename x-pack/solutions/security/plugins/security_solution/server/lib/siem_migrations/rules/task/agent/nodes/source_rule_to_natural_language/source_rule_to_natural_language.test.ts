/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getSourceRuleToNaturalLanguageNode } from './source_rule_to_natural_language';
import type { MigrateRuleConfig, MigrateRuleState } from '../../types';

jest.mock('../../../../../common/task/util/has_unsupported_function', () => ({
  hasUnsupportedFunctions: jest.fn(),
  UNSUPPORTED_FUNCTIONS: ['UnsupportedFunc_A', 'UnsupportedFunc_B'],
}));

const { hasUnsupportedFunctions } = jest.requireMock(
  '../../../../../common/task/util/has_unsupported_function'
) as { hasUnsupportedFunctions: jest.Mock };

const mockQRadarState = {
  original_rule: {
    title: 'Test Rule',
    description: 'Test description',
    query: 'SELECT * FROM events',
    vendor: 'qradar',
  },
  messages: [],
  resources: { lookup: [] },
} as unknown as MigrateRuleState;

const mockSentinelState = {
  original_rule: {
    title: 'Sentinel Test Rule',
    description: 'Detect suspicious sign-ins',
    query: 'SigninLogs | where ResultType != 0',
    vendor: 'microsoft-sentinel',
  },
  messages: [],
  resources: { lookup: [] },
} as unknown as MigrateRuleState;

const mockConfig = {} as MigrateRuleConfig;

describe('getSourceRuleToNaturalLanguageNode', () => {
  const mockInvoke = jest.fn();
  const node = getSourceRuleToNaturalLanguageNode({ model: { invoke: mockInvoke } as never });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('QRadar vendor', () => {
    it('should short-circuit when hasUnsupportedFunctions returns true', async () => {
      hasUnsupportedFunctions.mockReturnValue(true);

      const result = await node(mockQRadarState, mockConfig);

      expect(result.nl_query).toBeUndefined();
      expect(result.comments).toHaveLength(1);
      expect(result.comments![0].message).toContain('unsupported functions');
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it('should invoke the model when hasUnsupportedFunctions returns false', async () => {
      hasUnsupportedFunctions.mockReturnValue(false);
      mockInvoke.mockResolvedValue({ text: 'Translated NL query', tool_calls: undefined });

      const result = await node(mockQRadarState, mockConfig);

      expect(mockInvoke).toHaveBeenCalled();
      expect(result.nl_query).toBe('Translated NL query');
      expect(result.messages).toHaveLength(1);
      expect(result.comments).toHaveLength(1);
    });

    it('should return tool calls when model produces them', async () => {
      hasUnsupportedFunctions.mockReturnValue(false);
      mockInvoke.mockResolvedValue({
        text: '',
        tool_calls: [{ name: 'getRulesByName', args: { name: 'BB: Test' } }],
      });

      const result = await node(mockQRadarState, mockConfig);

      expect(result.messages).toHaveLength(1);
      expect(result.comments).toEqual([]);
      expect(result.nl_query).toBeUndefined();
    });
  });

  describe('Microsoft Sentinel vendor', () => {
    it('should invoke the model with Sentinel prompt and return nl_query', async () => {
      mockInvoke.mockResolvedValue({
        text: '#### Data Sources\n- Azure\n\n#### Detection Logic\n1. Filter sign-in failures',
      });

      const result = await node(mockSentinelState, mockConfig);

      expect(mockInvoke).toHaveBeenCalled();
      expect(result.nl_query).toContain('Data Sources');
      expect(result.nl_query).toContain('Azure');
      expect(result.comments).toHaveLength(1);
      expect(result.messages).toHaveLength(1);
    });

    it('should check for unsupported functions same as other vendors', async () => {
      mockInvoke.mockResolvedValue({ text: 'NL description' });

      await node(mockSentinelState, mockConfig);

      expect(hasUnsupportedFunctions).toHaveBeenCalled();
    });
  });
});
