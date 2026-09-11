/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { agentBuilderMocks } from '@kbn/agent-builder-plugin/server/mocks';
import { contextEngineAiIndexTools } from '@kbn/agent-builder-common/tools';
import { ToolResultType } from '@kbn/agent-builder-common/tools/tool_result';
import { MAX_AI_INDEX_ID_LENGTH } from '@kbn/context-engine-plugin/common/constants';
import { CONTEXT_ENGINE_READ_DENIED_MESSAGE } from '../ai_index_read_service';
import { createAiIndexToolDepsMock } from '../ai_index_read_service.mock';
import { aiIndexToolsAvailability } from '../ai_index_tools_availability';
import { createDescribeAiIndexTool } from './tool';

describe('describe_ai_index tool', () => {
  it('is a read-only, MCP-exposed tool gated by the shared availability', () => {
    const tool = createDescribeAiIndexTool(createAiIndexToolDepsMock().deps);

    expect(tool.id).toBe(contextEngineAiIndexTools.describeAiIndex);
    expect(tool.annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    });
    expect(tool.availability).toBe(aiIndexToolsAvailability);
    expect(tool.maxResultTokens).toBeGreaterThan(0);
    expect(tool.confirmation).toBeUndefined();
    expect(tool.excludeFromMcp).toBeUndefined();
  });

  it('bounds and validates the id', () => {
    const { schema } = createDescribeAiIndexTool(createAiIndexToolDepsMock().deps);

    expect(schema.safeParse({ ai_index_id: 'runbooks' }).success).toBe(true);
    expect(schema.safeParse({ ai_index_id: '' }).success).toBe(false);
    expect(schema.safeParse({ ai_index_id: 'Not Valid' }).success).toBe(false);
    expect(schema.safeParse({ ai_index_id: 'a'.repeat(MAX_AI_INDEX_ID_LENGTH + 1) }).success).toBe(
      false
    );
  });

  it('wraps the context block in an object', async () => {
    const { deps, readService } = createAiIndexToolDepsMock();
    readService.describe.mockResolvedValue({ response: '# AI index: runbooks' });

    const result = await createDescribeAiIndexTool(deps).handler(
      { ai_index_id: 'runbooks' },
      agentBuilderMocks.tools.createHandlerContext()
    );

    expect(result).toEqual({
      results: [{ type: ToolResultType.other, data: { response: '# AI index: runbooks' } }],
    });
  });

  it('returns the thrown message as an error result', async () => {
    const { deps, readService } = createAiIndexToolDepsMock();
    readService.describe.mockRejectedValue(new Error("AI index 'missing' not found"));

    const result = await createDescribeAiIndexTool(deps).handler(
      { ai_index_id: 'missing' },
      agentBuilderMocks.tools.createHandlerContext()
    );

    expect(result).toEqual({
      results: [{ type: ToolResultType.error, data: { message: "AI index 'missing' not found" } }],
    });
  });

  it('returns an error result when the caller lacks the read privilege', async () => {
    const { deps } = createAiIndexToolDepsMock({ authorized: false });

    const result = await createDescribeAiIndexTool(deps).handler(
      { ai_index_id: 'runbooks' },
      agentBuilderMocks.tools.createHandlerContext()
    );

    expect(result).toEqual({
      results: [
        { type: ToolResultType.error, data: { message: CONTEXT_ENGINE_READ_DENIED_MESSAGE } },
      ],
    });
  });
});
