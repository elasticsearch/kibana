/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import { loggerMock } from '@kbn/logging-mocks';
import type { InferenceClient } from '@kbn/inference-common';
import type { Streams } from '@kbn/streams-schema';
import { generateSignificantEvents } from '@kbn/streams-ai';
import type { SemanticCodeSearchTools } from '../semantic_code_search_grounding/semantic_code_search_tools';
import type { KnowledgeIndicatorClient } from '../streams/ki';
import { generateSignificantEventDefinitions } from './generate_significant_events';

jest.mock('@kbn/streams-ai', () => ({
  generateSignificantEvents: jest.fn(),
}));

const generateSignificantEventsMock = generateSignificantEvents as jest.MockedFunction<
  typeof generateSignificantEvents
>;

describe('generateSignificantEventDefinitions (semantic code search wiring)', () => {
  let logger: jest.Mocked<Logger>;

  const definition = { name: 'logs.test' } as Streams.all.Definition;

  const buildDeps = (
    overrides: Partial<Parameters<typeof generateSignificantEventDefinitions>[1]> = {}
  ) => ({
    inferenceClient: { bindTo: jest.fn().mockReturnValue({}) } as unknown as InferenceClient,
    kiClient: {
      getFeatures: jest.fn(),
      getStreamToQueryLinksMap: jest.fn().mockResolvedValue({ 'logs.test': [] }),
    } as unknown as KnowledgeIndicatorClient,
    logger,
    signal: new AbortController().signal,
    esClient: {} as ElasticsearchClient,
    ...overrides,
  });

  const SCS_TOOL_NAMES = [
    'analyze_symbol',
    'code_search',
    'git_cochanges',
    'git_file_authors',
    'git_file_history',
    'git_find_introducing_commit',
    'git_search_commits',
    'git_show_commit',
    'list_code_indices',
    'read_code_file',
    'select_code_index',
  ];

  // Fake of the createSemanticCodeSearchTools output. The factory itself is
  // covered by its own unit test; here we only assert how these tools are
  // wired into generateSignificantEventDefinitions.
  const makeCodeTools = (): SemanticCodeSearchTools => ({
    tools: Object.fromEntries(
      SCS_TOOL_NAMES.map((name) => [
        name,
        { description: name, schema: { type: 'object' as const, properties: {} } },
      ])
    ),
    callbacks: Object.fromEntries(SCS_TOOL_NAMES.map((name) => [name, jest.fn()])),
    promptSnippet: 'SCS_GROUNDING_SNIPPET',
  });

  beforeEach(() => {
    logger = loggerMock.create();
    generateSignificantEventsMock.mockReset();
    generateSignificantEventsMock.mockResolvedValue({
      queries: [],
      tokensUsed: { prompt: 0, completion: 0, total: 0 },
      toolUsage: {
        get_stream_features: { calls: 0, failures: 0, latency_ms: 0 },
        add_queries: { calls: 0, failures: 0, latency_ms: 0 },
      },
    });
  });

  it('does not pass tools or raise the step budget when no discovery tools are provided', async () => {
    await generateSignificantEventDefinitions(
      { definition, connectorId: 'c1', systemPrompt: 'SYSTEM' },
      buildDeps()
    );

    const args = generateSignificantEventsMock.mock.calls[0][0];
    expect(args.additionalTools).toBeUndefined();
    expect(args.additionalToolCallbacks).toBeUndefined();
    expect(args.maxSteps).toBeUndefined();
    expect(args.systemPrompt).toBe('SYSTEM');
  });

  it('forwards the SCS tools, appends the prompt snippet, and raises the step budget', async () => {
    const semanticCodeSearchTools = makeCodeTools();

    await generateSignificantEventDefinitions(
      { definition, connectorId: 'c1', systemPrompt: 'SYSTEM' },
      buildDeps({ semanticCodeSearchTools })
    );

    const args = generateSignificantEventsMock.mock.calls[0][0];
    expect(Object.keys(args.additionalTools ?? {}).sort()).toEqual(SCS_TOOL_NAMES);
    expect(Object.keys(args.additionalToolCallbacks ?? {}).sort()).toEqual(SCS_TOOL_NAMES);
    expect(args.systemPrompt).toContain('SYSTEM');
    expect(args.systemPrompt).toContain('SCS_GROUNDING_SNIPPET');
    expect(args.maxSteps).toBe(10);
  });

  it('merges memory and SCS tools when both are provided', async () => {
    const semanticCodeSearchTools = makeCodeTools();
    const memoryTools = {
      tools: {
        memory_search: { description: 'm', schema: { type: 'object' as const, properties: {} } },
      },
      callbacks: { memory_search: jest.fn() },
      promptSnippet: 'MEMORY_SNIPPET',
    };

    await generateSignificantEventDefinitions(
      { definition, connectorId: 'c1', systemPrompt: 'SYSTEM' },
      buildDeps({ memoryTools, semanticCodeSearchTools })
    );

    const args = generateSignificantEventsMock.mock.calls[0][0];
    expect(Object.keys(args.additionalTools ?? {}).sort()).toEqual(
      [...SCS_TOOL_NAMES, 'memory_search'].sort()
    );
    expect(args.systemPrompt).toContain('MEMORY_SNIPPET');
    expect(args.systemPrompt).toContain('SCS_GROUNDING_SNIPPET');
  });
});
