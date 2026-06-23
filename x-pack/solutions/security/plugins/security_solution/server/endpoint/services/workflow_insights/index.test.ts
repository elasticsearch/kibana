/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { merge, cloneDeep } from 'lodash';
import moment from 'moment';
import { ReplaySubject } from 'rxjs';

import type { ElasticsearchClient, KibanaRequest, Logger } from '@kbn/core/server';
import type {
  DefendInsightsGetRequestQuery,
  DefendInsightsPostRequestBody,
} from '@kbn/elastic-assistant-common';
import { CallbackIds } from '@kbn/elastic-assistant-plugin/server/types';
import type { SearchHit, UpdateResponse } from '@elastic/elasticsearch/lib/api/types';

import { DataStreamSpacesAdapter } from '@kbn/data-stream-adapter';
import type {
  DefendInsight,
  SearchParams,
  SecurityWorkflowInsight,
} from '../../../../common/endpoint/types/workflow_insights';
import {
  WorkflowInsightType,
  WorkflowInsightCategory,
  WorkflowInsightSourceType,
  WorkflowInsightTargetType,
  WorkflowInsightActionType,
} from '../../../../common/endpoint/types/workflow_insights';
import { elasticsearchServiceMock } from '@kbn/core-elasticsearch-server-mocks';
import { kibanaPackageJson } from '@kbn/repo-info';
import { loggerMock } from '@kbn/logging-mocks';
import { DEFAULT_SPACE_ID } from '@kbn/core-spaces-common';

import type { EndpointAppContextService } from '../../endpoint_app_context_services';

import { createMockEndpointAppContext } from '../../mocks';
import {
  checkIfRemediationExists,
  createDatastream,
  createPipeline,
  generateInsightId,
} from './helpers';
import { securityWorkflowInsightsService } from '.';
import { DATA_STREAM_NAME } from './constants';
import { buildWorkflowInsights } from './builders';

jest.mock('./helpers', () => {
  const original = jest.requireActual('./helpers');
  return {
    ...original,
    createDatastream: jest.fn(),
    createPipeline: jest.fn(),
    checkIfRemediationExists: jest.fn(),
  };
});

jest.mock('./builders', () => {
  const original = jest.requireActual('./builders');
  return {
    ...original,
    buildWorkflowInsights: jest.fn(),
  };
});

function getDefaultInsight(overrides?: Partial<SecurityWorkflowInsight>): SecurityWorkflowInsight {
  const defaultInsight = {
    '@timestamp': moment(),
    message: 'This is a test message',
    category: WorkflowInsightCategory.enum.endpoint,
    type: WorkflowInsightType.enum.incompatible_antivirus,
    source: {
      type: WorkflowInsightSourceType.enum['llm-connector'],
      id: 'openai-connector-id',
      data_range_start: moment(),
      data_range_end: moment(),
    },
    target: {
      type: WorkflowInsightTargetType.enum.endpoint,
      ids: ['endpoint-1', 'endpoint-2'],
    },
    action: {
      type: WorkflowInsightActionType.enum.refreshed,
      timestamp: moment(),
    },
    value: 'unique-key',
    remediation: {
      exception_list_items: [
        {
          list_id: 'example-list-id',
          name: 'Example List Name',
          description: 'Example description',
          entries: [
            {
              field: 'example-field',
              operator: 'included',
              type: 'match',
              value: 'example-value',
            },
          ],
          tags: ['example-tag'],
          os_types: ['windows', 'linux'],
        },
      ],
    },
    metadata: {
      notes: {
        key1: 'value1',
        key2: 'value2',
      },
      message_variables: ['variable1', 'variable2'],
    },
  };
  return merge(defaultInsight, overrides);
}

