/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ScopedModel } from '@kbn/agent-builder-server';
import { ToolResultType } from '@kbn/agent-builder-common/tools';

import { WorkflowInsightType } from '../../../../../../common/endpoint/types/workflow_insights';
import { securityWorkflowInsightsService } from '../../../../../endpoint/services';
import { createGenerateInsightGraph } from './graph';

jest.mock('../../../../../endpoint/services', () => ({
  securityWorkflowInsightsService: {
    createFromDefendInsights: jest.fn(),
  },
}));

const mockCreateFromDefendInsights =
  securityWorkflowInsightsService.createFromDefendInsights as jest.Mock;

describe('createGenerateInsightGraph', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('passes the active space ID when creating workflow insights', async () => {
    const defendInsights = [
      {
        group: 'TestAV',
        events: [
          {
            id: 'event-1',
            endpointId: 'endpoint-1',
            value: '/path/to/process',
          },
        ],
      },
    ];
    const workflowInsights = [{ id: 'workflow-insight-1' }];
    const withStructuredOutput = jest
      .fn()
      .mockReturnValueOnce({
        invoke: jest
          .fn()
          .mockResolvedValue({ insightType: WorkflowInsightType.enum.incompatible_antivirus }),
      })
      .mockReturnValueOnce({
        invoke: jest.fn().mockResolvedValue({ insights: defendInsights }),
      });
    const model = {
      chatModel: {
        name: 'model-name',
        withStructuredOutput,
      },
      connector: {
        connectorId: 'connector-id',
      },
    } as unknown as ScopedModel;
    mockCreateFromDefendInsights.mockResolvedValueOnce(workflowInsights);

    const graph = createGenerateInsightGraph({
      model,
      problemDescription: 'configuration issue detected',
      remediation: 'fix the thing',
      endpointIds: ['endpoint-1'],
      data: [{ event: { type: 'process' } }],
      spaceId: 'space-1',
    });

    const result = await graph.invoke({});

    expect(mockCreateFromDefendInsights).toHaveBeenCalledWith(
      defendInsights,
      ['endpoint-1'],
      WorkflowInsightType.enum.incompatible_antivirus,
      'connector-id',
      'model-name',
      'space-1'
    );
    expect(result.results).toEqual([
      {
        type: ToolResultType.other,
        data: {
          workflowInsights,
        },
      },
    ]);
  });
});
