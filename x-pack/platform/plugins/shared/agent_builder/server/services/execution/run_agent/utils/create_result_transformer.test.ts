/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ToolCallWithResult, ToolResult } from '@kbn/agent-builder-common';
import { ToolResultType } from '@kbn/agent-builder-common';
import type { FileEntry } from '@kbn/agent-builder-server/runner/filestore';
import type { ToolResultStore } from '@kbn/agent-builder-server/runner';
import type { ToolManager } from '@kbn/agent-builder-server/runner/tool_manager';
import type { ToolRegistry } from '@kbn/agent-builder-server';
import { createResultTransformer, FS_TOOL_CALL_TOKEN_THRESHOLD } from './create_result_transformer';

describe('createResultTransformer', () => {
  const makeToolCallWithResult = (
    id: string,
    toolId: string,
    results: ToolResult[]
  ): ToolCallWithResult => ({
    tool_call_id: id,
    tool_id: toolId,
    params: {},
    results,
  });

  // Entries are keyed by tool_result_id, matching the store's `getEntryByResultId` lookup.
  const createMockResultStore = (entriesByResultId: Map<string, FileEntry>): ToolResultStore =>
    ({
      has: jest.fn(),
      get: jest.fn(),
      getEntry: jest.fn(),
      getEntryByResultId: jest.fn(async (resultId: string) => entriesByResultId.get(resultId)),
      listEntries: jest.fn(async () => []),
      entryExists: jest.fn(),
    } as unknown as ToolResultStore);

  const createFileEntry = (
    path: string,
    tokenCount: number,
    data: Record<string, unknown> = {}
  ): FileEntry => ({
    path,
    type: 'file',
    metadata: {
      type: 'tool_result' as any,
      id: 'result-id',
      token_count: tokenCount,
      readonly: true,
    },
    content: {
      raw: data,
      plain_text: JSON.stringify(data),
    },
  });

  const createMockToolRegistry = (
    tools: Map<string, { summarizeToolReturn?: (step: ToolCallWithResult) => ToolResult[] | null }>
  ): ToolRegistry =>
    ({
      get: jest.fn(async (toolId: string) => tools.get(toolId)),
      has: jest.fn(async (toolId: string) => tools.has(toolId)),
      list: jest.fn(async () => []),
    } as unknown as ToolRegistry);

  const createMockToolManager = (
    summarizers: Map<
      string,
      (step: ToolCallWithResult) => ToolResult[] | null | undefined
    > = new Map()
  ): ToolManager =>
    ({
      getSummarizer: jest.fn((toolId: string) => summarizers.get(toolId)),
    } as unknown as ToolManager);

  describe('tool-specific summarization', () => {
    it('applies summarizeToolReturn when tool has it defined', async () => {
      const toolWithSummarizer = {
        summarizeToolReturn: jest.fn((step: ToolCallWithResult) => [
          {
            tool_result_id: 'summarized',
            type: ToolResultType.other,
            data: { summary: `Summarized ${step.results.length} results` },
          },
        ]),
      };

      const toolRegistry = createMockToolRegistry(new Map([['search', toolWithSummarizer as any]]));
      const resultStore = createMockResultStore(new Map());

      const transformer = createResultTransformer({
        conversationTokenEstimate: 1,
        toolRegistry,
        toolManager: createMockToolManager(),
        resultStore,
      });

      const toolCall = makeToolCallWithResult('call-1', 'search', [
        { tool_result_id: 'result-1', type: ToolResultType.other, data: { doc: '1' } },
        { tool_result_id: 'result-2', type: ToolResultType.other, data: { doc: '2' } },
      ]);

      const result = await transformer(toolCall);

      expect(toolWithSummarizer.summarizeToolReturn).toHaveBeenCalledWith(toolCall);
      expect(result).toHaveLength(1);
      expect(result[0].data).toEqual({ summary: 'Summarized 2 results', _summary: true });
    });

    it('falls back to original results when summarizeToolReturn returns null', async () => {
      const toolWithNullSummarizer = {
        summarizeToolReturn: jest.fn(() => null),
      };

      const toolRegistry = createMockToolRegistry(
        new Map([['search', toolWithNullSummarizer as any]])
      );
      const resultStore = createMockResultStore(new Map());

      const transformer = createResultTransformer({
        conversationTokenEstimate: 1,
        toolRegistry,
        toolManager: createMockToolManager(),
        resultStore,
      });

      const toolCall = makeToolCallWithResult('call-1', 'search', [
        { tool_result_id: 'result-1', type: ToolResultType.other, data: { original: 'data' } },
      ]);

      const result = await transformer(toolCall);

      expect(result).toHaveLength(1);
      expect(result[0].data).toEqual({ original: 'data' });
    });

    it('falls back to original results when tool has no summarizeToolReturn', async () => {
      const toolWithoutSummarizer = {};

      const toolRegistry = createMockToolRegistry(
        new Map([['search', toolWithoutSummarizer as any]])
      );
      const resultStore = createMockResultStore(new Map());

      const transformer = createResultTransformer({
        conversationTokenEstimate: 1,
        toolRegistry,
        toolManager: createMockToolManager(),
        resultStore,
      });

      const toolCall = makeToolCallWithResult('call-1', 'search', [
        { tool_result_id: 'result-1', type: ToolResultType.other, data: { original: 'data' } },
      ]);

      const result = await transformer(toolCall);

      expect(result).toHaveLength(1);
      expect(result[0].data).toEqual({ original: 'data' });
    });

    it('falls back to original results when tool is not found', async () => {
      const toolRegistry = createMockToolRegistry(new Map());
      const resultStore = createMockResultStore(new Map());

      const transformer = createResultTransformer({
        conversationTokenEstimate: 1,
        toolRegistry,
        toolManager: createMockToolManager(),
        resultStore,
      });

      const toolCall = makeToolCallWithResult('call-1', 'unknown-tool', [
        { tool_result_id: 'result-1', type: ToolResultType.other, data: { original: 'data' } },
      ]);

      const result = await transformer(toolCall);

      expect(result).toHaveLength(1);
      expect(result[0].data).toEqual({ original: 'data' });
    });

    it('prefers toolManager summarizer over toolRegistry', async () => {
      const managerSummarizer = jest.fn((step: ToolCallWithResult) => [
        {
          tool_result_id: 'manager-summarized',
          type: ToolResultType.other,
          data: { summary: 'From manager' },
        },
      ]);

      const registrySummarizer = {
        summarizeToolReturn: jest.fn((step: ToolCallWithResult) => [
          {
            tool_result_id: 'registry-summarized',
            type: ToolResultType.other,
            data: { summary: 'From registry' },
          },
        ]),
      };

      const toolManager = createMockToolManager(new Map([['search', managerSummarizer]]));
      const toolRegistry = createMockToolRegistry(new Map([['search', registrySummarizer as any]]));
      const resultStore = createMockResultStore(new Map());

      const transformer = createResultTransformer({
        conversationTokenEstimate: 1,
        toolRegistry,
        toolManager,
        resultStore,
      });

      const toolCall = makeToolCallWithResult('call-1', 'search', [
        { tool_result_id: 'result-1', type: ToolResultType.other, data: { original: 'data' } },
      ]);

      const result = await transformer(toolCall);

      expect(managerSummarizer).toHaveBeenCalledWith(toolCall);
      expect(registrySummarizer.summarizeToolReturn).not.toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0].data).toEqual({ summary: 'From manager', _summary: true });
    });

    it('falls back to toolRegistry when toolManager has no summarizer', async () => {
      const registrySummarizer = {
        summarizeToolReturn: jest.fn((step: ToolCallWithResult) => [
          {
            tool_result_id: 'registry-summarized',
            type: ToolResultType.other,
            data: { summary: 'From registry' },
          },
        ]),
      };

      const toolManager = createMockToolManager(new Map());
      const toolRegistry = createMockToolRegistry(new Map([['search', registrySummarizer as any]]));
      const resultStore = createMockResultStore(new Map());

      const transformer = createResultTransformer({
        conversationTokenEstimate: 1,
        toolRegistry,
        toolManager,
        resultStore,
      });

      const toolCall = makeToolCallWithResult('call-1', 'search', [
        { tool_result_id: 'result-1', type: ToolResultType.other, data: { original: 'data' } },
      ]);

      const result = await transformer(toolCall);

      expect(toolManager.getSummarizer).toHaveBeenCalledWith('search');
      expect(registrySummarizer.summarizeToolReturn).toHaveBeenCalledWith(toolCall);
      expect(result).toHaveLength(1);
      expect(result[0].data).toEqual({ summary: 'From registry', _summary: true });
    });
  });

  describe('filestore substitution', () => {
    it('substitutes results above threshold with file references', async () => {
      const toolRegistry = createMockToolRegistry(new Map([['search', {} as any]]));

      const entries = new Map<string, FileEntry>();
      entries.set(
        'result-1',
        createFileEntry('/search_call-1/result.json', FS_TOOL_CALL_TOKEN_THRESHOLD + 100, {
          large: 'data',
        })
      );
      const resultStore = createMockResultStore(entries);

      const transformer = createResultTransformer({
        conversationTokenEstimate: 1,
        toolRegistry,
        toolManager: createMockToolManager(),
        resultStore,
        conversationTokenThreshold: 0,
      });

      const toolCall = makeToolCallWithResult('call-1', 'search', [
        { tool_result_id: 'result-1', type: ToolResultType.other, data: { large: 'data' } },
      ]);

      const result = await transformer(toolCall);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe(ToolResultType.fileReference);
      expect(result[0].data).toMatchObject({
        filepath: '/tool_calls/search_call-1/result.json',
        _summary: true,
      });
    });

    it('keeps results below threshold as-is', async () => {
      const toolRegistry = createMockToolRegistry(new Map([['search', {} as any]]));

      const entries = new Map<string, FileEntry>();
      entries.set(
        'result-1',
        createFileEntry('/search_call-1/result.json', 100, { small: 'data' })
      );
      const resultStore = createMockResultStore(entries);

      const transformer = createResultTransformer({
        conversationTokenEstimate: 1,
        toolRegistry,
        toolManager: createMockToolManager(),
        resultStore,
        conversationTokenThreshold: 0,
      });

      const toolCall = makeToolCallWithResult('call-1', 'search', [
        { tool_result_id: 'result-1', type: ToolResultType.other, data: { small: 'data' } },
      ]);

      const result = await transformer(toolCall);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe(ToolResultType.other);
      expect(result[0].data).toEqual({ small: 'data' });
    });

    it('keeps results when not found in filestore', async () => {
      const toolRegistry = createMockToolRegistry(new Map([['search', {} as any]]));
      const resultStore = createMockResultStore(new Map());

      const transformer = createResultTransformer({
        conversationTokenEstimate: 1,
        toolRegistry,
        toolManager: createMockToolManager(),
        resultStore,
        conversationTokenThreshold: 0,
      });

      const toolCall = makeToolCallWithResult('call-1', 'search', [
        { tool_result_id: 'result-1', type: ToolResultType.other, data: { some: 'data' } },
      ]);

      const result = await transformer(toolCall);

      expect(result).toHaveLength(1);
      expect(result[0].data).toEqual({ some: 'data' });
    });

    it('forces filestore substitution when the forceFilestoreSubstitution option is set', async () => {
      const toolRegistry = createMockToolRegistry(new Map([['search', {} as any]]));

      const entries = new Map<string, FileEntry>();
      entries.set(
        'result-1',
        createFileEntry('/search_call-1/result.json', FS_TOOL_CALL_TOKEN_THRESHOLD + 100, {
          large: 'data',
        })
      );
      const resultStore = createMockResultStore(entries);

      // Conversation gate is off (estimate well below threshold), but the caller forces it on.
      const transformer = createResultTransformer({
        conversationTokenEstimate: 1,
        toolRegistry,
        toolManager: createMockToolManager(),
        resultStore,
        conversationTokenThreshold: 1_000_000,
      });

      const toolCall = makeToolCallWithResult('call-1', 'search', [
        { tool_result_id: 'result-1', type: ToolResultType.other, data: { large: 'data' } },
      ]);

      const withoutForce = await transformer(toolCall);
      expect(withoutForce[0].type).toBe(ToolResultType.other);

      const withForce = await transformer(toolCall, { forceFilestoreSubstitution: true });
      expect(withForce[0].type).toBe(ToolResultType.fileReference);
    });
  });

  describe('summarization and filestore interaction', () => {
    it('does not apply filestore substitution to summarized results', async () => {
      const toolWithSummarizer = {
        summarizeToolReturn: jest.fn(() => [
          {
            tool_result_id: 'summarized',
            type: ToolResultType.other,
            data: { summary: 'Summarized data' },
          },
        ]),
      };

      const toolRegistry = createMockToolRegistry(new Map([['search', toolWithSummarizer as any]]));

      // Even if we have large file entries, summarized results should not be substituted
      const entries = new Map<string, FileEntry>();
      entries.set(
        'result-1',
        createFileEntry('/search_call-1/result.json', FS_TOOL_CALL_TOKEN_THRESHOLD + 1000, {
          summary: 'Summarized data',
        })
      );
      const resultStore = createMockResultStore(entries);

      const transformer = createResultTransformer({
        conversationTokenEstimate: 1,
        toolRegistry,
        toolManager: createMockToolManager(),
        resultStore,
        conversationTokenThreshold: 0,
      });

      const toolCall = makeToolCallWithResult('call-1', 'search', [
        { tool_result_id: 'result-1', type: ToolResultType.other, data: { original: 'data' } },
      ]);

      const result = await transformer(toolCall);

      // Should get the summarized result, not a file reference
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe(ToolResultType.other);
      expect(result[0].data).toMatchObject({ summary: 'Summarized data' });
    });
  });

  describe('cleaned marker handling', () => {
    it('skips processing for already cleaned results', async () => {
      const toolWithSummarizer = {
        summarizeToolReturn: jest.fn(),
      };

      const toolRegistry = createMockToolRegistry(new Map([['search', toolWithSummarizer as any]]));
      const resultStore = createMockResultStore(new Map());

      const transformer = createResultTransformer({
        conversationTokenEstimate: 1,
        toolRegistry,
        toolManager: createMockToolManager(),
        resultStore,
      });

      const toolCall = makeToolCallWithResult('call-1', 'search', [
        {
          tool_result_id: 'result-1',
          type: ToolResultType.other,
          data: { already: 'cleaned', _summary: true },
        },
      ]);

      const result = await transformer(toolCall);

      // Should not call summarizer for already cleaned results
      expect(toolWithSummarizer.summarizeToolReturn).not.toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0].data).toEqual({ already: 'cleaned', _summary: true });
    });

    it('adds cleaned marker to summarized results', async () => {
      const toolWithSummarizer = {
        summarizeToolReturn: jest.fn(() => [
          {
            tool_result_id: 'summarized',
            type: ToolResultType.other,
            data: { summary: 'data' },
          },
        ]),
      };

      const toolRegistry = createMockToolRegistry(new Map([['search', toolWithSummarizer as any]]));
      const resultStore = createMockResultStore(new Map());

      const transformer = createResultTransformer({
        conversationTokenEstimate: 1,
        toolRegistry,
        toolManager: createMockToolManager(),
        resultStore,
      });

      const toolCall = makeToolCallWithResult('call-1', 'search', [
        { tool_result_id: 'result-1', type: ToolResultType.other, data: { original: 'data' } },
      ]);

      const result = await transformer(toolCall);

      expect(result[0].data).toMatchObject({
        summary: 'data',
        _summary: true,
      });
    });
  });

  describe('empty and edge cases', () => {
    it('returns empty array for empty results', async () => {
      const toolRegistry = createMockToolRegistry(new Map());
      const resultStore = createMockResultStore(new Map());

      const transformer = createResultTransformer({
        conversationTokenEstimate: 1,
        toolRegistry,
        toolManager: createMockToolManager(),
        resultStore,
      });

      const toolCall = makeToolCallWithResult('call-1', 'search', []);

      const result = await transformer(toolCall);

      expect(result).toHaveLength(0);
    });

    it('respects custom toolCallTokenThreshold parameter', async () => {
      const toolRegistry = createMockToolRegistry(new Map([['search', {} as any]]));

      const entries = new Map<string, FileEntry>();
      // Token count of 200 - above custom threshold of 100
      entries.set('result-1', createFileEntry('/search_call-1/result.json', 200, { some: 'data' }));
      const resultStore = createMockResultStore(entries);

      const transformer = createResultTransformer({
        conversationTokenEstimate: 1,
        toolRegistry,
        toolManager: createMockToolManager(),
        resultStore,
        conversationTokenThreshold: 0,
        toolCallTokenThreshold: 100,
      });

      const toolCall = makeToolCallWithResult('call-1', 'search', [
        { tool_result_id: 'result-1', type: ToolResultType.other, data: { some: 'data' } },
      ]);

      const result = await transformer(toolCall);

      expect(result[0].type).toBe(ToolResultType.fileReference);
    });

    it('skips filestore substitution when conversation token count is below conversationTokenThreshold', async () => {
      const toolRegistry = createMockToolRegistry(new Map([['search', {} as any]]));

      const entries = new Map<string, FileEntry>();
      entries.set(
        'result-1',
        createFileEntry('/search_call-1/result.json', FS_TOOL_CALL_TOKEN_THRESHOLD + 100, {
          large: 'data',
        })
      );
      const resultStore = createMockResultStore(entries);

      // conversationTokenThreshold is very high — empty conversation won't exceed it
      const transformer = createResultTransformer({
        conversationTokenEstimate: 1,
        toolRegistry,
        toolManager: createMockToolManager(),
        resultStore,
        conversationTokenThreshold: 1_000_000,
      });

      const toolCall = makeToolCallWithResult('call-1', 'search', [
        { tool_result_id: 'result-1', type: ToolResultType.other, data: { large: 'data' } },
      ]);

      const result = await transformer(toolCall);

      // Filestore substitution should NOT happen because conversation token count is too low
      expect(result[0].type).toBe(ToolResultType.other);
      expect(result[0].data).toEqual({ large: 'data' });
    });
  });
});
