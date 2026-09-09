/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { agentBuilderMocks } from '@kbn/agent-builder-plugin/server/mocks';
import { contextEngineAiIndexTools } from '@kbn/agent-builder-common/tools';
import { ToolResultType } from '@kbn/agent-builder-common/tools/tool_result';
import type { AiIndexHttpItem } from '@kbn/context-engine-plugin/common/http_api/ai_indices';
import { CONTEXT_ENGINE_READ_DENIED_MESSAGE } from '../ai_index_read_service';
import { createAiIndexToolDepsMock } from '../ai_index_read_service.mock';
import { aiIndexToolsAvailability } from '../ai_index_tools_availability';
import { createListAiIndicesTool } from './tool';

describe('list_ai_indices tool', () => {
  it('is a read-only, MCP-exposed tool gated by the shared availability', () => {
    const tool = createListAiIndicesTool(createAiIndexToolDepsMock().deps);

    expect(tool.id).toBe(contextEngineAiIndexTools.listAiIndices);
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

  it('returns the visible indices as an `other` result', async () => {
    const { deps, readService } = createAiIndexToolDepsMock();
    readService.listVisible.mockResolvedValue([
      {
        id: 'runbooks',
        managed: false,
        dest: { type: 'index', value: 'ai-index-runbooks' },
      } as AiIndexHttpItem,
    ]);

    const result = await createListAiIndicesTool(deps).handler(
      {},
      agentBuilderMocks.tools.createHandlerContext()
    );

    expect(result).toEqual({
      results: [
        {
          type: ToolResultType.other,
          data: {
            ai_indices: [{ id: 'runbooks', esql_target: 'ai-index-runbooks', managed: false }],
          },
        },
      ],
    });
  });

  it('returns an error result when the caller lacks the read privilege', async () => {
    const { deps } = createAiIndexToolDepsMock({ authorized: false });
    const context = agentBuilderMocks.tools.createHandlerContext();

    const result = await createListAiIndicesTool(deps).handler({}, context);

    expect(result).toEqual({
      results: [
        { type: ToolResultType.error, data: { message: CONTEXT_ENGINE_READ_DENIED_MESSAGE } },
      ],
    });
    expect(context.logger.error).toHaveBeenCalled();
  });
});
