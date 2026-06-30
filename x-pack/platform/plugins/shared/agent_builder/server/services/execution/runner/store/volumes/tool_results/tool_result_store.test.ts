/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  Conversation,
  ConversationRound,
  ToolCallWithResult,
  ToolResult,
} from '@kbn/agent-builder-common';
import { ToolResultType, ConversationRoundStepType } from '@kbn/agent-builder-common';
import type { FsEntry } from '@kbn/agent-builder-server/runner/filestore';
import { FileEntryType } from '@kbn/agent-builder-server/runner/filestore';
import { ToolResultStoreImpl, createResultStore } from './tool_result_store';
import type { ToolCallMetaContent } from './types';

describe('ToolResultStoreImpl', () => {
  const makeResult = (id: string, data: Record<string, unknown> = {}): ToolResult => ({
    tool_result_id: id,
    type: ToolResultType.other,
    data,
  });

  const makeToolCall = (overrides: Partial<ToolCallWithResult> = {}): ToolCallWithResult => ({
    tool_call_id: 'call-1',
    tool_id: 'platform.core.list_indices',
    params: { pattern: 'logs-*' },
    results: [makeResult('r1', { doc: '1' })],
    ...overrides,
  });

  const dirName = (entry: FsEntry) => entry.path.split('/').pop();

  describe('add — single result', () => {
    it('writes meta.json + result.json under {sanitizeToolId}_{tool_call_id}', async () => {
      const store = new ToolResultStoreImpl({});
      store.add(makeToolCall());

      const dir = '/platform_core_list_indices_call-1';
      const files = (await store.listEntries(dir)).map((e) => dirName(e)).sort();
      expect(files).toEqual(['meta.json', 'result.json']);

      const resultEntry = await store.getEntry(`${dir}/result.json`);
      expect(resultEntry?.content.raw).toEqual({ doc: '1' });
    });

    it('exposes the call directory under /tool_calls when listing the mount root path', async () => {
      const store = new ToolResultStoreImpl({});
      store.add(makeToolCall());
      const entries = await store.listEntries('/');
      expect(entries.map((e) => e.path)).toContain('/platform_core_list_indices_call-1');
    });
  });

  describe('add — multiple results', () => {
    it('uses 1-based result_N.json filenames', async () => {
      const store = new ToolResultStoreImpl({});
      store.add(
        makeToolCall({
          results: [makeResult('r1', { doc: '1' }), makeResult('r2', { doc: '2' })],
        })
      );

      const dir = '/platform_core_list_indices_call-1';
      const files = (await store.listEntries(dir)).map((e) => dirName(e)).sort();
      expect(files).toEqual(['meta.json', 'result_1.json', 'result_2.json']);

      expect((await store.getEntry(`${dir}/result_1.json`))?.content.raw).toEqual({ doc: '1' });
      expect((await store.getEntry(`${dir}/result_2.json`))?.content.raw).toEqual({ doc: '2' });
    });
  });

  describe('meta.json', () => {
    it('contains tool id, call id, params and an accurate results manifest', async () => {
      const store = new ToolResultStoreImpl({});
      store.add(
        makeToolCall({
          results: [
            makeResult('r1', { doc: '1' }),
            { tool_result_id: 'r2', type: ToolResultType.resourceList, data: { doc: '2' } },
          ],
        })
      );

      const metaEntry = await store.getEntry('/platform_core_list_indices_call-1/meta.json');
      expect(metaEntry?.metadata.type).toBe(FileEntryType.toolCallMeta);
      expect(metaEntry?.metadata.token_count).toBeGreaterThan(0);

      const meta = metaEntry?.content.raw as ToolCallMetaContent;
      expect(meta).toEqual({
        tool_call_id: 'call-1',
        tool_id: 'platform.core.list_indices',
        params: { pattern: 'logs-*' },
        results: [
          { file: 'result_1.json', type: ToolResultType.other, tool_result_id: 'r1' },
          { file: 'result_2.json', type: ToolResultType.resourceList, tool_result_id: 'r2' },
        ],
      });
    });
  });

  describe('getEntryByResultId', () => {
    it('returns the mount-relative entry for a result id', async () => {
      const store = new ToolResultStoreImpl({});
      store.add(makeToolCall({ results: [makeResult('r1'), makeResult('r2')] }));

      const entry = await store.getEntryByResultId('r2');
      expect(entry?.path).toBe('/platform_core_list_indices_call-1/result_2.json');
    });

    it('returns undefined for an unknown result id', async () => {
      const store = new ToolResultStoreImpl({});
      store.add(makeToolCall());
      expect(await store.getEntryByResultId('nope')).toBeUndefined();
    });
  });

  describe('has / get', () => {
    it('serves results by id for the tool-handler context', () => {
      const store = new ToolResultStoreImpl({});
      store.add(makeToolCall({ results: [makeResult('r1', { doc: '1' })] }));

      expect(store.has('r1')).toBe(true);
      expect(store.get('r1')).toEqual(makeResult('r1', { doc: '1' }));
      expect(store.has('missing')).toBe(false);
      expect(() => store.get('missing')).toThrow();
    });
  });

  describe('asReadonly', () => {
    it('exposes getEntryByResultId', async () => {
      const store = new ToolResultStoreImpl({});
      store.add(makeToolCall());
      const readonly = store.asReadonly();
      expect((await readonly.getEntryByResultId('r1'))?.path).toBe(
        '/platform_core_list_indices_call-1/result.json'
      );
    });
  });

  describe('reconstruct vs. live', () => {
    it('produces the same directory and files whether built live or replayed from persisted steps', async () => {
      const toolCall = makeToolCall({
        results: [makeResult('r1', { doc: '1' }), makeResult('r2', { doc: '2' })],
      });

      const liveStore = new ToolResultStoreImpl({});
      liveStore.add(toolCall);

      const round = {
        steps: [{ type: ConversationRoundStepType.toolCall, ...toolCall, progression: [] }],
      } as unknown as ConversationRound;
      const conversation = { rounds: [round] } as unknown as Conversation;
      const reconstructedStore = createResultStore({ conversation });

      const dir = '/platform_core_list_indices_call-1';
      const liveFiles = (await liveStore.listEntries(dir)).map((e) => dirName(e)).sort();
      const reconstructedFiles = (await reconstructedStore.listEntries(dir))
        .map((e) => dirName(e))
        .sort();

      expect(reconstructedFiles).toEqual(liveFiles);
      expect(reconstructedFiles).toEqual(['meta.json', 'result_1.json', 'result_2.json']);

      const liveMeta = await liveStore.getEntry(`${dir}/meta.json`);
      const reconstructedMeta = await reconstructedStore.getEntry(`${dir}/meta.json`);
      expect(reconstructedMeta?.content.raw).toEqual(liveMeta?.content.raw);
    });
  });
});
