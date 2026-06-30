/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core/server';
import moment from 'moment';

import type { EndpointMetadataService } from '../../metadata';
import type { BuildWorkflowInsightParams } from '.';
import {
  WorkflowInsightCategory,
  WorkflowInsightSourceType,
  WorkflowInsightTargetType,
  WorkflowInsightActionType,
} from '../../../../../common/endpoint/types/workflow_insights';
import { createMockEndpointAppContext } from '../../../mocks';
import { buildCustomWorkflowInsights } from './custom';

describe('buildCustomWorkflowInsights', () => {
  const mockEndpointAppContextService = createMockEndpointAppContext().service;
  mockEndpointAppContextService.getEndpointMetadataService = jest.fn().mockReturnValue({
    getMetadataForEndpoints: jest.fn(),
  });
  const endpointMetadataService =
    mockEndpointAppContextService.getEndpointMetadataService() as jest.Mocked<EndpointMetadataService>;

  const generateParams = (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    defendInsights: any[] = [
      {
        group: 'policy_response_failure:::Policy Response Failure:::Windows',
        events: [
          {
            id: 'event-1',
            endpointId: 'endpoint-1',
            value: 'policy.response.failure',
          },
        ],
        remediation: {
          message: 'Policy response failed. Please check endpoint connectivity.',
        },
      },
    ]
  ): BuildWorkflowInsightParams => ({
    defendInsights,
    options: {
      insightType: 'policy_response_failure',
      endpointIds: ['endpoint-1', 'endpoint-2'],
      connectorId: 'connector-id-1',
      model: 'gpt-4',
    },
    endpointMetadataService,
    esClient: {
      search: jest.fn().mockResolvedValue({
        hits: {
          hits: [],
        },
      }),
    } as unknown as ElasticsearchClient,
    ccsEnabled: false,
  });

  const buildExpectedInsight = (
    group: string,
    remediationMessage: string,
    remediationLink: string = ''
  ) =>
    expect.objectContaining({
      '@timestamp': expect.any(moment),
      message: 'Policy response failure detected',
      category: WorkflowInsightCategory.enum.endpoint,
      type: 'policy_response_failure',
      source: {
        type: WorkflowInsightSourceType.enum['llm-connector'],
        id: 'connector-id-1',
        data_range_start: expect.any(moment),
        data_range_end: expect.any(moment),
      },
      target: {
        type: WorkflowInsightTargetType.enum.endpoint,
        ids: ['endpoint-1', 'endpoint-2'],
      },
      action: {
        type: WorkflowInsightActionType.enum.refreshed,
        timestamp: expect.any(moment),
      },
      value: group,
      metadata: {
        notes: {
          llm_model: 'gpt-4',
        },
        display_name: group.split(':::')[1] || '',
      },
      remediation: {
        descriptive: remediationMessage,
        link: remediationLink,
      },
    });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should correctly build workflow insights with valid remediation', async () => {
    const params = generateParams();
    const result = await buildCustomWorkflowInsights(params);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(
      buildExpectedInsight(
        params.defendInsights[0].group,
        params.defendInsights[0].remediation?.message as string
      )
    );
  });

  it('should handle multiple insights with remediation', async () => {
    const params = generateParams([
      {
        group: 'policy_response_test1_failure:::Policy Response test1 failure:::Windows',
        events: [
          {
            id: 'event-1',
            endpointId: 'endpoint-1',
            value: 'policy.response.network.failure',
          },
        ],
        remediation: {
          message: 'Policy Response test1 failure detected.',
        },
      },
      {
        group: 'policy_response_test2_failure:::Policy Response test2 failure:::Windows',
        events: [
          {
            id: 'event-2',
            endpointId: 'endpoint-2',
            value: 'policy.response.auth.failure',
          },
        ],
        remediation: {
          message: 'Policy Response test2 failure detected.',
        },
      },
    ]);

    const result = await buildCustomWorkflowInsights(params);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(
      buildExpectedInsight(
        params.defendInsights[0].group,
        params.defendInsights[0].remediation?.message as string
      )
    );
    expect(result[1]).toEqual(
      buildExpectedInsight(
        params.defendInsights[1].group,
        params.defendInsights[1].remediation?.message as string
      )
    );
  });

  it('should filter out insights without remediation', async () => {
    const params = generateParams([
      {
        group: 'valid_insight:::Valid Insight:::Windows',
        events: [
          {
            id: 'event-1',
            endpointId: 'endpoint-1',
            value: 'valid.insight',
          },
        ],
        remediation: {
          message: 'This insight has remediation.',
        },
      },
      {
        group: 'invalid_insight:::Invalid Insight - No Remediation:::Windows',
        events: [
          {
            id: 'event-2',
            endpointId: 'endpoint-2',
            value: 'invalid.insight',
          },
        ],
        // No remediation property
      },
    ]);

    const result = await buildCustomWorkflowInsights(params);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(
      buildExpectedInsight(
        params.defendInsights[0].group,
        params.defendInsights[0].remediation?.message as string
      )
    );
  });

  it('should filter out insights with remediation but no message', async () => {
    const params = generateParams([
      {
        group: 'valid_insight:::Valid Insight:::Windows',
        events: [
          {
            id: 'event-1',
            endpointId: 'endpoint-1',
            value: 'valid.insight',
          },
        ],
        remediation: {
          message: 'This insight has a message.',
        },
      },
      {
        group: 'invalid_insight:::Invalid Insight - No Message:::Windows',
        events: [
          {
            id: 'event-2',
            endpointId: 'endpoint-2',
            value: 'invalid.insight',
          },
        ],
        remediation: {
          // No message property
        },
      },
    ]);

    const result = await buildCustomWorkflowInsights(params);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(
      buildExpectedInsight(
        params.defendInsights[0].group,
        params.defendInsights[0].remediation?.message as string
      )
    );
  });

  it('should filter out insights with empty remediation message', async () => {
    const params = generateParams([
      {
        group: 'valid_insight:::Valid Insight:::Windows',
        events: [
          {
            id: 'event-1',
            endpointId: 'endpoint-1',
            value: 'valid.insight',
          },
        ],
        remediation: {
          message: 'This insight has a valid message.',
        },
      },
      {
        group: 'invalid_insight:::Invalid Insight - Empty Message:::Windows',
        events: [
          {
            id: 'event-2',
            endpointId: 'endpoint-2',
            value: 'invalid.insight',
          },
        ],
        remediation: {
          message: '',
        },
      },
    ]);

    const result = await buildCustomWorkflowInsights(params);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(
      buildExpectedInsight(
        params.defendInsights[0].group,
        params.defendInsights[0].remediation?.message as string
      )
    );
  });

  it('should return empty array when no insights have valid remediation', async () => {
    const params = generateParams([
      {
        group: 'No Remediation',
        events: [
          {
            id: 'event-1',
            endpointId: 'endpoint-1',
            value: 'no.remediation',
          },
        ],
        // No remediation
      },
      {
        group: 'Empty Remediation Message',
        events: [
          {
            id: 'event-2',
            endpointId: 'endpoint-2',
            value: 'empty.message',
          },
        ],
        remediation: {
          message: '',
        },
      },
    ]);

    const result = await buildCustomWorkflowInsights(params);

    expect(result).toHaveLength(0);
  });

  it('should handle missing model', async () => {
    const params = generateParams();
    params.options.model = undefined;

    const result = await buildCustomWorkflowInsights(params);

    expect(result).toHaveLength(1);
    expect(result[0].metadata?.notes?.llm_model).toBe('');
  });

  it('should use correct endpointIds', async () => {
    const params = generateParams();
    params.options.endpointIds = ['endpoint-a', 'endpoint-b', 'endpoint-c'];

    const result = await buildCustomWorkflowInsights(params);

    expect(result).toHaveLength(1);
    expect(result[0].target.ids).toEqual(['endpoint-a', 'endpoint-b', 'endpoint-c']);
  });

  it('should use correct connectorId', async () => {
    const params = generateParams();
    params.options.connectorId = 'custom-connector-id';

    const result = await buildCustomWorkflowInsights(params);

    expect(result).toHaveLength(1);
    expect(result[0].source.id).toBe('custom-connector-id');
  });

  it('should use correct insight type', async () => {
    const params = generateParams();
    params.options.insightType = 'policy_response_failure';

    const result = await buildCustomWorkflowInsights(params);

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('policy_response_failure');
  });
});
