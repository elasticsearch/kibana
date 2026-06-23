/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ToolCallWithResult, ToolResult } from '@kbn/agent-builder-common';
import { ToolResultType } from '@kbn/agent-builder-common';
import type { ToolManager } from '@kbn/agent-builder-server/runner';
import type { ToolRegistry } from '@kbn/agent-builder-server';
import {
  areAllResultsCleaned,
  createSummarizationTransformer,
  isSummaryResult,
  markResultAsCleaned,
  tryToolSummarization,
} from './tool_summarization';

const makeToolCall = (toolId: string, results: ToolResult[]): ToolCallWithResult => ({
  tool_call_id: 'call-1',
  tool_id: toolId,
  params: {},
  results,
});

const otherResult = (id: string, data: Record<string, unknown>): ToolResult => ({
  tool_result_id: id,
  type: ToolResultType.other,
  data,
});

const createMockToolManager = (
  summarizers: Map<
    string,
    (step: ToolCallWithResult) => ToolResult[] | null | undefined
  > = new Map()
): ToolManager =>
  ({
    getSummarizer: jest.fn((toolId: string) => summarizers.get(toolId)),
  } as unknown as ToolManager);

const createMockToolRegistry = (
  tools: Map<string, { summarizeToolReturn?: (step: ToolCallWithResult) => ToolResult[] | null }>
): ToolRegistry =>
  ({
    get: jest.fn(async (toolId: string) => tools.get(toolId)),
  } as unknown as ToolRegistry);

describe('tool_summarization markers', () => {
  it('isSummaryResult detects the marker', () => {
    expect(isSummaryResult({ _summary: true })).toBe(true);
    expect(isSummaryResult({ foo: 'bar' })).toBe(false);
    expect(isSummaryResult(null)).toBe(false);
    expect(isSummaryResult('str')).toBe(false);
  });

  it('markResultAsCleaned adds the marker and is idempotent', () => {
    const cleaned = markResultAsCleaned(otherResult('r1', { foo: 'bar' }));
    expect(cleaned.data).toEqual({ foo: 'bar', _summary: true });
    expect(markResultAsCleaned(cleaned)).toBe(cleaned);
  });

  it('areAllResultsCleaned requires every result to be cleaned', () => {
    expect(areAllResultsCleaned([otherResult('r1', { _summary: true })])).toBe(true);
    expect(
      areAllResultsCleaned([otherResult('r1', { _summary: true }), otherResult('r2', { a: 1 })])
    ).toBe(false);
  });
});

describe('tryToolSummarization', () => {
  it('prefers the tool manager summarizer over the registry', async () => {
    const manager = createMockToolManager(
      new Map([['search', () => [otherResult('s', { summary: 'manager' })]]])
    );
    const registry = createMockToolRegistry(
      new Map([
        ['search', { summarizeToolReturn: () => [otherResult('s', { summary: 'registry' })] }],
      ])
    );

    const out = await tryToolSummarization(
      makeToolCall('search', [otherResult('r', {})]),
      manager,
      registry
    );
    expect(out?.[0].data).toEqual({ summary: 'manager' });
  });

  it('falls back to the registry when the manager has no summarizer', async () => {
    const registrySummarizer = jest.fn(() => [otherResult('s', { summary: 'registry' })]);
    const registry = createMockToolRegistry(
      new Map([['search', { summarizeToolReturn: registrySummarizer }]])
    );

    const out = await tryToolSummarization(
      makeToolCall('search', [otherResult('r', {})]),
      createMockToolManager(),
      registry
    );
    expect(registrySummarizer).toHaveBeenCalled();
    expect(out?.[0].data).toEqual({ summary: 'registry' });
  });

  it('returns undefined when no summarizer applies', async () => {
    const out = await tryToolSummarization(
      makeToolCall('search', [otherResult('r', {})]),
      createMockToolManager(),
      createMockToolRegistry(new Map([['search', {}]]))
    );
    expect(out).toBeUndefined();
  });

  it('returns undefined and does not throw when registry lookup fails', async () => {
    const registry = createMockToolRegistry(new Map());
    (registry.get as jest.Mock).mockRejectedValueOnce(new Error('not found'));

    const out = await tryToolSummarization(
      makeToolCall('evicted', [otherResult('r', {})]),
      createMockToolManager(),
      registry
    );
    expect(out).toBeUndefined();
  });
});

describe('createSummarizationTransformer', () => {
  it('applies summarization and marks results cleaned', async () => {
    const transformer = createSummarizationTransformer({
      toolManager: createMockToolManager(
        new Map([['search', () => [otherResult('s', { summary: 'x' })]]])
      ),
      toolRegistry: createMockToolRegistry(new Map()),
    });

    const out = await transformer(makeToolCall('search', [otherResult('r', { big: 'data' })]));
    expect(out[0].data).toEqual({ summary: 'x', _summary: true });
  });

  it('returns the original results unchanged when no summarizer applies', async () => {
    const transformer = createSummarizationTransformer({
      toolManager: createMockToolManager(),
      toolRegistry: createMockToolRegistry(new Map([['search', {}]])),
    });

    const toolCall = makeToolCall('search', [otherResult('r', { big: 'data' })]);
    expect(await transformer(toolCall)).toBe(toolCall.results);
  });

  it('skips already-cleaned results without invoking the summarizer', async () => {
    const summarizer = jest.fn(() => [otherResult('s', { summary: 'x' })]);
    const transformer = createSummarizationTransformer({
      toolManager: createMockToolManager(new Map([['search', summarizer]])),
      toolRegistry: createMockToolRegistry(new Map()),
    });

    const toolCall = makeToolCall('search', [
      otherResult('r', { already: 'clean', _summary: true }),
    ]);
    expect(await transformer(toolCall)).toBe(toolCall.results);
    expect(summarizer).not.toHaveBeenCalled();
  });
});
