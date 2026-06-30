/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ChangeHistoryDocument } from '@kbn/change-history';
import type { CoreStart } from '@kbn/core/server';
import { elasticsearchServiceMock, httpServerMock } from '@kbn/core/server/mocks';
import { loggerMock } from '@kbn/logging-mocks';
import type { UpdatedWorkflowResponseDto } from '@kbn/workflows';
import { InvalidYamlSchemaError } from '@kbn/workflows-yaml';
import type { z } from '@kbn/zod/v4';

import type { WorkflowCrudDeps } from './types';
import type { IWorkflowChangeHistoryService } from './workflow_change_history_types';
import { WorkflowCrudService } from './workflow_crud_service';
import type { WorkflowExecutionQueryService } from './workflow_execution_query_service';
import type { WorkflowValidationService } from './workflow_validation_service';
import {
  WORKFLOW_CHANGE_HISTORY_OBJECT_TYPE,
  WorkflowChangeHistoryAction,
} from '../../common/lib/workflow_change_history/constants';
import { getWorkflowZodSchema } from '../../common/schema';
import { WorkflowChangeHistoryDisabledError } from '../lib/workflow_change_history_disabled_error';
import { WorkflowHistoryEventNotFoundError } from '../lib/workflow_history_event_not_found_error';
import type { WorkflowProperties } from '../storage/workflow_storage';

const makeHistoryEvent = (overrides: Partial<ChangeHistoryDocument> = {}): ChangeHistoryDocument =>
  ({
    '@timestamp': '2026-01-01T00:00:00.000Z',
    event: {
      id: 'event-v3',
      action: 'update',
      module: 'stack',
      dataset: 'workflows',
      type: 'change',
    },
    object: {
      id: 'wf-1',
      type: WORKFLOW_CHANGE_HISTORY_OBJECT_TYPE,
      sequence: 3,
      snapshot: { yaml: 'name: Restored workflow' },
      hash: 'hash',
      fields: { hashed: [] },
    },
    user: { name: 'alice' },
    ecs: { version: '9.3.0' },
    service: { type: 'kibana', version: '9.0.0' },
    ...overrides,
  } as ChangeHistoryDocument);

const makeChangeHistoryService = (
  overrides: Partial<IWorkflowChangeHistoryService> = {}
): IWorkflowChangeHistoryService => ({
  isInitialized: () => true,
  initialize: jest.fn(),
  getHistory: jest.fn().mockResolvedValue({
    total: 1,
    items: [makeHistoryEvent()],
  }),
  asScoped: jest.fn(),
  asSystemUser: jest.fn(),
  ...overrides,
});

type RestoreTestDepsOverrides = Omit<Partial<WorkflowCrudDeps>, 'changeHistoryService'> & {
  changeHistoryService?: Partial<IWorkflowChangeHistoryService>;
};

const makeFinalWorkflowProperties = (
  overrides: Partial<WorkflowProperties> = {}
): WorkflowProperties => ({
  name: 'Restored workflow',
  description: '',
  enabled: true,
  tags: [],
  triggerTypes: [],
  yaml: 'name: Restored workflow',
  definition: null,
  createdBy: 'alice',
  lastUpdatedBy: 'alice',
  spaceId: 'default',
  valid: true,
  deleted_at: null,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2026-01-02T00:00:00.000Z',
  version: 8,
  ...overrides,
});

interface ApplyWorkflowUpdateResult {
  response: UpdatedWorkflowResponseDto;
  finalData: WorkflowProperties;
  timestamp: Date;
}

const makeApplyWorkflowUpdateResult = (
  overrides: {
    response?: Partial<UpdatedWorkflowResponseDto>;
    finalData?: WorkflowProperties;
    timestamp?: Date;
  } = {}
): ApplyWorkflowUpdateResult => ({
  response: {
    id: 'wf-1',
    lastUpdatedAt: '2026-01-02T00:00:00.000Z',
    lastUpdatedBy: 'alice',
    enabled: true,
    valid: true,
    validationErrors: [],
    ...overrides.response,
  },
  finalData: overrides.finalData ?? makeFinalWorkflowProperties(),
  timestamp: overrides.timestamp ?? new Date('2026-01-02T00:00:00.000Z'),
});

interface WorkflowCrudServiceWithApplyUpdate {
  applyWorkflowUpdate: (
    id: string,
    workflow: Partial<{ yaml: string }>,
    spaceId: string,
    request: ReturnType<typeof httpServerMock.createKibanaRequest>
  ) => Promise<ApplyWorkflowUpdateResult>;
}

