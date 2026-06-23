/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient, KibanaRequest, Logger } from '@kbn/core/server';
import { loggerMock } from '@kbn/logging-mocks';
import type { ToolsStart } from '@kbn/agent-builder-server';
import type { Streams } from '@kbn/streams-schema';
import { getSigEventsLogPatternsEsql } from '@kbn/ai-tools';
import { createCodeAnalysisProvider, type CodeAnalysisOutcome } from './compute_code_analysis';
import {
  SCS_LIST_REPOS_TOOL_ID,
  SCS_LIST_INDICES_TOOL_ID,
  SCS_SEMANTIC_SEARCH_TOOL_ID,
} from './semantic_code_search_tools';

jest.mock('@kbn/ai-tools', () => ({
  getSigEventsLogPatternsEsql: jest.fn(),
}));

jest.mock('@kbn/traced-es-client', () => ({
  createTracedEsClient: jest.fn(({ client }) => client),
}));

const getPatternsMock = getSigEventsLogPatternsEsql as jest.Mock;

// SCS workflow tools return a single `other` result whose rendered Markdown is
// at `data.execution.output` (see each scs/*/workflow.yaml `console` step).
const toolOutput = (markdown: string) => ({
  results: [
    {
      tool_result_id: 'r1',
      type: 'other',
      data: { execution: { status: 'completed', output: markdown } },
    },
  ],
});

// Mirrors the `scs.semantic_search` Markdown format for a single hit.
const searchMarkdown = (fileLocation: string, content: string) =>
  [
    'Found 1 results.',
    '---',
    `**File**: \`${fileLocation}\``,
    '**Score**: 1.0 | **Type**: function_declaration | **Language**: go',
    '```',
    content,
    '```',
  ].join('\n');

// Mirrors the `scs.list_indices` / `scs.list_repos` Markdown bullet list.
const listMarkdown = (labels: string[]) =>
  labels.length === 0
    ? 'No SCS code-search indices found.'
    : [
        `Found ${labels.length} indexed codebases:`,
        '',
        ...labels.map((label) => `- \`${label}\` (10 docs, 1mb)`),
      ].join('\n');