describe('SecurityWorkflowInsightsService', () => {
  let logger: Logger;
  let esClient: ElasticsearchClient;
  let mockEndpointAppContextService: jest.Mocked<EndpointAppContextService>;
  let isInitializedSpy: jest.SpyInstance<Promise<[void, void]>, [], boolean>;

  beforeEach(() => {
    logger = loggerMock.create();
    esClient = elasticsearchServiceMock.createElasticsearchClient();

    mockEndpointAppContextService = createMockEndpointAppContext()
      .service as jest.Mocked<EndpointAppContextService>;

    isInitializedSpy = jest
      .spyOn(securityWorkflowInsightsService, 'isInitialized', 'get')
      .mockResolvedValueOnce([undefined, undefined]);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('setup', () => {
    it('should set up the data stream', () => {
      const createDatastreamMock = createDatastream as jest.Mock;
      createDatastreamMock.mockReturnValueOnce(
        new DataStreamSpacesAdapter(DATA_STREAM_NAME, {
          kibanaVersion: kibanaPackageJson.version,
        })
      );

      securityWorkflowInsightsService.setup({
        kibanaVersion: kibanaPackageJson.version,
        logger,
        endpointContext: mockEndpointAppContextService,
      });

      expect(createDatastreamMock).toHaveBeenCalledTimes(1);
      expect(createDatastreamMock).toHaveBeenCalledWith(kibanaPackageJson.version);
    });

    it('should log a warning if createDatastream throws an error', () => {
      const createDatastreamMock = createDatastream as jest.Mock;
      createDatastreamMock.mockImplementation(() => {
        throw new Error('test error');
      });

      securityWorkflowInsightsService.setup({
        kibanaVersion: kibanaPackageJson.version,
        logger,
        endpointContext: mockEndpointAppContextService,
      });

      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('test error'));
    });
  });

  describe('start', () => {
    it('should start the service', async () => {
      const createDatastreamMock = createDatastream as jest.Mock;
      const ds = new DataStreamSpacesAdapter(DATA_STREAM_NAME, {
        kibanaVersion: kibanaPackageJson.version,
      });
      const dsInstallSpy = jest.spyOn(ds, 'install');
      dsInstallSpy.mockResolvedValueOnce();
      createDatastreamMock.mockReturnValueOnce(ds);
      const createPipelineMock = createPipeline as jest.Mock;
      createPipelineMock.mockResolvedValueOnce(true);
      const createDataStreamMock = esClient.indices.createDataStream as jest.Mock;

      securityWorkflowInsightsService.setup({
        kibanaVersion: kibanaPackageJson.version,
        logger,
        endpointContext: mockEndpointAppContextService,
      });
      expect(createDatastreamMock).toHaveBeenCalledTimes(1);
      expect(createDatastreamMock).toHaveBeenCalledWith(kibanaPackageJson.version);

      await securityWorkflowInsightsService.start({
        esClient,
        registerDefendInsightsCallback: jest.fn(),
      });

      expect(createPipelineMock).toHaveBeenCalledTimes(1);
      expect(createPipelineMock).toHaveBeenCalledWith(esClient);
      expect(dsInstallSpy).toHaveBeenCalledTimes(1);
      expect(dsInstallSpy).toHaveBeenCalledWith({
        logger,
        esClient,
        pluginStop$: expect.any(ReplaySubject),
      });
      expect(createDataStreamMock).toHaveBeenCalledTimes(1);
      expect(createDataStreamMock).toHaveBeenCalledWith({ name: DATA_STREAM_NAME });
    });

    it('should log a warning if createPipeline or ds.install throws an error', async () => {
      securityWorkflowInsightsService.setup({
        kibanaVersion: kibanaPackageJson.version,
        logger,
        endpointContext: mockEndpointAppContextService,
      });

      const createPipelineMock = createPipeline as jest.Mock;
      createPipelineMock.mockImplementationOnce(() => {
        throw new Error('test error');
      });

      await securityWorkflowInsightsService.start({
        esClient,
        registerDefendInsightsCallback: jest.fn(),
      });

      expect(logger.warn).toHaveBeenCalledTimes(2);
      expect(logger.warn).toHaveBeenNthCalledWith(1, expect.stringContaining('test error'));
    });

    it('should register a post-create callback that passes the active space to createFromDefendInsights', async () => {
      const registerCallbackMock = jest.fn();
      mockEndpointAppContextService.getActiveSpaceId.mockReturnValue('space-1');

      securityWorkflowInsightsService.setup({
        kibanaVersion: kibanaPackageJson.version,
        logger,
        endpointContext: mockEndpointAppContextService,
      });
      await securityWorkflowInsightsService.start({
        esClient,
        registerDefendInsightsCallback: registerCallbackMock,
      });

      const postCreateCallback = registerCallbackMock.mock.calls.find(
        ([callbackId]) => callbackId === CallbackIds.DefendInsightsPostCreate
      )?.[1];
      expect(postCreateCallback).toBeDefined();

      const createFromDefendInsightsSpy = jest
        .spyOn(securityWorkflowInsightsService, 'createFromDefendInsights')
        .mockResolvedValueOnce([]);

      const request = {
        body: {
          endpointIds: ['endpoint-1'],
          insightType: WorkflowInsightType.enum.incompatible_antivirus,
          apiConfig: { connectorId: 'connector-id', model: 'model-name' },
        },
      } as unknown as KibanaRequest<unknown, unknown, DefendInsightsPostRequestBody>;

      await postCreateCallback([], request);

      expect(mockEndpointAppContextService.getActiveSpaceId).toHaveBeenCalledWith(request);
      expect(createFromDefendInsightsSpy).toHaveBeenCalledWith(
        [],
        ['endpoint-1'],
        WorkflowInsightType.enum.incompatible_antivirus,
        'connector-id',
        'model-name',
        'space-1'
      );

      createFromDefendInsightsSpy.mockRestore();
    });
  });

  describe('createFromDefendInsights', () => {
    it('should report insight_created telemetry event', async () => {
      const reportEventMock = jest.fn();
      mockEndpointAppContextService.getTelemetryService = jest.fn().mockReturnValue({
        reportEvent: reportEventMock,
      });

      const insight: DefendInsight = {
        group: 'TestAV',
        events: [
          {
            id: 'event-1',
            endpointId: 'endpoint-1',
            value: '/path/to/process',
          },
        ],
      };

      const workflowInsights: SecurityWorkflowInsight[] = [getDefaultInsight()];
      (buildWorkflowInsights as jest.Mock).mockResolvedValueOnce(workflowInsights);

      const esClientIndexResp = {
        _index: DATA_STREAM_NAME,
        _id: '1',
        result: 'created' as const,
        _shards: { total: 1, successful: 1, failed: 0 },
        _version: 1,
      };
      jest.spyOn(esClient, 'index').mockResolvedValue(esClientIndexResp);

      securityWorkflowInsightsService.setup({
        kibanaVersion: kibanaPackageJson.version,
        logger,
        endpointContext: mockEndpointAppContextService,
      });
      await securityWorkflowInsightsService.start({
        esClient,
        registerDefendInsightsCallback: jest.fn(),
      });

      await securityWorkflowInsightsService.createFromDefendInsights(
        [insight],
        ['endpoint-1'],
        WorkflowInsightType.enum.incompatible_antivirus,
        'connector-id',
        'model-name',
        DEFAULT_SPACE_ID
      );

      expect(reportEventMock).toHaveBeenCalledWith('endpoint_workflow_insights_created_event', {
        insightType: 'incompatible_antivirus',
        count: 1,
      });
    });

    it('should create workflow insights from defend insights', async () => {
      const insight = {
        group: 'AVGAntivirus',
        events: [
          {
            id: 'lqw5opMB9Ke6SNgnxRSZ',
            endpointId: 'f6e2f338-6fb7-4c85-9c23-d20e9f96a051',
            value: '/Applications/AVGAntivirus.app/Contents/Backend/services/com.avg.activity',
          },
        ],
      };
      const defendInsights: DefendInsight[] = [
        insight,
        insight, // intentional dupe to confirm de-duping
      ];

      const workflowInsights: SecurityWorkflowInsight[] = [getDefaultInsight()];
      const buildWorkflowInsightsMock = buildWorkflowInsights as jest.Mock;
      buildWorkflowInsightsMock.mockResolvedValueOnce(workflowInsights);

      const esClientIndexResp = {
        _index: DATA_STREAM_NAME,
        _id: '1',
        result: 'created' as const,
        _shards: {
          total: 1,
          successful: 1,
          failed: 0,
        },
        _version: 1,
      };
      jest.spyOn(esClient, 'index').mockResolvedValue(esClientIndexResp);
      securityWorkflowInsightsService.setup({
        kibanaVersion: kibanaPackageJson.version,
        logger,
        endpointContext: mockEndpointAppContextService,
      });
      await securityWorkflowInsightsService.start({
        esClient,
        registerDefendInsightsCallback: jest.fn(),
      });
      const result = await securityWorkflowInsightsService.createFromDefendInsights(
        defendInsights,
        insight.events.map((e) => e.endpointId),
        workflowInsights[0].type,
        workflowInsights[0].source.id,
        workflowInsights[0].source.type,
        DEFAULT_SPACE_ID
      );

      // four since it calls fetch + update + fetch + create
      expect(isInitializedSpy).toHaveBeenCalledTimes(4);
      expect(buildWorkflowInsightsMock).toHaveBeenCalledWith({
        defendInsights,
        endpointMetadataService: expect.any(Object),
        esClient,
        options: {
          insightType: workflowInsights[0].type,
          endpointIds: insight.events.map((e) => e.endpointId),
          connectorId: workflowInsights[0].source.id,
          model: workflowInsights[0].source.type,
        },
      });
      expect(mockEndpointAppContextService.getEndpointMetadataService).toHaveBeenNthCalledWith(
        1,
        DEFAULT_SPACE_ID
      );
      expect(mockEndpointAppContextService.getEndpointMetadataService).toHaveBeenNthCalledWith(
        2,
        DEFAULT_SPACE_ID
      );
      expect(result).toEqual(workflowInsights.map(() => esClientIndexResp));
    });

    it('should use the provided space ID for workflow insight metadata enrichment', async () => {
      const insight = {
        group: 'AVGAntivirus',
        events: [
          {
            id: 'lqw5opMB9Ke6SNgnxRSZ',
            endpointId: 'f6e2f338-6fb7-4c85-9c23-d20e9f96a051',
            value: '/Applications/AVGAntivirus.app/Contents/Backend/services/com.avg.activity',
          },
        ],
      };
      const defendInsights: DefendInsight[] = [insight];
      const workflowInsights: SecurityWorkflowInsight[] = [getDefaultInsight()];
      const endpointMetadataService = {} as ReturnType<
        EndpointAppContextService['getEndpointMetadataService']
      >;
      const buildWorkflowInsightsMock = buildWorkflowInsights as jest.Mock;
      buildWorkflowInsightsMock.mockResolvedValueOnce(workflowInsights);
      mockEndpointAppContextService.getEndpointMetadataService.mockReturnValue(
        endpointMetadataService
      );

      const esClientIndexResp = {
        _index: DATA_STREAM_NAME,
        _id: '1',
        result: 'created' as const,
        _shards: {
          total: 1,
          successful: 1,
          failed: 0,
        },
        _version: 1,
      };
      jest.spyOn(esClient, 'index').mockResolvedValue(esClientIndexResp);
      securityWorkflowInsightsService.setup({
        kibanaVersion: kibanaPackageJson.version,
        logger,
        endpointContext: mockEndpointAppContextService,
      });
      await securityWorkflowInsightsService.start({
        esClient,
        registerDefendInsightsCallback: jest.fn(),
      });

      const result = await securityWorkflowInsightsService.createFromDefendInsights(
        defendInsights,
        insight.events.map((e) => e.endpointId),
        workflowInsights[0].type,
        workflowInsights[0].source.id,
        workflowInsights[0].source.type,
        'space-1'
      );

      expect(mockEndpointAppContextService.getEndpointMetadataService).toHaveBeenNthCalledWith(
        1,
        'space-1'
      );
      expect(mockEndpointAppContextService.getEndpointMetadataService).toHaveBeenNthCalledWith(
        2,
        'space-1'
      );
      expect(buildWorkflowInsightsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          endpointMetadataService,
        })
      );
      expect(checkIfRemediationExists).toHaveBeenCalledWith(
        expect.objectContaining({
          endpointMetadataClient: endpointMetadataService,
        })
      );
      expect(result).toEqual(workflowInsights.map(() => esClientIndexResp));
    });
  });

  describe('create', () => {
    it('should index the doc correctly', async () => {
      await securityWorkflowInsightsService.start({
        esClient,
        registerDefendInsightsCallback: jest.fn(),
      });
      const insight = getDefaultInsight();
      await securityWorkflowInsightsService.create(insight, DEFAULT_SPACE_ID);

      // two since it calls fetch as well
      expect(isInitializedSpy).toHaveBeenCalledTimes(2);
      // indexes the doc
      expect(esClient.index).toHaveBeenCalledTimes(1);
      expect(esClient.index).toHaveBeenCalledWith({
        index: DATA_STREAM_NAME,
        id: generateInsightId(insight),
        document: insight,
        refresh: 'wait_for',
        op_type: 'create',
      });
    });

    it('should mark insight as remediated if remediation exists', async () => {
      await securityWorkflowInsightsService.start({
        esClient,
        registerDefendInsightsCallback: jest.fn(),
      });
      const insight = getDefaultInsight();

      const remediationExistsMock = checkIfRemediationExists as jest.Mock;
      remediationExistsMock.mockResolvedValueOnce(true);

      await securityWorkflowInsightsService.create(insight, DEFAULT_SPACE_ID);

      expect(remediationExistsMock).toHaveBeenCalledTimes(1);

      // two since it calls fetch as well
      expect(isInitializedSpy).toHaveBeenCalledTimes(2);
      expect(esClient.index).toHaveBeenCalledTimes(1);
      expect(esClient.index).toHaveBeenCalledWith(
        expect.objectContaining({
          document: expect.objectContaining({
            action: expect.objectContaining({
              type: WorkflowInsightActionType.enum.remediated,
            }),
          }),
        })
      );
    });

    it('should call update instead if insight already exists', async () => {
      const indexName = 'backing-index';
      const fetchSpy = jest
        .spyOn(securityWorkflowInsightsService, 'fetch')
        .mockResolvedValueOnce([{ _index: indexName }] as Array<
          SearchHit<SecurityWorkflowInsight>
        >);
      const updateSpy = jest
        .spyOn(securityWorkflowInsightsService, 'update')
        .mockResolvedValueOnce({} as UpdateResponse);
      await securityWorkflowInsightsService.start({
        esClient,
        registerDefendInsightsCallback: jest.fn(),
      });
      const insight = getDefaultInsight();
      await securityWorkflowInsightsService.create(insight, DEFAULT_SPACE_ID);

      const expectedInsight = cloneDeep(insight);
      expectedInsight['@timestamp'] = expect.any(moment);
      expectedInsight.action.timestamp = expect.any(moment);
      expectedInsight.source.data_range_start = expect.any(moment);
      expectedInsight.source.data_range_end = expect.any(moment);

      // ensure it waits for initialization first
      expect(isInitializedSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(updateSpy).toHaveBeenCalledTimes(1);
      expect(updateSpy).toHaveBeenCalledWith(
        generateInsightId(insight),
        expect.objectContaining(insight),
        indexName
      );
    });
  });

  describe('update', () => {
    it('should update the doc correctly', async () => {
      await securityWorkflowInsightsService.start({
        esClient,
        registerDefendInsightsCallback: jest.fn(),
      });
      const insightId = 'some-insight-id';
      const insight = getDefaultInsight();
      const indexName = 'backing-index-name';
      await securityWorkflowInsightsService.update(insightId, insight, indexName);

      // ensure it waits for initialization first
      expect(isInitializedSpy).toHaveBeenCalledTimes(1);
      // updates the doc
      expect(esClient.update).toHaveBeenCalledTimes(1);
      expect(esClient.update).toHaveBeenCalledWith({
        index: indexName,
        id: insightId,
        doc: insight,
        refresh: 'wait_for',
      });
    });
  });

  describe('fetch', () => {
    it('should fetch the docs with the correct params', async () => {
      await securityWorkflowInsightsService.start({
        esClient,
        registerDefendInsightsCallback: jest.fn(),
      });
      const searchParams: SearchParams = {
        size: 50,
        from: 50,
        ids: ['id1', 'id2'],
        categories: [WorkflowInsightCategory.enum.endpoint],
        types: [WorkflowInsightType.enum.incompatible_antivirus],
        sourceTypes: [WorkflowInsightSourceType.enum['llm-connector']],
        sourceIds: ['source-id1', 'source-id2'],
        targetTypes: [WorkflowInsightTargetType.enum.endpoint],
        targetIds: ['target-id1', 'target-id2'],
        actionTypes: [
          WorkflowInsightActionType.enum.refreshed,
          WorkflowInsightActionType.enum.remediated,
        ],
      };
      await securityWorkflowInsightsService.fetch(searchParams);

      // ensure it waits for initialization first
      expect(isInitializedSpy).toHaveBeenCalledTimes(1);
      // fetches the doc
      expect(esClient.search).toHaveBeenCalledTimes(1);
      expect(esClient.search).toHaveBeenCalledWith({
        index: DATA_STREAM_NAME,
        query: {
          bool: {
            must: [
              {
                terms: {
                  _id: ['id1', 'id2'],
                },
              },
              {
                terms: {
                  categories: ['endpoint'],
                },
              },
              {
                terms: {
                  type: ['incompatible_antivirus'],
                },
              },
              {
                nested: {
                  path: 'source',
                  query: {
                    terms: {
                      'source.type': ['llm-connector'],
                    },
                  },
                },
              },
              {
                nested: {
                  path: 'source',
                  query: {
                    terms: {
                      'source.id': ['source-id1', 'source-id2'],
                    },
                  },
                },
              },
              {
                nested: {
                  path: 'target',
                  query: {
                    terms: {
                      'target.type': ['endpoint'],
                    },
                  },
                },
              },
              {
                nested: {
                  path: 'target',
                  query: {
                    terms: {
                      'target.ids': ['target-id1', 'target-id2'],
                    },
                  },
                },
              },
              {
                nested: {
                  path: 'action',
                  query: {
                    terms: {
                      'action.type': ['refreshed', 'remediated'],
                    },
                  },
                },
              },
            ],
          },
        },
        size: searchParams.size,
        from: searchParams.from,
      });
    });
  });

  describe('agent space-awareness and lifecycle hooks', () => {
    let request: KibanaRequest<unknown, unknown, DefendInsightsGetRequestQuery>;

    const setupWithMockFleet = () => {
      const { ensureInCurrentSpace } = mockEndpointAppContextService.getInternalFleetServices();

      securityWorkflowInsightsService.setup({
        kibanaVersion: kibanaPackageJson.version,
        logger,
        endpointContext: mockEndpointAppContextService,
      });

      return { ensureInCurrentSpace };
    };

    beforeEach(async () => {
      await securityWorkflowInsightsService.start({
        esClient,
        registerDefendInsightsCallback: jest.fn(),
      });

      request = {} as KibanaRequest<unknown, unknown, DefendInsightsGetRequestQuery>;
    });

    describe('ensureAgentIdsInCurrentSpace', () => {
      it('should call fleetServices.ensureInCurrentSpace with correct agent IDs when feature is enabled', async () => {
        const { ensureInCurrentSpace } = setupWithMockFleet();

        await securityWorkflowInsightsService.ensureAgentIdsInCurrentSpace(request, [
          'agent-123',
          'agent-456',
        ]);

        expect(ensureInCurrentSpace).toHaveBeenCalledWith({
          agentIds: ['agent-123', 'agent-456'],
        });
      });

      it('should default to empty agentIds if none provided', async () => {
        const { ensureInCurrentSpace } = setupWithMockFleet();

        await securityWorkflowInsightsService.ensureAgentIdsInCurrentSpace(request);

        expect(ensureInCurrentSpace).toHaveBeenCalledWith({ agentIds: [] });
      });
    });

    describe('onBeforeCreate', () => {
      it('should extract agent IDs from request body and ensure they’re in current space', async () => {
        const { ensureInCurrentSpace } = setupWithMockFleet();

        const req = {
          body: {
            endpointIds: ['agent-A', 'agent-B'],
          },
        } as KibanaRequest<unknown, unknown, DefendInsightsPostRequestBody>;

        await securityWorkflowInsightsService.onBeforeCreate(req);

        expect(ensureInCurrentSpace).toHaveBeenCalledWith({
          agentIds: ['agent-A', 'agent-B'],
        });
      });

      it('should handle undefined request body gracefully', async () => {
        const req = {} as KibanaRequest<unknown, unknown, DefendInsightsPostRequestBody>;

        await expect(securityWorkflowInsightsService.onBeforeCreate(req)).resolves.not.toThrow();
      });
    });

    describe('onAfterFetch', () => {
      it('should forward agent IDs to ensureAgentIdsInCurrentSpace', async () => {
        const { ensureInCurrentSpace } = setupWithMockFleet();

        const agentIds = ['agent-X', 'agent-Y'];
        await securityWorkflowInsightsService.onAfterFetch(request, agentIds);

        expect(ensureInCurrentSpace).toHaveBeenCalledWith({ agentIds });
      });
    });
  });
});