describe('WorkflowCrudService.restoreWorkflowVersion', () => {
  const request = httpServerMock.createKibanaRequest();

  const makeService = (depsOverrides: RestoreTestDepsOverrides = {}) => {
    const { changeHistoryService: changeHistoryOverrides, ...restOverrides } = depsOverrides;
    const changeHistoryService = makeChangeHistoryService(changeHistoryOverrides);
    const getHistory = changeHistoryService.getHistory as jest.Mock;

    const deps = {
      changeHistoryService,
      workflowVersioningEnabled: true,
      ...restOverrides,
    } as WorkflowCrudDeps;

    const service = new WorkflowCrudService(deps);
    const applyWorkflowUpdate = jest
      .spyOn(service as unknown as WorkflowCrudServiceWithApplyUpdate, 'applyWorkflowUpdate')
      .mockResolvedValue(makeApplyWorkflowUpdateResult());
    const logWorkflowChangesAfterWrite = jest
      .spyOn(service, 'logWorkflowChangesAfterWrite')
      .mockResolvedValue();

    return { service, getHistory, applyWorkflowUpdate, logWorkflowChangesAfterWrite };
  };

  it('restores snapshot yaml via applyWorkflowUpdate and logs restore change history', async () => {
    const { service, getHistory, applyWorkflowUpdate, logWorkflowChangesAfterWrite } =
      makeService();

    const result = await service.restoreWorkflowVersion('wf-1', 'event-v3', 'default', request);

    expect(getHistory).toHaveBeenCalledWith('default', 'wf-1', {
      additionalFilters: [{ term: { 'event.id': 'event-v3' } }],
      size: 1,
    });
    expect(applyWorkflowUpdate).toHaveBeenCalledWith(
      'wf-1',
      { yaml: 'name: Restored workflow' },
      'default',
      request
    );
    expect(logWorkflowChangesAfterWrite).toHaveBeenCalledWith({
      workflows: [{ id: 'wf-1', document: makeFinalWorkflowProperties() }],
      action: WorkflowChangeHistoryAction.workflowRestore,
      spaceId: 'default',
      timestamp: new Date('2026-01-02T00:00:00.000Z'),
      request,
      restoreMetadata: {
        eventId: 'event-v3',
        sequence: 3,
      },
    });
    expect(result).toEqual(
      expect.objectContaining({
        id: 'wf-1',
        version: 8,
      })
    );
  });

  it('throws when workflow is not found', async () => {
    const { service, applyWorkflowUpdate } = makeService();
    applyWorkflowUpdate.mockRejectedValue(new Error('Workflow with id missing not found'));

    await expect(
      service.restoreWorkflowVersion('missing', 'event-v3', 'default', request)
    ).rejects.toThrow('Workflow with id missing not found');
  });

  it('throws when history event is not found', async () => {
    const { service } = makeService({
      changeHistoryService: {
        getHistory: jest.fn().mockResolvedValue({ total: 0, items: [] }),
      },
    });

    await expect(
      service.restoreWorkflowVersion('wf-1', 'missing-event', 'default', request)
    ).rejects.toThrow(WorkflowHistoryEventNotFoundError);
  });

  it('throws when snapshot yaml is missing', async () => {
    const { service } = makeService({
      changeHistoryService: {
        getHistory: jest.fn().mockResolvedValue({
          total: 1,
          items: [
            makeHistoryEvent({
              object: {
                id: 'wf-1',
                type: WORKFLOW_CHANGE_HISTORY_OBJECT_TYPE,
                snapshot: {},
                hash: 'hash',
                fields: { hashed: [], redacted: [] },
              },
            }),
          ],
        }),
      },
    });

    await expect(
      service.restoreWorkflowVersion('wf-1', 'event-v3', 'default', request)
    ).rejects.toThrow(InvalidYamlSchemaError);
  });

  it('throws when versioning is disabled', async () => {
    const { service } = makeService({
      workflowVersioningEnabled: false,
      changeHistoryService: {
        getHistory: jest.fn(),
      },
    });

    await expect(
      service.restoreWorkflowVersion('wf-1', 'event-v3', 'default', request)
    ).rejects.toThrow(WorkflowChangeHistoryDisabledError);
  });
});