describe('createCodeAnalysisProvider', () => {
  let logger: jest.Mocked<Logger>;
  let execute: jest.Mock;
  let agentBuilderTools: ToolsStart;
  let esClient: jest.Mocked<ElasticsearchClient>;
  let onOutcome: jest.Mock;
  const request = {} as KibanaRequest;
  const stream = { name: 'logs.acme.checkout' } as Streams.all.Definition;

  const run = () =>
    createCodeAnalysisProvider({ agentBuilderTools, request, onOutcome })({
      stream,
      start: 0,
      end: 1,
      esClient,
      logger,
    });

  const lastOutcome = (): CodeAnalysisOutcome => onOutcome.mock.calls.at(-1)![0];

  beforeEach(() => {
    logger = loggerMock.create();
    execute = jest.fn();
    onOutcome = jest.fn();
    agentBuilderTools = { execute } as unknown as ToolsStart;
    esClient = {} as unknown as jest.Mocked<ElasticsearchClient>;
    getPatternsMock.mockResolvedValue([
      {
        field: 'message',
        pattern: 'connection refused *',
        count: 10,
        sample: 'connection refused',
      },
      { field: 'message', pattern: 'timeout after *', count: 3, sample: 'timeout after 30s' },
    ]);
  });

  it('selects the repository whose code verifies the most distinctive log strings', async () => {
    execute.mockImplementation(async ({ toolId, toolParams }) => {
      if (toolId === SCS_LIST_REPOS_TOOL_ID) {
        return toolOutput(listMarkdown(['acme/checkout', 'acme/billing']));
      }
      if (toolId === SCS_SEMANTIC_SEARCH_TOOL_ID) {
        if (toolParams.repository === 'acme/checkout') {
          return toolOutput(searchMarkdown('src/net.go:42-58', 'log.Error("connection refused")'));
        }
        return toolOutput(searchMarkdown('src/other.go:1-3', 'unrelated code'));
      }
      return { results: [] };
    });

    const value = await run();

    expect(value).toEqual({
      repository: 'acme/checkout',
      verified_strings: ['connection refused'],
      evidence: ['code: src/net.go:42 log.Error("connection refused")'],
      code_context: [],
    });
    expect(lastOutcome()).toEqual({
      status: 'feature',
      repository: 'acme/checkout',
      candidateCount: 2,
      verifiedCount: 1,
    });
  });

  it('includes unmatched code hits in code_context as proactive seed evidence', async () => {
    const multiHitMarkdown = [
      searchMarkdown('src/net.go:42-58', 'log.Error("connection refused")'),
      searchMarkdown('src/net.go:90-105', 'log.Warn("rate limit exceeded, retrying")'),
    ].join('\n');

    execute.mockImplementation(async ({ toolId }) => {
      if (toolId === SCS_LIST_REPOS_TOOL_ID) {
        return toolOutput(listMarkdown(['acme/checkout']));
      }
      if (toolId === SCS_SEMANTIC_SEARCH_TOOL_ID) {
        return toolOutput(multiHitMarkdown);
      }
      return { results: [] };
    });

    const value = await run();

    expect(value).toEqual({
      repository: 'acme/checkout',
      verified_strings: ['connection refused'],
      evidence: ['code: src/net.go:42 log.Error("connection refused")'],
      // second hit doesn't match any observed log string → seed role
      code_context: ['code: src/net.go:90 log.Warn("rate limit exceeded, retrying")'],
    });
  });

  it('falls back to list_indices (index surface) when list_repos is unavailable', async () => {
    execute.mockImplementation(async ({ toolId, toolParams }) => {
      if (toolId === SCS_LIST_REPOS_TOOL_ID) {
        throw new Error('list_repos not installed');
      }
      if (toolId === SCS_LIST_INDICES_TOOL_ID) {
        return toolOutput(listMarkdown(['code-acme_checkout']));
      }
      if (toolId === SCS_SEMANTIC_SEARCH_TOOL_ID) {
        expect(toolParams.index).toBe('code-acme_checkout');
        expect(toolParams.repository).toBeUndefined();
        return toolOutput(searchMarkdown('a.go:7-9', 'connection refused happened'));
      }
      return { results: [] };
    });

    const value = (await run()) as { repository: string };
    expect(value.repository).toBe('code-acme_checkout');
  });

  it('returns undefined and reports no_strings when there are no distinctive log strings', async () => {
    getPatternsMock.mockResolvedValue([]);
    const value = await run();
    expect(value).toBeUndefined();
    expect(execute).not.toHaveBeenCalled();
    expect(lastOutcome().status).toBe('no_strings');
  });

  it('returns undefined and reports unavailable when SCS list tools are not installed', async () => {
    execute.mockRejectedValue(new Error('not installed'));
    const value = await run();
    expect(value).toBeUndefined();
    expect(lastOutcome().status).toBe('unavailable');
  });

  it('returns undefined and reports no_candidates when no repositories are returned', async () => {
    execute.mockImplementation(async ({ toolId }) =>
      toolId === SCS_LIST_REPOS_TOOL_ID ? toolOutput(listMarkdown([])) : { results: [] }
    );
    const value = await run();
    expect(value).toBeUndefined();
    expect(lastOutcome().status).toBe('no_candidates');
  });

  it('returns undefined and reports no_match when no candidate verifies a log string (dead-query filter)', async () => {
    execute.mockImplementation(async ({ toolId }) => {
      if (toolId === SCS_LIST_REPOS_TOOL_ID) {
        return toolOutput(listMarkdown(['acme/checkout']));
      }
      // Code exists but none of its snippets contain the sampled log strings.
      return toolOutput(searchMarkdown('a.go:1-2', 'totally unrelated source'));
    });
    const value = await run();
    expect(value).toBeUndefined();
    expect(lastOutcome()).toEqual({
      status: 'no_match',
      candidateCount: 1,
      verifiedCount: 0,
    });
  });
});
