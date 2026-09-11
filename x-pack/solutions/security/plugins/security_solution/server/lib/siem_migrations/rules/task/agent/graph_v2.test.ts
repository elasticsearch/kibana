/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { InferenceChatModel } from '@kbn/inference-langchain';
import { loggerMock } from '@kbn/logging-mocks';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { BaseChatModelParams } from '@langchain/core/language_models/chat_models';
import { AIMessage } from '@langchain/core/messages';
import type { ChatResult } from '@langchain/core/outputs';
import { AsyncLocalStorageProviderSingleton } from '@langchain/core/singletons';
import { MockSiemMigrationTelemetryClient } from '../__mocks__/mocks';
import { MockEsqlKnowledgeBase } from '../../../common/task/util/__mocks__/mocks';
import { MockRuleMigrationsRetriever } from '../retrievers/__mocks__/mocks';
import { getRuleMigrationAgentV2 } from './graph_v2';
import { MAX_TOOL_CALL_ATTEMPTS } from './sub_graphs/match_prebuilt_rule/state';
import { getRulesMigrationTools } from './tools';
import { createRuleMigrationsDataClientMock } from '../../data/__mocks__/mocks';

interface FakeToolCall {
  name: string;
  args: Record<string, unknown>;
}

interface FakeModelTurn {
  toolCalls?: FakeToolCall[];
  content?: string;
}

interface FakeNodeConfig {
  nodeId: string;
  /** Plain content, reused for every call to this node. Mutually exclusive with `turns`. */
  response?: string;
  /**
   * Sequence of turns consumed in order across repeated model calls tagged with this node id
   * (e.g. the `matchPrebuiltRule` subgraph's `agent` node — the graph's agent/tools loop calls it
   * once per turn, looping back after each `tools` node run); the last entry repeats once
   * exhausted. Mutually exclusive with `response`.
   */
  turns?: FakeModelTurn[];
}

/**
 * A `BaseChatModel` test double (unlike a completion-style `LLM`, whose `.invoke()` can only ever
 * return plain text) so it can return real `AIMessage`s with `tool_calls` — needed to simulate the
 * `matchPrebuiltRule` subgraph's `agent` node deciding, turn by turn, whether to call the bound
 * `searchPrebuiltRules` tool (security-team#18589). For nodes configured with a plain `response`,
 * behaves the same as the completion-style `SiemMigrationFakeLLM` used elsewhere: one canned
 * string, repeated forever.
 */
class FakeToolCallingChatModel extends BaseChatModel {
  private nodes: FakeNodeConfig[];
  private callIndexByNode = new Map<string, number>();

  constructor({ nodes, ...rest }: BaseChatModelParams & { nodes: FakeNodeConfig[] }) {
    super(rest);
    this.nodes = nodes;
  }

  _llmType(): string {
    return 'fake-tool-calling-chat';
  }

  bindTools(): this {
    return this;
  }

  async _generate(): Promise<ChatResult> {
    const item = AsyncLocalStorageProviderSingleton.getRunnableConfig();
    const nodeId = item?.metadata?.langgraph_node as string | undefined;
    const config = nodeId ? this.nodes.find((n) => n.nodeId === nodeId) : undefined;

    if (!config) {
      const message = new AIMessage({ content: 'unexpected node call' });
      return { generations: [{ message, text: 'unexpected node call' }] };
    }

    const callIndex = this.callIndexByNode.get(config.nodeId) ?? 0;
    this.callIndexByNode.set(config.nodeId, callIndex + 1);

    const turn: FakeModelTurn = config.turns
      ? config.turns[Math.min(callIndex, config.turns.length - 1)]
      : { content: config.response ?? '' };

    const message = new AIMessage({
      content: turn.content ?? '',
      tool_calls: turn.toolCalls?.map((call, i) => ({
        type: 'tool_call' as const,
        id: `${config.nodeId}-${callIndex}-${i}`,
        name: call.name,
        args: call.args,
      })),
    });

    return { generations: [{ message, text: turn.content ?? '' }] };
  }

  getNodeCallCount(nodeId: string): number {
    return this.callIndexByNode.get(nodeId) ?? 0;
  }
}

