/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SmlDocument } from '@kbn/agent-builder-sml-plugin/server';
import type { ElasticsearchClient } from '@kbn/core-elasticsearch-server';
import type { Logger } from '@kbn/logging';
import { createWorkflowSmlType } from './workflow';
import { WORKFLOW_YAML_ATTACHMENT_TYPE } from '@kbn/workflows/common/constants';
import type { WorkflowsServerPluginSetup } from '@kbn/workflows-management-plugin/server';
import { workflowIndexName } from '@kbn/workflows-management-plugin/server/storage/workflow_storage';
import { WORKFLOW_KI_TYPE } from '@kbn/agent-builder-elastic-ai-index-ki-types';

type WorkflowsManagementApi = WorkflowsServerPluginSetup['management'];

const indexPattern = `${workflowIndexName}-*`;

const createMockEsClient = (hits: unknown[] = []) => {
  return {
    search: jest.fn().mockResolvedValue({
      hits: { hits },
    }),
  } as unknown as ElasticsearchClient;
};

const createMockLogger = (): Logger =>
  ({
    warn: jest.fn(),
  } as unknown as Logger);

const createMockApi = (overrides: Partial<WorkflowsManagementApi> = {}) =>
  ({
    getWorkflow: jest.fn().mockResolvedValue(null),
    ...overrides,
  } as unknown as WorkflowsManagementApi);

const createSmlDocument = (originId = 'workflow-abc'): SmlDocument => ({
  type: 'workflow',
  title: 'My Workflow',
  content: 'My Workflow\nA test workflow',
  permissions: {
    kibana: {
      privileges: [{ space: 'default', name: [`ai_index:${WORKFLOW_KI_TYPE}/read`], count: 1 }],
    },
  },
  attributes: {
    id: 'chunk-1',
    origin: { uri: `workflow://${originId}` },
    created_at: '2025-01-01T00:00:00.000Z',
    updated_at: '2025-01-01T00:00:00.000Z',
    ingestion_method: 'crawled',
  },
});

