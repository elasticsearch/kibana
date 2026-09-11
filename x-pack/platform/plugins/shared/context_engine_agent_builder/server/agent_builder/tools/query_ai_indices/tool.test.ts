/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { agentBuilderMocks } from '@kbn/agent-builder-plugin/server/mocks';
import { contextEngineAiIndexTools } from '@kbn/agent-builder-common/tools';
import { ToolResultType } from '@kbn/agent-builder-common/tools/tool_result';
import {
  DEFAULT_AI_INDEX_QUERY_LIMIT,
  MAX_AI_INDEX_QUERY_LENGTH,
  MAX_AI_INDEX_QUERY_LIMIT,
  MAX_AI_INDEX_QUERY_PARAMS,
  MAX_AI_INDEX_QUERY_PARAM_VALUE_LENGTH,
} from '@kbn/context-engine-plugin/common/constants';
import { CONTEXT_ENGINE_READ_DENIED_MESSAGE } from '../ai_index_read_service';
import { createAiIndexToolDepsMock } from '../ai_index_read_service.mock';
import { aiIndexToolsAvailability } from '../ai_index_tools_availability';
import { createQueryAiIndicesTool } from './tool';

describe('query_ai_indices tool', () => {
  const columns = [{ name: 'title', type: 'keyword' }];
  const values = [['Runbook A']];

  it('is a read-only, MCP-exposed tool gated by the shared availability', () => {
    const tool = createQueryAiIndicesTool(createAiIndexToolDepsMock().deps);

    expect(tool.id).toBe(contextEngineAiIndexTools.queryAiIndices);
    expect(tool.annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    });
    expect(tool.availability).toBe(aiIndexToolsAvailability);
    expect(tool.confirmation).toBeUndefined();
    expect(tool.excludeFromMcp).toBeUndefined();
  });

  describe('schema', () => {
    const { schema } = createQueryAiIndicesTool(createAiIndexToolDepsMock().deps);

    it('accepts query, params and limit only', () => {
      const parsed = schema.parse({
        query: 'FROM ai-index-runbooks',
        params: { kind: 'dashboard', n: 1, flag: true },
        limit: 10,
      });

      expect(parsed).toEqual({
        query: 'FROM ai-index-runbooks',
        params: { kind: 'dashboard', n: 1, flag: true },
        limit: 10,
      });
      expect(schema.shape).not.toHaveProperty('time_range');
      expect(schema.shape).not.toHaveProperty('filter');
    });

    it('defaults the limit', () => {
      expect(schema.parse({ query: 'FROM ai-index-runbooks' }).limit).toBe(
        DEFAULT_AI_INDEX_QUERY_LIMIT
      );
    });

    it('bounds query, params and limit', () => {
      const query = 'FROM ai-index-runbooks';

      expect(schema.safeParse({ query: '' }).success).toBe(false);
      expect(schema.safeParse({ query: 'a'.repeat(MAX_AI_INDEX_QUERY_LENGTH + 1) }).success).toBe(
        false
      );
      expect(schema.safeParse({ query, limit: 0 }).success).toBe(false);
      expect(schema.safeParse({ query, limit: 1.5 }).success).toBe(false);
      expect(schema.safeParse({ query, limit: MAX_AI_INDEX_QUERY_LIMIT + 1 }).success).toBe(false);
      expect(
        schema.safeParse({
          query,
          params: { k: 'v'.repeat(MAX_AI_INDEX_QUERY_PARAM_VALUE_LENGTH + 1) },
        }).success
      ).toBe(false);
      expect(
        schema.safeParse({
          query,
          params: Object.fromEntries(
            Array.from({ length: MAX_AI_INDEX_QUERY_PARAMS + 1 }, (_, i) => [`p${i}`, i])
          ),
        }).success
      ).toBe(false);
    });
  });

  it('returns the rows as a non-replayable result', async () => {
    const { deps, readService } = createAiIndexToolDepsMock();
    readService.query.mockResolvedValue({ columns, values });

    const result = await createQueryAiIndicesTool(deps).handler(
      { query: 'FROM ai-index-runbooks | LIMIT 5', limit: 5 },
      agentBuilderMocks.tools.createHandlerContext()
    );

    expect(readService.query).toHaveBeenCalledWith({
      query: 'FROM ai-index-runbooks | LIMIT 5',
      params: undefined,
      limit: 5,
    });
    // Not esqlResults: UI would replay query without server-side space filter.
    expect(result).toEqual({
      results: [{ type: ToolResultType.other, data: { columns, values } }],
    });
  });

  it('returns the thrown message as an error result', async () => {
    const { deps, readService } = createAiIndexToolDepsMock();
    readService.query.mockRejectedValue(new Error('parsing_exception: mismatched input'));

    const result = await createQueryAiIndicesTool(deps).handler(
      { query: 'FROM', limit: DEFAULT_AI_INDEX_QUERY_LIMIT },
      agentBuilderMocks.tools.createHandlerContext()
    );

    expect(result).toEqual({
      results: [
        { type: ToolResultType.error, data: { message: 'parsing_exception: mismatched input' } },
      ],
    });
  });

  it('returns an error result when the caller lacks the read privilege', async () => {
    const { deps, readService } = createAiIndexToolDepsMock({ authorized: false });

    const result = await createQueryAiIndicesTool(deps).handler(
      { query: 'FROM ai-index-runbooks', limit: DEFAULT_AI_INDEX_QUERY_LIMIT },
      agentBuilderMocks.tools.createHandlerContext()
    );

    expect(result).toEqual({
      results: [
        { type: ToolResultType.error, data: { message: CONTEXT_ENGINE_READ_DENIED_MESSAGE } },
      ],
    });
    expect(readService.query).not.toHaveBeenCalled();
  });
});
