/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { BaseMessage } from '@langchain/core/messages';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { getMatchPrebuiltRuleAgentNode } from './agent';
import { MAX_TOOL_CALL_ATTEMPTS } from '../../state';
import {
  finalMessage,
  matchResult,
  qradarDosFloodMatch,
  qradarDosFloodSearchCandidates,
  qradarDosFloodSearchQuery,
  qradarDosFloodState,
  qradarDosFloodSummary,
  qradarHoneypotNoMatchSummary,
  qradarHoneypotSearchAttempts,
  qradarHoneypotState,
  searchToolMessage,
  toolCallMessage,
} from '../__mocks__/mocks';

describe('getMatchPrebuiltRuleAgentNode', () => {
  const mockInvoke = jest.fn();
  const model = { bindTools: () => ({ invoke: mockInvoke }) } as never;
  const tool = { name: 'searchPrebuiltRules' } as never;

  const node = getMatchPrebuiltRuleAgentNode({ model, tool });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('found in one attempt', () => {
    let priorMessages: BaseMessage[];
    let aiMessage: ReturnType<typeof finalMessage>;
    let invokedMessages: BaseMessage[];
    let result: Awaited<ReturnType<typeof node>>;

    beforeEach(async () => {
      priorMessages = [
        new SystemMessage('system'),
        new HumanMessage('human'),
        toolCallMessage(qradarDosFloodSearchQuery),
        searchToolMessage(qradarDosFloodSearchCandidates),
      ];
      aiMessage = finalMessage(qradarDosFloodMatch, qradarDosFloodSummary);
      mockInvoke.mockResolvedValueOnce(aiMessage);

      result = await node({
        ...qradarDosFloodState,
        match_prebuilt_rules_messages: priorMessages,
      });

      [invokedMessages] = mockInvoke.mock.calls[0];
    });

    it('forwards the prior history unchanged, plus the match-evaluation prompt only', () => {
      expect(invokedMessages).toHaveLength(priorMessages.length + 1);
      expect(invokedMessages.slice(0, priorMessages.length)).toEqual(priorMessages);
      expect(HumanMessage.isInstance(invokedMessages.at(-1))).toBe(true);
      expect(String(invokedMessages.at(-1)?.content)).toContain('<matching_guidelines>');
    });

    it("keeps the single injected prompt and the model's final answer in the result messages", () => {
      expect(result.match_prebuilt_rules_messages).toHaveLength(2);
      expect(HumanMessage.isInstance(result.match_prebuilt_rules_messages?.[0])).toBe(true);
      expect(result.match_prebuilt_rules_messages?.at(-1)).toBe(aiMessage);
    });

    it("parses the model's final answer into the result", () => {
      expect(result.match_prebuilt_rules_result).toEqual(
        matchResult(qradarDosFloodMatch, qradarDosFloodSummary)
      );
    });
  });

  describe('not found after returned candidates', () => {
    let aiMessage: ReturnType<typeof finalMessage>;
    let invokedMessages: BaseMessage[];
    let result: Awaited<ReturnType<typeof node>>;

    beforeEach(async () => {
      const [firstAttempt] = qradarHoneypotSearchAttempts;
      const priorMessages = [
        new SystemMessage('system'),
        new HumanMessage('human'),
        toolCallMessage(firstAttempt.query),
        searchToolMessage(firstAttempt.candidates),
      ];
      aiMessage = finalMessage('', qradarHoneypotNoMatchSummary);
      mockInvoke.mockResolvedValueOnce(aiMessage);

      result = await node({
        ...qradarHoneypotState,
        match_prebuilt_rules_messages: priorMessages,
      });

      [invokedMessages] = mockInvoke.mock.calls[0];
    });

    it('sends the match-evaluation prompt', () => {
      expect(String(invokedMessages.at(-1)?.content)).toContain('<matching_guidelines>');
    });

    it('includes the no-match example, since an empty "match" is a valid, expected outcome rather than a parsing failure', () => {
      expect(String(invokedMessages.at(-1)?.content)).toContain('<example_response_no_match>');
    });

    it("accepts the model's valid-JSON empty-match answer directly, without a malformed-JSON retry", () => {
      expect(result.match_prebuilt_rules_messages?.at(-1)).toBe(aiMessage);
    });

    it('parses the empty match into the result', () => {
      expect(result.match_prebuilt_rules_result).toEqual(
        matchResult('', qradarHoneypotNoMatchSummary)
      );
    });
  });

  describe('not found after three attempts', () => {
    let priorMessages: BaseMessage[];
    let invokedMessages: BaseMessage[];
    let content: string;
    let result: Awaited<ReturnType<typeof node>>;

    beforeEach(async () => {
      const [firstAttempt, secondAttempt, thirdAttempt] = qradarHoneypotSearchAttempts;
      priorMessages = [
        new SystemMessage('system'),
        new HumanMessage('human'),
        toolCallMessage(firstAttempt.query),
        searchToolMessage(firstAttempt.candidates),
        toolCallMessage(secondAttempt.query),
        searchToolMessage(secondAttempt.candidates),
        toolCallMessage(thirdAttempt.query),
        searchToolMessage(thirdAttempt.candidates),
      ];
      const aiMessage = finalMessage('', qradarHoneypotNoMatchSummary);
      mockInvoke.mockResolvedValueOnce(aiMessage);

      result = await node({
        ...qradarHoneypotState,
        match_prebuilt_rules_messages: priorMessages,
      });

      [invokedMessages] = mockInvoke.mock.calls[0];
      content = String(invokedMessages.at(-1)?.content);
    });

    it('forwards all three prior search rounds to the model unchanged', () => {
      expect(invokedMessages).toHaveLength(priorMessages.length + 1);
      expect(invokedMessages.slice(0, priorMessages.length)).toEqual(priorMessages);
    });

    it('states the search-attempt cap using the MAX_TOOL_CALL_ATTEMPTS constant', () => {
      expect(content).toContain(
        `You may call searchPrebuiltRules at most ${MAX_TOOL_CALL_ATTEMPTS} times in total`
      );
    });

    it('does not add final-turn wording once the search budget is exhausted', () => {
      // the matching-guidelines prompt is identical on every evaluation turn — no turn-dependent
      // injection is needed even once the search budget is exhausted
      expect(content).not.toContain('This is your final turn');
    });

    it('parses the empty match into the result', () => {
      expect(result.match_prebuilt_rules_result).toEqual(
        matchResult('', qradarHoneypotNoMatchSummary)
      );
    });
  });
});
