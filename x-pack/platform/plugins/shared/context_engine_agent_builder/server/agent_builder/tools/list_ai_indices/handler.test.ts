/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { elasticsearchServiceMock } from '@kbn/core/server/mocks';
import { httpServerMock } from '@kbn/core-http-server-mocks';
import type { AiIndexHttpItem } from '@kbn/context-engine-plugin/common/http_api/ai_indices';
import type { AgentConfiguration } from '@kbn/agent-builder-common';
import { CONTEXT_ENGINE_READ_DENIED_MESSAGE } from '../ai_index_read_service';
import { createAiIndexToolDepsMock } from '../ai_index_read_service.mock';
import { listAiIndicesHandler } from './handler';

const aiIndex = (id: string, managed = false): AiIndexHttpItem =>
  ({
    id,
    managed,
    description: `${id} description`,
    dest: { type: 'index', value: `ai-index-${id}` },
    date_created: '2026-01-01T00:00:00.000Z',
    date_modified: '2026-01-01T00:00:00.000Z',
  } as AiIndexHttpItem);

describe('listAiIndicesHandler', () => {
  const baseContext = {
    esClient: elasticsearchServiceMock.createScopedClusterClient(),
    request: httpServerMock.createKibanaRequest(),
  };

  it('maps visible indices and omits assigned_to_agent without an agent', async () => {
    const { deps, readService } = createAiIndexToolDepsMock();
    readService.listVisible.mockResolvedValue([aiIndex('elastic', true), aiIndex('runbooks')]);

    const result = await listAiIndicesHandler({ deps, context: baseContext });

    expect(readService.listVisible).toHaveBeenCalledWith();
    expect(result).toEqual({
      ai_indices: [
        {
          id: 'elastic',
          esql_target: 'ai-index-elastic',
          description: 'elastic description',
          managed: true,
        },
        {
          id: 'runbooks',
          esql_target: 'ai-index-runbooks',
          description: 'runbooks description',
          managed: false,
        },
      ],
    });
    expect(result.ai_indices[0]).not.toHaveProperty('assigned_to_agent');
  });

  it('flags which indices the running agent is configured with', async () => {
    const { deps, readService } = createAiIndexToolDepsMock();
    readService.listVisible.mockResolvedValue([aiIndex('elastic'), aiIndex('runbooks')]);

    const result = await listAiIndicesHandler({
      deps,
      context: {
        ...baseContext,
        agentConfiguration: { ai_indices: ['runbooks'] } as AgentConfiguration,
      },
    });

    expect(result.ai_indices.map(({ id, assigned_to_agent }) => [id, assigned_to_agent])).toEqual([
      ['elastic', false],
      ['runbooks', true],
    ]);
  });

  it('treats an agent with no ai_indices as assigning none', async () => {
    const { deps, readService } = createAiIndexToolDepsMock();
    readService.listVisible.mockResolvedValue([aiIndex('elastic')]);

    const result = await listAiIndicesHandler({
      deps,
      context: { ...baseContext, agentConfiguration: {} as AgentConfiguration },
    });

    expect(result.ai_indices[0].assigned_to_agent).toBe(false);
  });

  it('fails closed without the read privilege', async () => {
    const { deps, readService } = createAiIndexToolDepsMock({ authorized: false });

    await expect(listAiIndicesHandler({ deps, context: baseContext })).rejects.toThrow(
      CONTEXT_ENGINE_READ_DENIED_MESSAGE
    );
    expect(readService.listVisible).not.toHaveBeenCalled();
  });
});
