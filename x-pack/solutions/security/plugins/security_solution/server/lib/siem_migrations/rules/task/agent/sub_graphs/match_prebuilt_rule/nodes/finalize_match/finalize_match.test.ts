/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { getFinalizeMatchNode } from './finalize_match';
import {
  baseState,
  finalMessage,
  matchResult,
  mockOtherRule,
  mockRule,
  searchToolMessage,
  toolCallMessage,
} from '../__mocks__/mocks';

describe('getFinalizeMatchNode', () => {
  const mockReportPrebuiltRulesMatch = jest.fn();
  const telemetryClient = { reportPrebuiltRulesMatch: mockReportPrebuiltRulesMatch } as never;
  const node = getFinalizeMatchNode({ telemetryClient });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('resolves the match from search ToolMessage artifacts', async () => {
    const state = {
      ...baseState,
      match_prebuilt_rules_messages: [
        new SystemMessage('system'),
        new HumanMessage('human'),
        toolCallMessage('office macro child process'),
        searchToolMessage([mockRule]),
        finalMessage('Suspicious MS Office Child Process'),
      ],
      match_prebuilt_rules_result: matchResult('Suspicious MS Office Child Process'),
    };

    const result = await node(state);

    expect(result.elastic_rule?.prebuilt_rule_id).toBe('test-rule');
    expect(result.translation_result).toBe('full');
    expect(mockReportPrebuiltRulesMatch).toHaveBeenCalledWith({
      preFilterRules: [mockRule],
      postFilterRule: mockRule,
    });
  });

  it('uses the most recent search results when the model searched more than once', async () => {
    const state = {
      ...baseState,
      match_prebuilt_rules_messages: [
        new SystemMessage('system'),
        new HumanMessage('human'),
        toolCallMessage('office macro child process'),
        searchToolMessage([mockOtherRule]),
        toolCallMessage('office document macro execution sysmon'),
        searchToolMessage([mockRule]),
        finalMessage('Suspicious MS Office Child Process'),
      ],
      match_prebuilt_rules_result: matchResult('Suspicious MS Office Child Process'),
    };

    const result = await node(state);

    expect(result.elastic_rule?.prebuilt_rule_id).toBe('test-rule');
    expect(mockReportPrebuiltRulesMatch).toHaveBeenCalledWith({
      preFilterRules: [mockOtherRule, mockRule],
      postFilterRule: mockRule,
    });
  });

  it('resolves a match named from an earlier search after a later search returned different candidates', async () => {
    const state = {
      ...baseState,
      match_prebuilt_rules_messages: [
        new SystemMessage('system'),
        new HumanMessage('human'),
        toolCallMessage('office macro child process'),
        searchToolMessage([mockRule]),
        toolCallMessage('office document macro execution sysmon'),
        searchToolMessage([mockOtherRule]),
        finalMessage('Suspicious MS Office Child Process'),
      ],
      match_prebuilt_rules_result: matchResult('Suspicious MS Office Child Process'),
    };

    const result = await node(state);

    expect(result.elastic_rule?.prebuilt_rule_id).toBe('test-rule');
    expect(mockReportPrebuiltRulesMatch).toHaveBeenCalledWith({
      preFilterRules: [mockRule, mockOtherRule],
      postFilterRule: mockRule,
    });
  });

  it('returns a no-match summary with no elastic_rule when the model declines to match', async () => {
    const state = {
      ...baseState,
      match_prebuilt_rules_messages: [
        new SystemMessage('system'),
        new HumanMessage('human'),
        finalMessage(''),
      ],
      match_prebuilt_rules_result: matchResult(''),
    };

    const result = await node(state);

    expect(result.elastic_rule).toBeUndefined();
    expect(result.comments?.[0].message).toContain('foo');
    expect(mockReportPrebuiltRulesMatch).toHaveBeenCalledWith({ preFilterRules: [] });
  });

  it('falls back to the default no-match summary when there is no parsed match_prebuilt_rules_result', async () => {
    const state = {
      ...baseState,
      match_prebuilt_rules_messages: [
        new SystemMessage('system'),
        new HumanMessage('human'),
        toolCallMessage('office macro child process'),
        searchToolMessage([mockRule]),
        new AIMessage({ content: 'not json' }),
      ],
      match_prebuilt_rules_result: undefined,
    };

    const result = await node(state);

    expect(result.elastic_rule).toBeUndefined();
    expect(result.comments?.[0].message).toContain('No related prebuilt rule found');
  });

  it("returns a no-match summary when the model's matched name isn't in any search candidates", async () => {
    const state = {
      ...baseState,
      match_prebuilt_rules_messages: [
        new SystemMessage('system'),
        new HumanMessage('human'),
        toolCallMessage('office macro child process'),
        searchToolMessage([mockOtherRule]),
        finalMessage('Suspicious MS Office Child Process'),
      ],
      match_prebuilt_rules_result: matchResult('Suspicious MS Office Child Process'),
    };

    const result = await node(state);

    expect(result.elastic_rule).toBeUndefined();
    expect(mockReportPrebuiltRulesMatch).toHaveBeenCalledWith({ preFilterRules: [mockOtherRule] });
  });
});