const mockOriginalRule = {
  id: 'b12c89bc-9d06-11eb-a592-acde48001122',
  vendor: 'splunk' as const,
  query_language: 'spl',
  title: 'Office Document Executing Macro Code',
  description:
    'The following analytic identifies office documents executing macro code. It leverages Sysmon EventCode 7 to detect when processes like WINWORD.EXE or EXCEL.EXE load specific DLLs associated with macros (e.g., VBE7.DLL). This activity is significant because macros are a common attack vector for delivering malicious payloads, such as malware. If confirmed malicious, this could lead to unauthorized code execution, data exfiltration, or further compromise of the system. Disabling macros by default is recommended to mitigate this risk.',
  query:
    '`sysmon` EventCode=7 process_name IN ("WINWORD.EXE", "EXCEL.EXE", "POWERPNT.EXE","onenote.exe","onenotem.exe","onenoteviewer.exe","onenoteim.exe","msaccess.exe") loaded_file_path IN ("*\\\\VBE7INTL.DLL","*\\\\VBE7.DLL", "*\\\\VBEUI.DLL") | stats min(_time) as firstTime max(_time) as lastTime values(loaded_file) as loaded_file count by dest EventCode process_name process_guid | `security_content_ctime(firstTime)` | `security_content_ctime(lastTime)` | `office_document_executing_macro_code_filter`',
};

const mockPartialNlToEsqlResponse =
  '```esql\nFROM logs-*\n| STATS web_event_count = COUNT(*) BY src, http_method\n| LOOKUP JOIN "app:count_by_http_method_by_src_1d" ON src\n```';

const mockPrebuiltRule = {
  rule_id: 'test-rule',
  description: 'test-description',
  name: 'Suspicious MS Office Child Process',
};

const mockIncorrectRuleName = {
  ...mockPrebuiltRule,
  name: 'wrong-name',
};

const mockSemanticQueryResponse = JSON.stringify({
  semantic_query:
    'web http abnormal high volume requests method source ip network traffic analysis datamodel web security',
});

const searchToolCall = (query: string): FakeToolCall => ({
  name: 'searchPrebuiltRules',
  args: { query, technique_ids: '' },
});

const mockPrebuiltRuleMatchResponse = JSON.stringify({
  match: 'Suspicious MS Office Child Process',
  summary:
    '## Prebuilt Rule Matching Summary\\nThe Splunk rule "Office Document Executing Macro Code" is closely related to the Elastic rule "Suspicious MS Office Child Process". Both rules aim to detect potentially malicious activity originating from Microsoft Office applications.',
});

const mockPrebuiltRuleNoMatchResponse = JSON.stringify({
  match: '',
  summary: '## Prebuilt Rule Matching Summary\\n No matches found',
});

const mockIntegrationNoMatchResponse = JSON.stringify({
  match: '',
  summary: '## Integration Matching Summary\\nNo related integration found.',
});

const logger = loggerMock.create();
let fakeLLM: FakeToolCallingChatModel;
let mockRetriever = new MockRuleMigrationsRetriever();
let mockEsqlKnowledgeBase = new MockEsqlKnowledgeBase();
let mockTelemetryClient = new MockSiemMigrationTelemetryClient();

const setupAgent = async (nodes: FakeNodeConfig[]) => {
  fakeLLM = new FakeToolCallingChatModel({ nodes });
  const model = fakeLLM as unknown as InferenceChatModel;
  const graph = getRuleMigrationAgentV2({
    model,
    esqlKnowledgeBase: mockEsqlKnowledgeBase,
    ruleMigrationsRetriever: mockRetriever,
    logger,
    telemetryClient: mockTelemetryClient,
    tools: getRulesMigrationTools('test-migration', {
      rulesClient: createRuleMigrationsDataClientMock(),
      ruleMigrationsRetriever: mockRetriever,
    }),
  });
  return graph;
};