describe('WorkflowCrudService.restoreWorkflowVersion integration', () => {
  const request = { auth: { credentials: { username: 'alice' } } } as any;

  const zodSchema: z.ZodType = getWorkflowZodSchema({}, [], { lightweight: true });

  const workflowYamlV1 = [
    'name: Restore Integration',
    'enabled: true',
    'tags:',
    '  - v1-tag',
    'triggers:',
    '  - type: manual',
    'steps:',
    '  - name: step-one',
    '    type: custom.step',
    '    with:',
    '      message: "historical"',
  ].join('\n');

  const workflowYamlV2 = workflowYamlV1
    .replace('historical', 'current')
    .replace('v1-tag', 'v2-tag');

  const makeSource = (overrides?: Partial<WorkflowProperties>): WorkflowProperties => ({
    name: 'Restore Integration',
    description: '',
    enabled: true,
    tags: ['v2-tag'],
    triggerTypes: ['manual'],
    yaml: workflowYamlV2,
    definition: {
      name: 'Restore Integration',
      enabled: true,
      version: '1',
      triggers: [{ type: 'manual' }],
      steps: [
        {
          name: 'step-one',
          type: 'custom.step',
          with: { message: 'current' },
        },
      ],
    } as WorkflowProperties['definition'],
    createdBy: 'alice',
    lastUpdatedBy: 'alice',
    spaceId: 'default',
    valid: true,
    deleted_at: null,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
    version: 7,
    ...overrides,
  });

  const makeStorageClient = () => ({
    search: jest.fn(),
    index: jest.fn().mockResolvedValue({ result: 'updated', _seq_no: 8, _primary_term: 1 }),
    bulk: jest.fn(),
  });

  const makeIntegrationService = (snapshotYaml: string) => {
    const client = makeStorageClient();
    const scopedChangeHistory = { logBulk: jest.fn().mockResolvedValue(undefined) };
    const changeHistoryService = makeChangeHistoryService({
      getHistory: jest.fn().mockResolvedValue({
        total: 1,
        items: [
          makeHistoryEvent({
            object: {
              id: 'wf-1',
              type: WORKFLOW_CHANGE_HISTORY_OBJECT_TYPE,
              sequence: 3,
              snapshot: { yaml: snapshotYaml },
              hash: 'hash',
              fields: { hashed: [], redacted: [] },
            },
          }),
        ],
      }),
      asScoped: jest.fn().mockReturnValue(scopedChangeHistory),
    });

    const validationService = {
      getWorkflowZodSchema: jest.fn().mockResolvedValue(zodSchema),
    } as unknown as WorkflowValidationService;

    const deps: WorkflowCrudDeps = {
      logger: loggerMock.create(),
      esClient: elasticsearchServiceMock.createElasticsearchClient(),
      workflowStorage: { getClient: () => client } as any,
      getSecurity: () =>
        ({
          authc: {
            getCurrentUser: jest.fn().mockReturnValue({ username: 'alice' }),
          },
        } as any),
      workflowsExtensions: { getAllTriggerDefinitions: () => [] } as any,
      getTaskScheduler: () => null,
      executionQueryService: {
        getWorkflowExecutions: jest.fn().mockResolvedValue({ total: 0, results: [] }),
      } as unknown as WorkflowExecutionQueryService,
      validationService,
      getCoreStart: () => ({} as CoreStart),
      changeHistoryService,
      workflowVersioningEnabled: true,
    };

    client.search.mockResolvedValue({
      hits: {
        hits: [
          {
            _id: 'wf-1',
            _source: makeSource(),
            _seq_no: 7,
            _primary_term: 1,
          },
        ],
      },
    });

    const service = new WorkflowCrudService(deps);

    return { service, client, scopedChangeHistory };
  };

  it('indexes a restored workflow document derived from the historical snapshot yaml', async () => {
    const { service, client, scopedChangeHistory } = makeIntegrationService(workflowYamlV1);

    const result = await service.restoreWorkflowVersion('wf-1', 'event-v3', 'default', request);

    expect(result.version).toBe(8);
    expect(scopedChangeHistory.logBulk).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        action: WorkflowChangeHistoryAction.workflowRestore,
        refresh: 'wait_for',
      })
    );
    expect(client.index).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'wf-1',
        document: expect.objectContaining({
          yaml: workflowYamlV1,
          enabled: true,
          tags: ['v1-tag'],
          valid: true,
          definition: expect.objectContaining({
            steps: [
              expect.objectContaining({
                with: expect.objectContaining({ message: 'historical' }),
              }),
            ],
          }),
        }),
      })
    );
  });

  it('restores enabled:false from a snapshot logged after a toggle-only update', async () => {
    const disabledYaml = workflowYamlV1.replace('enabled: true', 'enabled: false');
    const { service, client } = makeIntegrationService(disabledYaml);

    const result = await service.restoreWorkflowVersion('wf-1', 'event-v3', 'default', request);

    expect(result.enabled).toBe(false);
    expect(client.index).toHaveBeenCalledWith(
      expect.objectContaining({
        document: expect.objectContaining({
          enabled: false,
          yaml: expect.stringContaining('enabled: false'),
        }),
      })
    );
  });
});