describe('workflowSmlType', () => {
  describe('id and fetchFrequency', () => {
    it('has id "workflow"', () => {
      const smlType = createWorkflowSmlType(createMockApi());
      expect(smlType.id).toBe('workflow');
    });

    it('returns 30m fetch frequency', () => {
      const smlType = createWorkflowSmlType(createMockApi());
      expect(smlType.fetchFrequency!()).toBe('30m');
    });
  });

  describe('list', () => {
    it('lists workflows across all spaces', async () => {
      const esClient = createMockEsClient([
        {
          _id: 'workflow-1',
          _source: { spaceId: 'default', updated_at: '2025-01-01T00:00:00.000Z' },
          sort: [1],
        },
        {
          _id: 'workflow-2',
          _source: { spaceId: 'space-a', updated_at: '2025-01-02T00:00:00.000Z' },
          sort: [2],
        },
      ]);

      const smlType = createWorkflowSmlType(createMockApi());

      const pages = [];
      for await (const page of smlType.list({
        esClient,
        savedObjectsClient: {} as never,
        logger: createMockLogger(),
      })) {
        pages.push(page);
      }

      expect(esClient.search).toHaveBeenCalledWith(
        expect.objectContaining({
          index: indexPattern,
          size: 1000,
          _source: ['spaceId', 'updated_at'],
          query: {
            bool: {
              must_not: [{ exists: { field: 'deleted_at' } }],
            },
          },
          sort: [{ updated_at: { order: 'desc' } }, '_shard_doc'],
          ignore_unavailable: true,
        })
      );

      expect(pages).toEqual([
        [
          {
            id: 'workflow-1',
            updatedAt: '2025-01-01T00:00:00.000Z',
            spaces: ['default'],
          },
          {
            id: 'workflow-2',
            updatedAt: '2025-01-02T00:00:00.000Z',
            spaces: ['space-a'],
          },
        ],
      ]);
    });

    it('paginates through large result sets', async () => {
      const pageSize = 1000;
      const firstPageHits = Array.from({ length: pageSize }, (_, i) => ({
        _id: `workflow-${i}`,
        _source: { spaceId: 'default', updated_at: '2025-01-01T00:00:00.000Z' },
        sort: [i],
      }));
      const secondPageHits = [
        {
          _id: 'workflow-last',
          _source: { spaceId: 'default', updated_at: '2025-01-01T00:00:00.000Z' },
          sort: [pageSize],
        },
      ];

      const esClient = {
        search: jest
          .fn()
          .mockResolvedValueOnce({ hits: { hits: firstPageHits } })
          .mockResolvedValueOnce({ hits: { hits: secondPageHits } }),
      } as unknown as ElasticsearchClient;

      const smlType = createWorkflowSmlType(createMockApi());

      const pages = [];
      for await (const page of smlType.list({
        esClient,
        savedObjectsClient: {} as never,
        logger: createMockLogger(),
      })) {
        pages.push(page);
      }

      expect(esClient.search).toHaveBeenCalledTimes(2);
      expect((esClient.search as jest.Mock).mock.calls[1][0]).toHaveProperty('search_after', [
        pageSize - 1,
      ]);
      expect(pages).toHaveLength(2);
      expect(pages[0]).toHaveLength(pageSize);
      expect(pages[1]).toHaveLength(1);
    });

    it('yields empty when no workflows exist', async () => {
      const esClient = createMockEsClient([]);

      const smlType = createWorkflowSmlType(createMockApi());

      const pages = [];
      for await (const page of smlType.list({
        esClient,
        savedObjectsClient: {} as never,
        logger: createMockLogger(),
      })) {
        pages.push(page);
      }

      expect(pages).toEqual([]);
    });

    it('handles ES errors gracefully and logs warning', async () => {
      const esClient = {
        search: jest.fn().mockRejectedValue(new Error('index_not_found_exception')),
      } as unknown as ElasticsearchClient;
      const logger = createMockLogger();

      const smlType = createWorkflowSmlType(createMockApi());

      const pages = [];
      for await (const page of smlType.list({
        esClient,
        savedObjectsClient: {} as never,
        logger,
      })) {
        pages.push(page);
      }

      expect(pages).toEqual([]);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('SML workflow: failed to list workflows')
      );
    });

    it('defaults updatedAt when updated_at is missing', async () => {
      const esClient = createMockEsClient([
        {
          _id: 'workflow-no-date',
          _source: { spaceId: 'default' },
          sort: [1],
        },
      ]);

      const smlType = createWorkflowSmlType(createMockApi());

      const pages = [];
      for await (const page of smlType.list({
        esClient,
        savedObjectsClient: {} as never,
        logger: createMockLogger(),
      })) {
        pages.push(page);
      }

      expect(pages[0][0].updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('filters out hits with missing _id or _source', async () => {
      const esClient = createMockEsClient([
        { _id: null, _source: { spaceId: 'default', updated_at: '2025-01-01T00:00:00.000Z' } },
        {
          _id: 'workflow-valid',
          _source: { spaceId: 'default', updated_at: '2025-01-01T00:00:00.000Z' },
          sort: [1],
        },
        { _id: 'workflow-no-source', _source: null, sort: [2] },
      ]);

      const smlType = createWorkflowSmlType(createMockApi());

      const pages = [];
      for await (const page of smlType.list({
        esClient,
        savedObjectsClient: {} as never,
        logger: createMockLogger(),
      })) {
        pages.push(page);
      }

      expect(pages[0]).toHaveLength(1);
      expect(pages[0][0].id).toBe('workflow-valid');
    });
  });

  describe('getSmlEntry', () => {
    it('returns chunk with workflow metadata', async () => {
      const esClient = createMockEsClient([
        {
          _id: 'workflow-abc',
          _source: {
            name: 'Alert Triage',
            description: 'Automatically triage security alerts',
            tags: ['security', 'triage'],
            enabled: true,
            triggerTypes: ['alert', 'manual'],
          },
        },
      ]);

      const smlType = createWorkflowSmlType(createMockApi());

      const result = await smlType.getSmlEntry('workflow-abc', {
        esClient,
        savedObjectsClient: {} as never,
        logger: createMockLogger(),
      });

      expect(result).toEqual({
        type: 'workflow',
        title: 'Alert Triage',
        content: expect.any(String),
      });
      expect(result).not.toHaveProperty('permissions');

      const { content } = result!;
      expect(content).toContain('Alert Triage');
      expect(content).toContain('Automatically triage security alerts');
      expect(content).toContain('tags: security, triage');
      expect(content).toContain('enabled: true');
      expect(content).toContain('triggers: alert, manual');
    });

    it('queries ES with correct parameters', async () => {
      const esClient = createMockEsClient([]);

      const smlType = createWorkflowSmlType(createMockApi());

      await smlType.getSmlEntry('workflow-abc', {
        esClient,
        savedObjectsClient: {} as never,
        logger: createMockLogger(),
      });

      expect(esClient.search).toHaveBeenCalledWith(
        expect.objectContaining({
          index: indexPattern,
          query: {
            bool: {
              must: [{ ids: { values: ['workflow-abc'] } }],
              must_not: [{ exists: { field: 'deleted_at' } }],
            },
          },
          _source: ['name', 'description', 'tags', 'enabled', 'triggerTypes'],
          size: 1,
          ignore_unavailable: true,
        })
      );
    });

    it('returns undefined when workflow is not found', async () => {
      const esClient = createMockEsClient([]);

      const smlType = createWorkflowSmlType(createMockApi());

      const result = await smlType.getSmlEntry('nonexistent', {
        esClient,
        savedObjectsClient: {} as never,
        logger: createMockLogger(),
      });

      expect(result).toBeUndefined();
    });

    it('handles missing optional fields gracefully', async () => {
      const esClient = createMockEsClient([
        {
          _id: 'workflow-minimal',
          _source: {
            name: 'Minimal Workflow',
            enabled: false,
          },
        },
      ]);

      const smlType = createWorkflowSmlType(createMockApi());

      const result = await smlType.getSmlEntry('workflow-minimal', {
        esClient,
        savedObjectsClient: {} as never,
        logger: createMockLogger(),
      });

      expect(result).toEqual({
        type: 'workflow',
        title: 'Minimal Workflow',
        content: 'Minimal Workflow\nenabled: false',
      });
    });

    it('falls back to originId as title when name is missing', async () => {
      const esClient = createMockEsClient([
        {
          _id: 'workflow-no-name',
          _source: {
            enabled: true,
          },
        },
      ]);

      const smlType = createWorkflowSmlType(createMockApi());

      const result = await smlType.getSmlEntry('workflow-no-name', {
        esClient,
        savedObjectsClient: {} as never,
        logger: createMockLogger(),
      });

      expect(result!.title).toBe('workflow-no-name');
    });

    it('returns undefined and logs warning on ES error', async () => {
      const esClient = {
        search: jest.fn().mockRejectedValue(new Error('search_phase_execution_exception')),
      } as unknown as ElasticsearchClient;
      const logger = createMockLogger();

      const smlType = createWorkflowSmlType(createMockApi());

      const result = await smlType.getSmlEntry('workflow-abc', {
        esClient,
        savedObjectsClient: {} as never,
        logger,
      });

      expect(result).toBeUndefined();
      expect(logger.warn).toHaveBeenCalledWith(
        "SML workflow: failed to get data for 'workflow-abc': search_phase_execution_exception"
      );
    });

    it('omits empty tags and triggerTypes from content', async () => {
      const esClient = createMockEsClient([
        {
          _id: 'workflow-empty-arrays',
          _source: {
            name: 'Empty Arrays',
            description: 'Test workflow',
            tags: [],
            triggerTypes: [],
            enabled: true,
          },
        },
      ]);

      const smlType = createWorkflowSmlType(createMockApi());

      const result = await smlType.getSmlEntry('workflow-empty-arrays', {
        esClient,
        savedObjectsClient: {} as never,
        logger: createMockLogger(),
      });

      const { content } = result!;
      expect(content).not.toContain('tags:');
      expect(content).not.toContain('triggers:');
      expect(content).toBe('Empty Arrays\nTest workflow\nenabled: true');
    });
  });

  describe('getPermissions', () => {
    it('returns the registered ai_index read action for workflows', () => {
      const smlType = createWorkflowSmlType(createMockApi());
      const permissions = smlType.getPermissions!('workflow-abc', {
        esClient: createMockEsClient(),
        savedObjectsClient: {} as never,
        logger: createMockLogger(),
      });
      expect(permissions).toEqual({
        kibana: { privileges: { name: [`ai_index:${WORKFLOW_KI_TYPE}/read`] } },
      });
    });
  });

  describe('toAttachment', () => {
    it('converts workflow to workflow.yaml attachment', async () => {
      const api = createMockApi({
        getWorkflow: jest.fn().mockResolvedValue({
          id: 'workflow-abc',
          name: 'Alert Triage',
          yaml: 'version: "1"\nname: Alert Triage\nsteps: []',
        }),
      });

      const smlType = createWorkflowSmlType(api);

      const result = await smlType.toAttachment(createSmlDocument(), {
        savedObjectsClient: {} as never,
        request: {} as never,
        spaceId: 'default',
      });

      expect(result).toEqual({
        type: WORKFLOW_YAML_ATTACHMENT_TYPE,
        data: {
          yaml: 'version: "1"\nname: Alert Triage\nsteps: []',
          workflowId: 'workflow-abc',
          name: 'Alert Triage',
        },
      });
    });

    it('calls api.getWorkflow with correct origin_id and spaceId', async () => {
      const api = createMockApi();

      const smlType = createWorkflowSmlType(api);

      await smlType.toAttachment(createSmlDocument('workflow-xyz'), {
        savedObjectsClient: {} as never,
        request: {} as never,
        spaceId: 'my-space',
      });

      expect(api.getWorkflow).toHaveBeenCalledWith('workflow-xyz', 'my-space');
    });

    it('returns undefined when workflow is not found', async () => {
      const api = createMockApi({
        getWorkflow: jest.fn().mockResolvedValue(null),
      });

      const smlType = createWorkflowSmlType(api);

      const result = await smlType.toAttachment(createSmlDocument(), {
        savedObjectsClient: {} as never,
        request: {} as never,
        spaceId: 'default',
      });

      expect(result).toBeUndefined();
    });
  });
});