// This tests the v2 `matchPrebuiltRule` subgraph path (security-team#18589), used when the
// `ruleMigrationGraphv2` experimental feature is enabled. Unlike v1's one-shot node, the subgraph
// runs an agent/tools loop: its `agent` node's model decides (via a bound `searchPrebuiltRules`
// tool) when to search and crafts its own pre-built-rule-specific query, instead of consuming the
// parent's `semantic_query`, and a real `ToolNode` executes the search. See `./graph.test.ts` for
// the v1 one-shot node path (flag disabled, default).
describe('getRuleMigrationAgentV2', () => {
  beforeEach(() => {
    mockRetriever = new MockRuleMigrationsRetriever();
    mockTelemetryClient = new MockSiemMigrationTelemetryClient();
    mockEsqlKnowledgeBase = new MockEsqlKnowledgeBase();
    jest.clearAllMocks();
  });

  describe('graph compilation', () => {
    it('ensures that the graph compiles', async () => {
      await setupAgent([{ nodeId: '', response: '' }]);
    });
  });

  describe('prebuilt rules', () => {
    // Eval note (security-team#18589): compare prebuilt match rates for Splunk, QRadar, and
    // Sentinel via kbn-evals-suite-security-automatic-migrations prebuilt_rule_match evaluator.
    it('successful match via the match subgraph', async () => {
      mockRetriever.prebuiltRules.search.mockResolvedValue([mockPrebuiltRule]);
      const graph = await setupAgent([
        { nodeId: 'createSemanticQuery', response: mockSemanticQueryResponse },
        {
          nodeId: 'agent',
          turns: [
            { toolCalls: [searchToolCall('office document macro child process execution')] },
            { content: mockPrebuiltRuleMatchResponse },
          ],
        },
      ]);
      const response = await graph.invoke({
        original_rule: mockOriginalRule,
      });
      expect(response.elastic_rule?.prebuilt_rule_id).toEqual('test-rule');
      expect(response.translation_result).toEqual('full');
      expect(mockRetriever.prebuiltRules.search).toHaveBeenCalledTimes(1);
      // 2 agent-node turns (search, then final answer) — the loop between `agent` and the real
      // `ToolNode` in the subgraph's own `graph.ts`, not an internal loop within one node.
      expect(fakeLLM.getNodeCallCount('agent')).toBe(2);
    });

    // The model decides to search again with a different query after a bad match, looping through
    // the subgraph's `agent`/`tools` nodes again — there's no graph-level retry router driving
    // this, the model's own tool-calling decisions do (security-team#18589).
    it('model retries with a different query after a bad match, then succeeds', async () => {
      mockRetriever.prebuiltRules.search
        .mockResolvedValueOnce([mockIncorrectRuleName])
        .mockResolvedValueOnce([mockPrebuiltRule]);
      const graph = await setupAgent([
        { nodeId: 'createSemanticQuery', response: mockSemanticQueryResponse },
        {
          nodeId: 'agent',
          turns: [
            { toolCalls: [searchToolCall('office macro child process')] },
            { toolCalls: [searchToolCall('office document macro execution sysmon')] },
            { content: mockPrebuiltRuleMatchResponse },
          ],
        },
      ]);

      const response = await graph.invoke({
        id: 'test',
        original_rule: mockOriginalRule,
        resources: {},
      });
      expect(response.elastic_rule?.prebuilt_rule_id).toEqual('test-rule');
      expect(response.translation_result).toEqual('full');
      expect(mockRetriever.prebuiltRules.search).toHaveBeenCalledTimes(2);
      expect(fakeLLM.getNodeCallCount('agent')).toBe(3);
    });

    it('no prebuilt rule matches', async () => {
      mockRetriever.prebuiltRules.search.mockResolvedValue([]);
      const graph = await setupAgent([
        { nodeId: 'createSemanticQuery', response: mockSemanticQueryResponse },
        {
          nodeId: 'agent',
          turns: [
            { toolCalls: [searchToolCall('office document macro child process execution')] },
            { content: mockPrebuiltRuleNoMatchResponse },
          ],
        },
      ]);
      const response = await graph.invoke({
        id: 'test',
        original_rule: mockOriginalRule,
        resources: {},
      });
      expect(mockRetriever.prebuiltRules.search).toHaveBeenCalledTimes(1);
      expect(response.elastic_rule?.prebuilt_rule_id).toBeUndefined();
      expect(response.translation_result).toEqual('untranslatable');
    });

    it('finalizes after a declined retry prompt instead of looping', async () => {
      mockRetriever.prebuiltRules.search.mockResolvedValue([mockIncorrectRuleName]);
      const graph = await setupAgent([
        { nodeId: 'createSemanticQuery', response: mockSemanticQueryResponse },
        {
          nodeId: 'agent',
          turns: [
            { toolCalls: [searchToolCall('office document macro child process')] },
            { content: mockPrebuiltRuleNoMatchResponse },
            { content: mockPrebuiltRuleNoMatchResponse },
          ],
        },
      ]);
      const response = await graph.invoke({
        id: 'test',
        original_rule: mockOriginalRule,
        resources: {},
      });
      // search, no-match JSON, declined retry prompt (no-match JSON again) — then finalize.
      expect(fakeLLM.getNodeCallCount('agent')).toBe(3);
      expect(mockRetriever.prebuiltRules.search).toHaveBeenCalledTimes(1);
      expect(response.elastic_rule?.prebuilt_rule_id).toBeUndefined();
      expect(response.translation_result).toEqual('untranslatable');
    });

    it('re-searches after two no-matches then finalizes on the third', async () => {
      mockRetriever.prebuiltRules.search.mockResolvedValue([mockIncorrectRuleName]);
      const graph = await setupAgent([
        { nodeId: 'createSemanticQuery', response: mockSemanticQueryResponse },
        {
          nodeId: 'agent',
          turns: [
            { toolCalls: [searchToolCall('office document macro child process')] },
            { content: mockPrebuiltRuleNoMatchResponse },
            { toolCalls: [searchToolCall('office macro execution sysmon')] },
            { content: mockPrebuiltRuleNoMatchResponse },
            { toolCalls: [searchToolCall('office child process creation')] },
            { content: mockPrebuiltRuleNoMatchResponse },
          ],
        },
      ]);
      const response = await graph.invoke({
        id: 'test',
        original_rule: mockOriginalRule,
        resources: {},
      });
      // 1st and 2nd no-match each trigger a re-search; 3rd no-match finalizes.
      expect(fakeLLM.getNodeCallCount('agent')).toBe(6);
      expect(mockRetriever.prebuiltRules.search).toHaveBeenCalledTimes(3);
      expect(response.elastic_rule?.prebuilt_rule_id).toBeUndefined();
      expect(response.translation_result).toEqual('untranslatable');
    });

    it('gives up after MAX_TOOL_CALL_ATTEMPTS searches if the model keeps calling the tool', async () => {
      mockRetriever.prebuiltRules.search.mockResolvedValue([mockIncorrectRuleName]);
      const graph = await setupAgent([
        { nodeId: 'createSemanticQuery', response: mockSemanticQueryResponse },
        {
          nodeId: 'agent',
          // Always calls the tool, never produces a final JSON answer.
          turns: [{ toolCalls: [searchToolCall('office document macro child process')] }],
        },
      ]);
      const response = await graph.invoke({
        id: 'test',
        original_rule: mockOriginalRule,
        resources: {},
      });
      // After the last executed search, tools → agent one more time. That extra tool call is
      // discarded (`searchCount` exceeds MAX_TOOL_CALL_ATTEMPTS), so only that many searches run.
      expect(fakeLLM.getNodeCallCount('agent')).toBe(MAX_TOOL_CALL_ATTEMPTS + 1);
      expect(mockRetriever.prebuiltRules.search).toHaveBeenCalledTimes(MAX_TOOL_CALL_ATTEMPTS);
      expect(response.elastic_rule?.prebuilt_rule_id).toBeUndefined();
      expect(response.translation_result).toEqual('untranslatable');
    });

    it('skipPrebuiltRulesMatching bypasses the match subgraph', async () => {
      mockEsqlKnowledgeBase.translate.mockResolvedValue(mockPartialNlToEsqlResponse);
      mockRetriever.integrations.search.mockResolvedValue([]);
      const graph = await setupAgent([
        { nodeId: 'createSemanticQuery', response: mockSemanticQueryResponse },
        { nodeId: 'retrieveIntegrations', response: mockIntegrationNoMatchResponse },
      ]);

      const response = await graph.invoke(
        {
          id: 'test',
          original_rule: mockOriginalRule,
          resources: {},
        },
        { configurable: { skipPrebuiltRulesMatching: true } }
      );

      expect(fakeLLM.getNodeCallCount('agent')).toBe(0);
      expect(mockRetriever.prebuiltRules.search).not.toHaveBeenCalled();
      expect(response.elastic_rule?.prebuilt_rule_id).toBeUndefined();
      expect(response.translation_result).toEqual('partial');
    });
  });
});
