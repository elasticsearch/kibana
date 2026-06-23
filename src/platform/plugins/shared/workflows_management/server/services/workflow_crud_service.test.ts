/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { errors } from '@elastic/elasticsearch';
import type { CoreStart } from '@kbn/core/server';
import { elasticsearchServiceMock } from '@kbn/core/server/mocks';
import { loggerMock } from '@kbn/logging-mocks';

import type { WorkflowCrudDeps } from './types';
import { WorkflowChangeHistoryAction } from './workflow_change_history_constants';
import { WorkflowCrudService } from './workflow_crud_service';
import type { WorkflowExecutionQueryService } from './workflow_execution_query_service';
import type { WorkflowValidationService } from './workflow_validation_service';
import * as workflowPrepare from '../api/lib/workflow_prepare';
import { logWorkflowChanges } from '../lib/log_workflow_changes';
import type { WorkflowProperties } from '../storage/workflow_storage';

jest.mock('../lib/log_workflow_changes', () => ({
  logWorkflowChanges: jest.fn().mockResolvedValue(undefined),
}));

const mockedLogWorkflowChanges = logWorkflowChanges as jest.MockedFunction<
  typeof logWorkflowChanges
>;

const makeSource = (overrides?: Partial<WorkflowProperties>): WorkflowProperties => ({
  name: 'Test Workflow',
  description: 'A test workflow',
  enabled: true,
  tags: [],
  triggerTypes: [],
  yaml: 'name: Test Workflow',
  definition: null,
  createdBy: 'user-1',
  lastUpdatedBy: 'user-1',
  spaceId: 'default',
  valid: true,
  deleted_at: null,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
  ...overrides,
});

const makeStorageClient = () => ({
  search: jest.fn(),
  index: jest.fn().mockResolvedValue({ result: 'created', _seq_no: 1, _primary_term: 1 }),
  bulk: jest.fn(),
});

const makeSecurityMock = (username: string = 'alice') =>
  ({
    authc: {
      getCurrentUser: jest.fn().mockReturnValue({ username }),
    },
  } as any);

const makeDeps = (
  clientOverrides?: Partial<ReturnType<typeof makeStorageClient>>,
  depsOverrides?: Partial<WorkflowCrudDeps>
): { deps: WorkflowCrudDeps; client: ReturnType<typeof makeStorageClient> } => {
  const client = { ...makeStorageClient(), ...clientOverrides };
  const executionQueryService = {
    getWorkflowExecutions: jest.fn().mockResolvedValue({ total: 0, results: [] }),
  } as unknown as WorkflowExecutionQueryService;
  const validationService = {
    getWorkflowZodSchema: jest.fn().mockResolvedValue({
      parse: (v: unknown) => v,
      safeParse: (v: unknown) => ({ success: true, data: v }),
    }),
  } as unknown as WorkflowValidationService;
  const deps: WorkflowCrudDeps = {
    logger: loggerMock.create(),
    esClient: elasticsearchServiceMock.createElasticsearchClient(),
    workflowStorage: { getClient: () => client } as any,
    getSecurity: () => makeSecurityMock('alice'),
    workflowsExtensions: undefined,
    getTaskScheduler: () => null,
    executionQueryService,
    validationService,
    getCoreStart: () => ({} as CoreStart),
    changeHistoryService: {
      isInitialized: () => false,
      asScoped: jest.fn(),
      asSystemUser: jest.fn(),
    } as any,
    workflowVersioningEnabled: true,
    ...depsOverrides,
  };
  return { deps, client };
};

const lightweightWorkflowYaml = [
  'name: My Workflow',
  'enabled: true',
  'triggers:',
  '  - type: manual',
  'steps:',
  '  - name: step-one',
  '    type: console',
  '    with:',
  '      message: "hi"',
].join('\n');

describe('WorkflowCrudService', () => {
  describe('logWorkflowChangesAfterWrite', () => {
    it('does not touch change history when workflow versioning is disabled', async () => {
      const asScoped = jest.fn(() => {
        throw new Error('asScoped should not be called when versioning is disabled');
      });
      const asSystemUser = jest.fn(() => {
        throw new Error('asSystemUser should not be called when versioning is disabled');
      });
      const { deps } = makeDeps(undefined, {
        workflowVersioningEnabled: false,
        changeHistoryService: {
          isInitialized: () => false,
          initialize: jest.fn().mockResolvedValue(undefined),
          getHistory: jest.fn(),
          asScoped,
          asSystemUser,
        },
      });
      const service = new WorkflowCrudService(deps);

      await service.logWorkflowChangesAfterWrite({
        workflows: [{ id: 'wf-1', document: makeSource() }],
        action: WorkflowChangeHistoryAction.workflowUpdate,
        spaceId: 'default',
        timestamp: new Date(),
      });

      expect(asScoped).not.toHaveBeenCalled();
      expect(asSystemUser).not.toHaveBeenCalled();
      expect(mockedLogWorkflowChanges).not.toHaveBeenCalled();
    });
  });

  describe('prepareWorkflowDocumentForStorage', () => {
    it('uses lightweight validation only when explicitly requested', async () => {
      const { deps } = makeDeps();
      const service = new WorkflowCrudService(deps);

      await service.prepareWorkflowDocumentForStorage({
        id: 'managed-workflow',
        yaml: lightweightWorkflowYaml,
        actor: 'system',
        lightweightValidation: true,
        now: new Date('2024-01-01T00:00:00.000Z'),
        spaceId: 'default',
        request: { auth: { credentials: { username: 'alice' } } } as any,
      });

      expect(deps.validationService.getWorkflowZodSchema).not.toHaveBeenCalled();
    });
  });

  describe('getWorkflow', () => {
    it('returns WorkflowDetailDto for existing workflow', async () => {
      const source = makeSource();
      const { deps, client } = makeDeps();
      client.search.mockResolvedValue({
        hits: { hits: [{ _id: 'wf-1', _source: source }] },
      });

      const service = new WorkflowCrudService(deps);
      const result = await service.getWorkflow('wf-1', 'default');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('wf-1');
      expect(result?.name).toBe('Test Workflow');
      expect(result?.createdAt).toBe('2024-01-01T00:00:00.000Z');
    });

    it('returns null when no hits returned', async () => {
      const { deps, client } = makeDeps();
      client.search.mockResolvedValue({ hits: { hits: [] } });

      const service = new WorkflowCrudService(deps);
      const result = await service.getWorkflow('wf-missing', 'default');

      expect(result).toBeNull();
    });

    it('returns null on 404 error', async () => {
      const { deps, client } = makeDeps();
      const notFoundError = new errors.ResponseError({
        statusCode: 404,
        body: { error: { type: 'index_not_found_exception' } },
        headers: {},
        warnings: [],
        meta: {} as any,
      });
      client.search.mockRejectedValue(notFoundError);

      const service = new WorkflowCrudService(deps);
      const result = await service.getWorkflow('wf-1', 'default');

      expect(result).toBeNull();
    });

    it('re-throws non-404 errors', async () => {
      const { deps, client } = makeDeps();
      const serverError = new Error('internal server error');
      client.search.mockRejectedValue(serverError);

      const service = new WorkflowCrudService(deps);

      await expect(service.getWorkflow('wf-1', 'default')).rejects.toThrow('internal server error');
    });

    it('excludes soft-deleted workflows by default', async () => {
      const { deps, client } = makeDeps();
      client.search.mockResolvedValue({ hits: { hits: [] } });

      const service = new WorkflowCrudService(deps);
      await service.getWorkflow('wf-1', 'default');

      const query = client.search.mock.calls[0][0].query.bool;
      expect(query.must_not).toContainEqual({ exists: { field: 'deleted_at' } });
    });

    it('includes soft-deleted workflows when opted in', async () => {
      const { deps, client } = makeDeps();
      client.search.mockResolvedValue({ hits: { hits: [] } });

      const service = new WorkflowCrudService(deps);
      await service.getWorkflow('wf-1', 'default', { includeDeleted: true });

      const query = client.search.mock.calls[0][0].query.bool;
      expect(query.must_not ?? []).not.toContainEqual({ exists: { field: 'deleted_at' } });
    });
  });

  describe('getWorkflowsByIds', () => {
    it('returns empty array for empty ids without querying storage', async () => {
      const { deps, client } = makeDeps();

      const service = new WorkflowCrudService(deps);
      const result = await service.getWorkflowsByIds([], 'default');

      expect(result).toEqual([]);
      expect(client.search).not.toHaveBeenCalled();
    });

    it('maps hits to WorkflowDetailDto array', async () => {
      const { deps, client } = makeDeps();
      client.search.mockResolvedValue({
        hits: {
          hits: [
            { _id: 'wf-1', _source: makeSource({ name: 'First' }) },
            { _id: 'wf-2', _source: makeSource({ name: 'Second' }) },
          ],
        },
      });

      const service = new WorkflowCrudService(deps);
      const result = await service.getWorkflowsByIds(['wf-1', 'wf-2'], 'default');

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('wf-1');
      expect(result[0].name).toBe('First');
      expect(result[1].id).toBe('wf-2');
      expect(result[1].name).toBe('Second');
    });

    it('passes ids as terms query and sets size to ids length', async () => {
      const { deps, client } = makeDeps();
      client.search.mockResolvedValue({ hits: { hits: [] } });

      const service = new WorkflowCrudService(deps);
      await service.getWorkflowsByIds(['wf-1', 'wf-2', 'wf-3'], 'default');

      const searchCall = client.search.mock.calls[0][0];
      expect(searchCall.size).toBe(3);
      expect(searchCall.track_total_hits).toBe(false);
      expect(searchCall.query.bool.must).toContainEqual({
        ids: { values: ['wf-1', 'wf-2', 'wf-3'] },
      });
    });
  });

  describe('getWorkflowsSourceByIds', () => {
    it('returns empty array for empty ids without querying storage', async () => {
      const { deps, client } = makeDeps();

      const service = new WorkflowCrudService(deps);
      const result = await service.getWorkflowsSourceByIds([], 'default');

      expect(result).toEqual([]);
      expect(client.search).not.toHaveBeenCalled();
    });

    it('passes custom source fields when provided', async () => {
      const { deps, client } = makeDeps();
      client.search.mockResolvedValue({ hits: { hits: [] } });

      const service = new WorkflowCrudService(deps);
      await service.getWorkflowsSourceByIds(['wf-1'], 'default', ['name', 'yaml']);

      const searchCall = client.search.mock.calls[0][0];
      expect(searchCall._source).toEqual(['name', 'yaml']);
    });

    it('uses _source: true when no source fields specified', async () => {
      const { deps, client } = makeDeps();
      client.search.mockResolvedValue({ hits: { hits: [] } });

      const service = new WorkflowCrudService(deps);
      await service.getWorkflowsSourceByIds(['wf-1'], 'default');

      const searchCall = client.search.mock.calls[0][0];
      expect(searchCall._source).toBe(true);
    });

    it('returns only the fields present on the narrowed _source (no fabricated undefineds)', async () => {
      const { deps, client } = makeDeps();
      client.search.mockResolvedValue({
        hits: {
          hits: [
            {
              _id: 'wf-1',
              _source: { name: 'only-name' },
            },
          ],
        },
      });

      const service = new WorkflowCrudService(deps);
      const result = await service.getWorkflowsSourceByIds(['wf-1'], 'default', ['name']);

      expect(result).toEqual([{ id: 'wf-1', name: 'only-name' }]);
      expect('yaml' in result[0]).toBe(false);
      expect('definition' in result[0]).toBe(false);
      expect('enabled' in result[0]).toBe(false);
    });
  });

  describe('getManagedWorkflowDocumentsAllSpaces', () => {
    it('filters managed workflow documents by plugin id when provided', async () => {
      const { deps, client } = makeDeps();
      client.search.mockResolvedValue({
        hits: {
          hits: [
            {
              _id: 'system-workflow',
              _source: makeSource({ managed: true, managedBy: 'testPlugin' }),
            },
          ],
        },
      });

      const service = new WorkflowCrudService(deps);
      const result = await service.getManagedWorkflowDocumentsAllSpaces({
        pluginId: 'testPlugin',
      });

      expect(result).toEqual([
        {
          id: 'system-workflow',
          source: expect.objectContaining({ managedBy: 'testPlugin' }),
        },
      ]);
      expect(client.search).toHaveBeenCalledWith(
        expect.objectContaining({
          query: {
            bool: expect.objectContaining({
              must: [{ term: { managed: true } }, { term: { managedBy: 'testPlugin' } }],
              must_not: [{ exists: { field: 'deleted_at' } }],
            }),
          },
        })
      );
    });
  });

  describe('createWorkflow', () => {
    const validYaml = [
      'name: My Workflow',
      'enabled: true',
      'triggers:',
      '  - type: manual',
      'steps:',
      '  - name: step-one',
      '    type: console',
      '    with:',
      '      message: "hi"',
    ].join('\n');

    const request = { auth: { credentials: { username: 'alice' } } } as any;

    it('validates the workflow id format before touching storage', async () => {
      const { deps, client } = makeDeps();
      const service = new WorkflowCrudService(deps);

      await expect(
        service.createWorkflow({ id: 'Invalid ID!', yaml: validYaml }, 'default', request)
      ).rejects.toThrow();
      expect(client.index).not.toHaveBeenCalled();
    });

    it('indexes a new workflow and returns the resulting DTO', async () => {
      const { deps, client } = makeDeps();
      // No existing workflow for the generated id.
      client.search.mockResolvedValue({ hits: { hits: [] } });

      const service = new WorkflowCrudService(deps);
      const result = await service.createWorkflow({ yaml: validYaml }, 'default', request);

      expect(result.name).toBe('My Workflow');
      expect(client.index).toHaveBeenCalledWith(
        expect.objectContaining({
          id: expect.any(String),
          refresh: true,
          document: expect.objectContaining({
            name: 'My Workflow',
            spaceId: 'default',
          }),
        })
      );
    });

    it('logs workflow create to change history after a successful index', async () => {
      const scopedChangeHistory = { logBulk: jest.fn() };
      const changeHistoryService = {
        isInitialized: () => true,
        asScoped: jest.fn().mockReturnValue(scopedChangeHistory),
      };
      const { deps, client } = makeDeps();
      deps.changeHistoryService = changeHistoryService as any;
      client.search.mockResolvedValue({ hits: { hits: [] } });

      const service = new WorkflowCrudService(deps);
      await service.createWorkflow({ yaml: validYaml }, 'default', request);

      expect(mockedLogWorkflowChanges).toHaveBeenCalledWith(
        expect.objectContaining({
          action: WorkflowChangeHistoryAction.workflowCreate,
          spaceId: 'default',
          scopedChangeHistory,
          workflows: [
            expect.objectContaining({
              document: expect.objectContaining({ name: 'My Workflow' }),
            }),
          ],
        })
      );
    });

    it('does not generate a reserved workflow ID from the YAML name', async () => {
      const { deps, client } = makeDeps();
      client.search.mockResolvedValue({ hits: { hits: [] } });
      const reservedNameYaml = validYaml.replace('name: My Workflow', 'name: system-workflow Copy');

      const service = new WorkflowCrudService(deps);
      const result = await service.createWorkflow({ yaml: reservedNameYaml }, 'default', request);

      expect(result.id).toBe('workflow-system-workflow-copy');
      expect(client.index).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'workflow-system-workflow-copy',
          op_type: 'create',
          document: expect.objectContaining({
            name: 'system-workflow Copy',
          }),
        })
      );
    });

    it('throws WorkflowConflictError when a user-supplied id matches an existing workflow (including tombstones)', async () => {
      const { deps, client } = makeDeps();
      // checkExistingIds uses an ids query (no bool/must_not) and is index-wide
      // so it implicitly includes tombstones — soft-deleted workflows still have
      // their _id, so they will be returned.
      client.search.mockResolvedValue({
        hits: {
          hits: [{ _id: 'dup-id', _source: makeSource({ name: 'existing' }) }],
        },
      });

      const service = new WorkflowCrudService(deps);
      await expect(
        service.createWorkflow({ id: 'dup-id', yaml: validYaml }, 'default', request)
      ).rejects.toThrow(/already exists/);
      expect(client.index).not.toHaveBeenCalled();

      // The ID-uniqueness check must NOT be space-scoped (workflow IDs are globally
      // unique to preserve the human-readable quality) and must NOT exclude tombstones.
      const searchArgs = client.search.mock.calls[0][0];
      expect(searchArgs.query).toEqual({ ids: { values: ['dup-id'] } });
    });

    // --- Global uniqueness + TOCTOU regression coverage ---------------------
    //
    // Workflow IDs are intentionally globally unique across the whole index
    // (no per-space prefix) so that a generated "human-readable" ID stays
    // human-readable regardless of which space the user is in. The fixes in
    // fix/unique-id-check make two changes that these tests guard:
    //   1. The duplicate-ID search is no longer space-scoped — a candidate
    //      taken in another space must still be detected.
    //   2. index/bulk writes use op_type:'create' so a concurrent writer that
    //      slipped between the precheck and the write surfaces as a 409 the
    //      service can recover from (server-generated → retry; user-supplied
    //      → fail loudly).

    it('produces different IDs for the same base name in two spaces (global uniqueness)', async () => {
      const { deps, client } = makeDeps();
      const yamlA = [
        'name: My Workflow',
        'enabled: true',
        'triggers:',
        '  - type: manual',
        'steps:',
        '  - name: s',
        '    type: console',
        '    with:',
        '      message: "m"',
      ].join('\n');

      // Space A: nothing in the index yet.
      client.search.mockResolvedValueOnce({ hits: { hits: [] } });

      const service = new WorkflowCrudService(deps);
      const resultA = await service.createWorkflow({ yaml: yamlA }, 'space-a', request);

      // Space B: the same human-readable base ID ("my-workflow") is now taken
      // globally, so the resolver must skip it and fall through to "my-workflow-1".
      client.search.mockResolvedValueOnce({
        hits: {
          hits: [{ _id: resultA.id, _source: makeSource({ spaceId: 'space-a' }) }],
        },
      });
      const resultB = await service.createWorkflow({ yaml: yamlA }, 'space-b', request);

      expect(resultA.id).toBe('my-workflow');
      expect(resultB.id).toBe('my-workflow-1');
      expect(resultA.id).not.toBe(resultB.id);

      // Both index() calls must use op_type:'create' so a concurrent writer
      // doesn't silently overwrite the other space's document.
      expect(client.index).toHaveBeenCalledTimes(2);
      expect(client.index).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          id: 'my-workflow',
          op_type: 'create',
          document: expect.objectContaining({ spaceId: 'space-a' }),
        })
      );
      expect(client.index).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          id: 'my-workflow-1',
          op_type: 'create',
          document: expect.objectContaining({ spaceId: 'space-b' }),
        })
      );
    });

    it('rejects a user-supplied ID that is taken in another space (global uniqueness)', async () => {
      const { deps, client } = makeDeps();
      // The user picks "shared-id" in space-b, but it is already taken in space-a.
      client.search.mockResolvedValue({
        hits: {
          hits: [{ _id: 'shared-id', _source: makeSource({ spaceId: 'space-a' }) }],
        },
      });

      const service = new WorkflowCrudService(deps);
      await expect(
        service.createWorkflow({ id: 'shared-id', yaml: validYaml }, 'space-b', request)
      ).rejects.toThrow(/already exists/);
      expect(client.index).not.toHaveBeenCalled();
    });

    it('rejects a user-supplied ID that matches a soft-deleted tombstone (any space)', async () => {
      const { deps, client } = makeDeps();
      // A workflow with this ID was soft-deleted earlier — the tombstone still
      // owns the `_id`, so reusing it would resurrect or collide with that doc.
      // The check must surface this case even though the document carries a
      // `deleted_at` timestamp and lives in a different space.
      client.search.mockResolvedValue({
        hits: {
          hits: [
            {
              _id: 'recycled-id',
              _source: makeSource({
                spaceId: 'space-other',
                deleted_at: '2024-06-01T00:00:00.000Z' as unknown as null,
              }),
            },
          ],
        },
      });

      const service = new WorkflowCrudService(deps);
      await expect(
        service.createWorkflow({ id: 'recycled-id', yaml: validYaml }, 'default', request)
      ).rejects.toThrow(/already exists/);
      expect(client.index).not.toHaveBeenCalled();

      // The check must use a flat ids query — a `bool.must_not exists deleted_at`
      // clause would silently let the caller reuse a tombstoned ID, which the
      // human-readable-ID contract forbids.
      const searchArgs = client.search.mock.calls[0][0];
      expect(searchArgs.query).toEqual({ ids: { values: ['recycled-id'] } });
    });

    it('skips a server-generated base ID that matches a soft-deleted tombstone', async () => {
      const { deps, client } = makeDeps();
      // The natural base ID derived from the YAML name ("my-workflow") is a
      // tombstone in some other space. The resolver must walk past it instead
      // of handing it back as available.
      client.search.mockResolvedValue({
        hits: {
          hits: [
            {
              _id: 'my-workflow',
              _source: makeSource({
                spaceId: 'space-other',
                deleted_at: '2024-06-01T00:00:00.000Z' as unknown as null,
              }),
            },
          ],
        },
      });

      const service = new WorkflowCrudService(deps);
      const result = await service.createWorkflow({ yaml: validYaml }, 'default', request);

      expect(result.id).toBe('my-workflow-1');
      expect(client.index).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'my-workflow-1', op_type: 'create' })
      );
    });

    it('retries a server-generated ID that loses a TOCTOU race (op_type:create returns 409)', async () => {
      const { deps, client } = makeDeps();
      // Precheck #1 (resolver): nothing exists, picks "my-workflow".
      client.search.mockResolvedValueOnce({ hits: { hits: [] } });
      // Precheck #2 after the 409 (re-resolve): "my-workflow" now appears taken.
      client.search.mockResolvedValueOnce({
        hits: {
          hits: [{ _id: 'my-workflow', _source: makeSource() }],
        },
      });

      const conflict = Object.assign(new Error('version conflict'), {
        statusCode: 409,
        meta: { statusCode: 409 },
      });
      client.index
        .mockRejectedValueOnce(conflict) // first attempt loses the race
        .mockResolvedValueOnce({ result: 'created', _seq_no: 1, _primary_term: 1 }); // retry succeeds

      const service = new WorkflowCrudService(deps);
      const result = await service.createWorkflow({ yaml: validYaml }, 'default', request);

      expect(result.id).toBe('my-workflow-1');
      expect(client.index).toHaveBeenCalledTimes(2);
      expect(client.index).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ id: 'my-workflow', op_type: 'create' })
      );
      expect(client.index).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ id: 'my-workflow-1', op_type: 'create' })
      );
    });

    it('does NOT retry a user-supplied ID that loses a TOCTOU race (caller picked the ID)', async () => {
      const { deps, client } = makeDeps();
      // Precheck says it is free at the moment of the call.
      client.search.mockResolvedValue({ hits: { hits: [] } });
      const conflict = Object.assign(new Error('version conflict'), {
        statusCode: 409,
        meta: { statusCode: 409 },
      });
      client.index.mockRejectedValueOnce(conflict);

      const service = new WorkflowCrudService(deps);
      await expect(
        service.createWorkflow({ id: 'my-id', yaml: validYaml }, 'default', request)
      ).rejects.toThrow(/already exists/);
      // No retry: caller picked the ID and silently rewriting it would be wrong.
      expect(client.index).toHaveBeenCalledTimes(1);
    });

    it('re-throws non-409 errors from index() without retrying', async () => {
      const { deps, client } = makeDeps();
      client.search.mockResolvedValue({ hits: { hits: [] } });
      const serverErr = Object.assign(new Error('cluster_block_exception'), {
        statusCode: 503,
      });
      client.index.mockRejectedValueOnce(serverErr);

      const service = new WorkflowCrudService(deps);
      await expect(service.createWorkflow({ yaml: validYaml }, 'default', request)).rejects.toThrow(
        /cluster_block_exception/
      );
      expect(client.index).toHaveBeenCalledTimes(1);
    });

    it('gives up after the TOCTOU retry budget when every attempt loses the race', async () => {
      const { deps, client } = makeDeps();
      // Every precheck reports the index is free, but every write loses to a concurrent writer.
      client.search.mockResolvedValue({ hits: { hits: [] } });
      const conflict = Object.assign(new Error('version conflict'), {
        statusCode: 409,
        meta: { statusCode: 409 },
      });
      client.index.mockRejectedValue(conflict);

      const service = new WorkflowCrudService(deps);
      await expect(service.createWorkflow({ yaml: validYaml }, 'default', request)).rejects.toThrow(
        /Failed to allocate a unique workflow id/
      );
      // 1 initial attempt + bounded retries — must NOT be unbounded.
      expect(client.index.mock.calls.length).toBeGreaterThan(1);
      expect(client.index.mock.calls.length).toBeLessThan(20);
    });
  });

  describe('bulkCreateWorkflows', () => {
    const validYaml = (name: string) =>
      [
        `name: ${name}`,
        'enabled: true',
        'triggers:',
        '  - type: manual',
        'steps:',
        '  - name: step',
        '    type: console',
        '    with:',
        '      message: "m"',
      ].join('\n');

    const request = { auth: { credentials: { username: 'alice' } } } as any;

    it('returns empty result for an empty workflow list and does not call bulk', async () => {
      const { deps, client } = makeDeps();
      const service = new WorkflowCrudService(deps);

      const result = await service.bulkCreateWorkflows([], 'default', request);

      expect(result).toEqual({ created: [], failed: [] });
      expect(client.bulk).not.toHaveBeenCalled();
    });

    it('maps per-item bulk failures to the failed list while still returning successes', async () => {
      const { deps, client } = makeDeps();
      client.search.mockResolvedValue({ hits: { hits: [] } });
      // User-supplied IDs surface 409s directly (caller picked the ID, so
      // the service must not silently rewrite it).
      client.bulk.mockResolvedValue({
        items: [
          { create: { _id: 'id-a', status: 201 } },
          {
            create: {
              _id: 'id-b',
              status: 409,
              error: { type: 'version_conflict_engine_exception', reason: 'exists' },
            },
          },
        ],
      });

      const service = new WorkflowCrudService(deps);
      const result = await service.bulkCreateWorkflows(
        [
          { id: 'id-a', yaml: validYaml('A') },
          { id: 'id-b', yaml: validYaml('B') },
        ],
        'default',
        request
      );

      expect(result.created).toHaveLength(1);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].error).toMatch(/exists/);
    });

    it('uses index (overwrite) vs create (no overwrite) based on the option flag', async () => {
      const { deps, client } = makeDeps();
      client.search.mockResolvedValue({ hits: { hits: [] } });
      client.bulk.mockResolvedValue({
        items: [{ index: { _id: 'id-a', status: 200 } }],
      });

      const service = new WorkflowCrudService(deps);
      await service.bulkCreateWorkflows([{ yaml: validYaml('A') }], 'default', request, {
        overwrite: true,
      });

      const ops = client.bulk.mock.calls[0][0].operations;
      expect(ops[0]).toHaveProperty('index');
      expect(ops[0]).not.toHaveProperty('create');

      client.bulk.mockClear();
      client.bulk.mockResolvedValue({
        items: [{ create: { _id: 'id-b', status: 201 } }],
      });
      await service.bulkCreateWorkflows([{ yaml: validYaml('B') }], 'default', request);
      const opsNoOverwrite = client.bulk.mock.calls[0][0].operations;
      expect(opsNoOverwrite[0]).toHaveProperty('create');
      expect(opsNoOverwrite[0]).not.toHaveProperty('index');
    });

    it('rejects a user-supplied id that collides with an existing workflow when overwrite=false', async () => {
      const { deps, client } = makeDeps();
      // Initial dup-check search during resolveAndDeduplicateBulkIds.
      client.search.mockResolvedValue({
        hits: {
          hits: [{ _id: 'taken-id', _source: makeSource() }],
        },
      });

      const service = new WorkflowCrudService(deps);
      const result = await service.bulkCreateWorkflows(
        [{ id: 'taken-id', yaml: validYaml('taken') }],
        'default',
        request
      );

      expect(result.created).toEqual([]);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].id).toBe('taken-id');
      // bulk must not be issued when every valid entry has been filtered out.
      expect(client.bulk).not.toHaveBeenCalled();
    });

    it('dedupes duplicate user-supplied ids within the same batch (first one wins)', async () => {
      const { deps, client } = makeDeps();
      client.search.mockResolvedValue({ hits: { hits: [] } });
      client.bulk.mockResolvedValue({
        items: [{ create: { _id: 'same', status: 201 } }],
      });

      const service = new WorkflowCrudService(deps);
      const result = await service.bulkCreateWorkflows(
        [
          { id: 'same', yaml: validYaml('one') },
          { id: 'same', yaml: validYaml('two') },
        ],
        'default',
        request
      );

      expect(result.created).toHaveLength(1);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].id).toBe('same');
    });

    const makeTaskScheduler = () => ({
      scheduleWorkflowTasks: jest.fn().mockResolvedValue([]),
      scheduleWorkflowTask: jest.fn().mockResolvedValue('task-id'),
      unscheduleWorkflowTasks: jest.fn().mockResolvedValue(undefined),
      updateWorkflowTasks: jest.fn().mockResolvedValue(undefined),
    });

    it('overwrite=true unschedules orphaned tasks when the new workflow has no scheduled triggers', async () => {
      const taskScheduler = makeTaskScheduler();
      const { deps, client } = makeDeps();
      (deps as any).getTaskScheduler = () => taskScheduler;

      client.bulk.mockResolvedValue({ items: [{ index: { _id: 'wf-1', status: 200 } }] });
      // Pre-bulk read for overwrite version bump, then post-write re-read for scheduler sync.
      client.search
        .mockResolvedValueOnce({
          hits: {
            hits: [
              {
                _id: 'wf-1',
                _source: makeSource({ version: 4 }),
              },
            ],
          },
        })
        .mockResolvedValueOnce({
          hits: {
            hits: [
              {
                _id: 'wf-1',
                _source: makeSource({
                  enabled: true,
                  valid: true,
                  definition: {
                    name: 'A',
                    enabled: true,
                    triggers: [{ type: 'manual' }],
                    steps: [],
                  } as any,
                }),
              },
            ],
          },
        });

      const service = new WorkflowCrudService(deps);
      await service.bulkCreateWorkflows(
        [{ id: 'wf-1', yaml: validYaml('A') }],
        'default',
        request,
        { overwrite: true }
      );

      expect(taskScheduler.unscheduleWorkflowTasks).toHaveBeenCalledWith('wf-1');
      expect(taskScheduler.updateWorkflowTasks).not.toHaveBeenCalled();
    });

    it('overwrite=true reschedules in place when the persisted workflow still has a scheduled trigger', async () => {
      const taskScheduler = makeTaskScheduler();
      const { deps, client } = makeDeps();
      (deps as any).getTaskScheduler = () => taskScheduler;

      client.bulk.mockResolvedValue({ items: [{ index: { _id: 'wf-1', status: 200 } }] });
      client.search
        .mockResolvedValueOnce({
          hits: {
            hits: [
              {
                _id: 'wf-1',
                _source: makeSource({ version: 2 }),
              },
            ],
          },
        })
        .mockResolvedValueOnce({
          hits: {
            hits: [
              {
                _id: 'wf-1',
                _source: makeSource({
                  enabled: true,
                  valid: true,
                  definition: {
                    name: 'A',
                    enabled: true,
                    triggers: [{ type: 'scheduled', with: { every: '5m' } }],
                    steps: [],
                  } as any,
                }),
              },
            ],
          },
        });

      const service = new WorkflowCrudService(deps);
      await service.bulkCreateWorkflows(
        [{ id: 'wf-1', yaml: validYaml('A') }],
        'default',
        request,
        { overwrite: true }
      );

      expect(taskScheduler.updateWorkflowTasks).toHaveBeenCalledTimes(1);
      expect(taskScheduler.updateWorkflowTasks).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'wf-1' }),
        'default',
        request
      );
      expect(taskScheduler.unscheduleWorkflowTasks).not.toHaveBeenCalled();
    });

    it('overwrite=true unschedules when the persisted workflow has scheduled triggers but is disabled', async () => {
      const taskScheduler = makeTaskScheduler();
      const { deps, client } = makeDeps();
      (deps as any).getTaskScheduler = () => taskScheduler;

      client.bulk.mockResolvedValue({ items: [{ index: { _id: 'wf-1', status: 200 } }] });
      client.search
        .mockResolvedValueOnce({
          hits: {
            hits: [
              {
                _id: 'wf-1',
                _source: makeSource({ version: 1 }),
              },
            ],
          },
        })
        .mockResolvedValueOnce({
          hits: {
            hits: [
              {
                _id: 'wf-1',
                _source: makeSource({
                  enabled: false,
                  valid: true,
                  definition: {
                    name: 'A',
                    enabled: false,
                    triggers: [{ type: 'scheduled', with: { every: '5m' } }],
                    steps: [],
                  } as any,
                }),
              },
            ],
          },
        });

      const service = new WorkflowCrudService(deps);
      await service.bulkCreateWorkflows(
        [{ id: 'wf-1', yaml: validYaml('A') }],
        'default',
        request,
        { overwrite: true }
      );

      expect(taskScheduler.unscheduleWorkflowTasks).toHaveBeenCalledWith('wf-1');
      expect(taskScheduler.updateWorkflowTasks).not.toHaveBeenCalled();
    });

    it('overwrite=false keeps the additive schedule path and never issues a post-write re-read', async () => {
      const taskScheduler = makeTaskScheduler();
      const { deps, client } = makeDeps();
      (deps as any).getTaskScheduler = () => taskScheduler;

      client.search.mockResolvedValue({ hits: { hits: [] } });
      client.bulk.mockResolvedValue({ items: [{ create: { _id: 'gen-id', status: 201 } }] });

      const service = new WorkflowCrudService(deps);
      await service.bulkCreateWorkflows([{ yaml: validYaml('A') }], 'default', request);

      expect(taskScheduler.updateWorkflowTasks).not.toHaveBeenCalled();
      expect(taskScheduler.unscheduleWorkflowTasks).not.toHaveBeenCalled();
      expect(taskScheduler.scheduleWorkflowTask).not.toHaveBeenCalled();
      // Only the ID-resolution search runs — no post-write re-read for `syncSchedulerAfterSave`.
      expect(client.search).toHaveBeenCalledTimes(1);
    });

    // --- Global uniqueness + TOCTOU regression coverage ---------------------

    it('rejects bulk user-supplied IDs that are taken in another space (global uniqueness)', async () => {
      const { deps, client } = makeDeps();
      // resolveAndDeduplicateBulkIds queries existing IDs across the whole index;
      // a hit in another space must still surface as a conflict.
      client.search.mockResolvedValue({
        hits: {
          hits: [{ _id: 'taken', _source: makeSource({ spaceId: 'space-other' }) }],
        },
      });

      const service = new WorkflowCrudService(deps);
      const result = await service.bulkCreateWorkflows(
        [{ id: 'taken', yaml: validYaml('A') }],
        'space-current',
        request
      );

      expect(result.created).toEqual([]);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].id).toBe('taken');
      expect(client.bulk).not.toHaveBeenCalled();

      // The lookup must NOT include a spaceId filter — that's the regression
      // we're guarding. The query should be a flat ids query.
      const searchArgs = client.search.mock.calls[0][0];
      expect(searchArgs.query).toEqual({ ids: { values: ['taken'] } });
    });

    it('rejects a bulk user-supplied ID that matches a soft-deleted tombstone', async () => {
      const { deps, client } = makeDeps();
      // The collision lookup must include tombstones — bulk reuse of a
      // soft-deleted ID is just as wrong as direct create reuse.
      client.search.mockResolvedValue({
        hits: {
          hits: [
            {
              _id: 'recycled-id',
              _source: makeSource({
                spaceId: 'space-other',
                deleted_at: '2024-06-01T00:00:00.000Z' as unknown as null,
              }),
            },
          ],
        },
      });

      const service = new WorkflowCrudService(deps);
      const result = await service.bulkCreateWorkflows(
        [{ id: 'recycled-id', yaml: validYaml('A') }],
        'default',
        request
      );

      expect(result.created).toEqual([]);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].id).toBe('recycled-id');
      expect(client.bulk).not.toHaveBeenCalled();
    });

    it('queries the ID index globally without a spaceId filter for server-generated IDs', async () => {
      const { deps, client } = makeDeps();
      client.search.mockResolvedValue({ hits: { hits: [] } });
      client.bulk.mockResolvedValue({ items: [{ create: { _id: 'a', status: 201 } }] });

      const service = new WorkflowCrudService(deps);
      await service.bulkCreateWorkflows([{ yaml: validYaml('A') }], 'space-x', request);

      // The collision query must be a flat ids query — no `bool.must` term on spaceId.
      const searchArgs = client.search.mock.calls[0][0];
      expect(searchArgs.query).toMatchObject({ ids: { values: expect.any(Array) } });
      expect(searchArgs.query.bool).toBeUndefined();
    });

    it('retries server-generated bulk entries that hit a 409 in the bulk response', async () => {
      const { deps, client } = makeDeps();
      // First lookup: nothing is taken — resolver picks "my-workflow".
      client.search.mockResolvedValueOnce({ hits: { hits: [] } });
      // First bulk: the only entry loses the race with status 409.
      client.bulk.mockResolvedValueOnce({
        items: [
          {
            create: {
              _id: 'my-workflow',
              status: 409,
              error: { type: 'version_conflict_engine_exception', reason: 'exists' },
            },
          },
        ],
      });
      // Re-resolve lookup: "my-workflow" is now taken in the index.
      client.search.mockResolvedValueOnce({
        hits: { hits: [{ _id: 'my-workflow', _source: makeSource() }] },
      });
      // Second bulk: succeeds with the next candidate "my-workflow-1".
      client.bulk.mockResolvedValueOnce({
        items: [{ create: { _id: 'my-workflow-1', status: 201 } }],
      });

      const service = new WorkflowCrudService(deps);
      const result = await service.bulkCreateWorkflows(
        [{ yaml: validYaml('My Workflow') }],
        'default',
        request
      );

      expect(result.created).toHaveLength(1);
      expect(result.created[0].id).toBe('my-workflow-1');
      expect(result.failed).toHaveLength(0);
      expect(client.bulk).toHaveBeenCalledTimes(2);
    });

    it('does NOT retry user-supplied bulk entries that hit a 409 in the bulk response', async () => {
      const { deps, client } = makeDeps();
      client.search.mockResolvedValue({ hits: { hits: [] } });
      client.bulk.mockResolvedValueOnce({
        items: [
          {
            create: {
              _id: 'fixed',
              status: 409,
              error: { type: 'version_conflict_engine_exception', reason: 'exists' },
            },
          },
        ],
      });

      const service = new WorkflowCrudService(deps);
      const result = await service.bulkCreateWorkflows(
        [{ id: 'fixed', yaml: validYaml('A') }],
        'default',
        request
      );

      expect(result.created).toEqual([]);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].id).toBe('fixed');
      // User-supplied IDs are surfaced directly — no retry, no second bulk call.
      expect(client.bulk).toHaveBeenCalledTimes(1);
    });
  });

  describe('updateWorkflow', () => {
    const request = { auth: { credentials: { username: 'alice' } } } as any;

    it('throws when the workflow does not exist', async () => {
      const { deps, client } = makeDeps();
      client.search.mockResolvedValue({ hits: { hits: [] } });

      const service = new WorkflowCrudService(deps);
      await expect(
        service.updateWorkflow('missing', { enabled: false }, 'default', request)
      ).rejects.toThrow('Workflow with id missing not found');
      expect(client.index).not.toHaveBeenCalled();
    });

    it('patches fields and indexes the merged document', async () => {
      const { deps, client } = makeDeps();
      client.search.mockResolvedValue({
        hits: {
          hits: [
            {
              _id: 'wf-1',
              _source: makeSource({ name: 'Before', enabled: true, tags: ['t1'] }),
              _seq_no: 5,
              _primary_term: 1,
            },
          ],
        },
      });

      const service = new WorkflowCrudService(deps);
      const result = await service.updateWorkflow(
        'wf-1',
        { tags: ['t1', 't2'] } as any,
        'default',
        request
      );

      expect(result.id).toBe('wf-1');
      expect(client.index).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'wf-1',
          refresh: true,
          if_seq_no: 5,
          if_primary_term: 1,
          document: expect.objectContaining({
            tags: ['t1', 't2'],
            lastUpdatedBy: 'alice',
          }),
        })
      );
    });

    it('logs workflow update to change history after a successful write', async () => {
      const scopedChangeHistory = { logBulk: jest.fn() };
      const changeHistoryService = {
        isInitialized: () => true,
        asScoped: jest.fn().mockReturnValue(scopedChangeHistory),
      };
      const { deps, client } = makeDeps();
      deps.changeHistoryService = changeHistoryService as any;
      client.search.mockResolvedValue({
        hits: {
          hits: [
            {
              _id: 'wf-1',
              _source: makeSource({ name: 'Before', enabled: true, tags: ['t1'], version: 4 }),
              _seq_no: 5,
              _primary_term: 1,
            },
          ],
        },
      });

      const service = new WorkflowCrudService(deps);
      await service.updateWorkflow('wf-1', { tags: ['t1', 't2'] } as any, 'default', request);

      expect(mockedLogWorkflowChanges).toHaveBeenCalledWith(
        expect.objectContaining({
          action: WorkflowChangeHistoryAction.workflowUpdate,
          spaceId: 'default',
          scopedChangeHistory,
          workflows: [
            expect.objectContaining({
              id: 'wf-1',
              document: expect.objectContaining({ tags: ['t1', 't2'], version: 5 }),
            }),
          ],
        })
      );
    });

    it('records the caller in lastUpdatedBy on every update', async () => {
      const { deps, client } = makeDeps();
      client.search.mockResolvedValue({
        hits: {
          hits: [
            {
              _id: 'wf-1',
              _source: makeSource({ lastUpdatedBy: 'someone-else' }),
              _seq_no: 2,
              _primary_term: 1,
            },
          ],
        },
      });

      const service = new WorkflowCrudService(deps);
      await service.updateWorkflow('wf-1', { tags: ['new'] } as any, 'default', request);

      expect(client.index.mock.calls[0][0].document.lastUpdatedBy).toBe('alice');
    });

    it('retries after a version conflict and merges against a fresh read', async () => {
      const { deps, client } = makeDeps();
      client.search
        .mockResolvedValueOnce({
          hits: {
            hits: [
              {
                _id: 'wf-1',
                _source: makeSource({ name: 'Before', tags: ['t1'], version: 5 }),
                _seq_no: 5,
                _primary_term: 1,
              },
            ],
          },
        })
        .mockResolvedValueOnce({
          hits: {
            hits: [
              {
                _id: 'wf-1',
                _source: makeSource({
                  name: 'Concurrent Name',
                  tags: ['t1'],
                  version: 6,
                }),
                _seq_no: 8,
                _primary_term: 1,
              },
            ],
          },
        });

      const conflict = Object.assign(new Error('version conflict'), {
        statusCode: 409,
        meta: { statusCode: 409 },
      });
      client.index
        .mockRejectedValueOnce(conflict)
        .mockResolvedValueOnce({ result: 'updated', _seq_no: 9, _primary_term: 1 });

      const service = new WorkflowCrudService(deps);
      const result = await service.updateWorkflow(
        'wf-1',
        { tags: ['t1', 't2'] } as any,
        'default',
        request
      );

      expect(result.id).toBe('wf-1');
      expect(client.search).toHaveBeenCalledTimes(2);
      expect(client.search.mock.calls[0][0]).toEqual(
        expect.objectContaining({ seq_no_primary_term: true })
      );
      expect(client.index).toHaveBeenCalledTimes(2);
      expect(client.index).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          id: 'wf-1',
          if_seq_no: 5,
          if_primary_term: 1,
          document: expect.objectContaining({ version: 6 }),
        })
      );
      expect(client.index).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          id: 'wf-1',
          if_seq_no: 8,
          if_primary_term: 1,
          document: expect.objectContaining({
            name: 'Concurrent Name',
            tags: ['t1', 't2'],
            lastUpdatedBy: 'alice',
            version: 7,
          }),
        })
      );
    });

    it('increments version from the existing document on update', async () => {
      const { deps, client } = makeDeps();
      client.search.mockResolvedValue({
        hits: {
          hits: [
            {
              _id: 'wf-1',
              _source: makeSource({ version: 12 }),
              _seq_no: 2,
              _primary_term: 1,
            },
          ],
        },
      });

      const service = new WorkflowCrudService(deps);
      await service.updateWorkflow('wf-1', { enabled: false }, 'default', request);

      expect(client.index).toHaveBeenCalledWith(
        expect.objectContaining({
          document: expect.objectContaining({ version: 13, enabled: false }),
        })
      );
    });

    it('does not increment version when workflow versioning uiSetting is disabled', async () => {
      const { deps, client } = makeDeps(undefined, { workflowVersioningEnabled: false });
      client.search.mockResolvedValue({
        hits: {
          hits: [
            {
              _id: 'wf-1',
              _source: makeSource({ version: 12 }),
              _seq_no: 2,
              _primary_term: 1,
            },
          ],
        },
      });

      const service = new WorkflowCrudService(deps);
      await service.updateWorkflow('wf-1', { enabled: false }, 'default', request);

      expect(client.index).toHaveBeenCalledWith(
        expect.objectContaining({
          document: expect.objectContaining({ version: 12, enabled: false }),
        })
      );
    });

    it('reads global and soft-deleted workflows when applying OCC updates', async () => {
      const { deps, client } = makeDeps();
      client.search.mockResolvedValue({
        hits: {
          hits: [
            {
              _id: 'wf-global',
              _source: makeSource({ spaceId: '*', tags: ['global'] }),
              _seq_no: 2,
              _primary_term: 1,
            },
          ],
        },
      });

      const service = new WorkflowCrudService(deps);
      await service.updateWorkflow(
        'wf-global',
        { tags: ['global', 'updated'] } as any,
        'default',
        request
      );

      expect(client.search).toHaveBeenCalledWith(
        expect.objectContaining({
          seq_no_primary_term: true,
          query: {
            bool: {
              must: [
                { ids: { values: ['wf-global'] } },
                {
                  bool: {
                    should: [{ term: { spaceId: 'default' } }, { term: { spaceId: '*' } }],
                    minimum_should_match: 1,
                  },
                },
              ],
              must_not: [],
            },
          },
        })
      );
    });

    it('validates YAML once per request even when OCC retries after a conflict', async () => {
      const applyYamlUpdateSpy = jest.spyOn(workflowPrepare, 'applyYamlUpdate');
      const { deps, client } = makeDeps({
        search: jest.fn(),
      });
      client.search
        .mockResolvedValueOnce({
          hits: {
            hits: [
              {
                _id: 'wf-1',
                _source: makeSource({ yaml: lightweightWorkflowYaml }),
                _seq_no: 1,
                _primary_term: 1,
              },
            ],
          },
        })
        .mockResolvedValueOnce({
          hits: {
            hits: [
              {
                _id: 'wf-1',
                _source: makeSource({ yaml: lightweightWorkflowYaml, name: 'Concurrent Name' }),
                _seq_no: 4,
                _primary_term: 1,
              },
            ],
          },
        });

      const conflict = Object.assign(new Error('version conflict'), {
        statusCode: 409,
        meta: { statusCode: 409 },
      });
      client.index
        .mockRejectedValueOnce(conflict)
        .mockResolvedValueOnce({ result: 'updated', _seq_no: 5, _primary_term: 1 });

      const service = new WorkflowCrudService(deps);
      await service.updateWorkflow(
        'wf-1',
        { yaml: lightweightWorkflowYaml } as any,
        'default',
        request
      );

      expect(applyYamlUpdateSpy).toHaveBeenCalledTimes(1);
      applyYamlUpdateSpy.mockRestore();
    });

    it('applies hoisted YAML patch to the indexed document', async () => {
      const yamlWithoutTopLevelEnabled = [
        'name: Parsed Workflow',
        'triggers:',
        '  - type: manual',
        'steps:',
        '  - name: step-one',
        '    type: console',
        '    with:',
        '      message: "hi"',
      ].join('\n');
      const parsedDefinition = {
        name: 'Parsed Workflow',
        enabled: true,
        version: '1' as const,
        triggers: [],
        steps: [],
      };

      jest.spyOn(workflowPrepare, 'applyYamlUpdate').mockReturnValue({
        updatedDataPatch: {
          definition: parsedDefinition,
          name: 'Parsed Workflow',
          enabled: true,
          description: '',
          tags: [],
          triggerTypes: ['manual'],
          valid: true,
          yaml: yamlWithoutTopLevelEnabled,
        },
        validationErrors: [],
        shouldUpdateScheduler: true,
      });

      const { deps, client } = makeDeps();
      client.search.mockResolvedValue({
        hits: {
          hits: [
            {
              _id: 'wf-1',
              _source: makeSource({ name: 'Stored Name', yaml: 'name: Stored Name' }),
              _seq_no: 3,
              _primary_term: 1,
            },
          ],
        },
      });

      const service = new WorkflowCrudService(deps);
      const result = await service.updateWorkflow(
        'wf-1',
        { yaml: yamlWithoutTopLevelEnabled } as any,
        'default',
        request
      );

      expect(result.validationErrors).toEqual([]);
      expect(result.valid).toBe(true);
      expect(client.index).toHaveBeenCalledWith(
        expect.objectContaining({
          document: expect.objectContaining({
            yaml: yamlWithoutTopLevelEnabled,
            name: 'Parsed Workflow',
            definition: parsedDefinition,
            valid: true,
          }),
        })
      );

      jest.restoreAllMocks();
    });

    it('resolves enabled from fresh existingSource on YAML OCC retry when yaml omits top-level enabled', async () => {
      const yamlWithoutTopLevelEnabled = [
        'name: Parsed Workflow',
        'triggers:',
        '  - type: manual',
        'steps:',
        '  - name: step-one',
        '    type: console',
        '    with:',
        '      message: "hi"',
      ].join('\n');
      const parsedDefinition = {
        name: 'Parsed Workflow',
        enabled: false,
        version: '1' as const,
        triggers: [],
        steps: [],
      };

      jest.spyOn(workflowPrepare, 'applyYamlUpdate').mockReturnValue({
        updatedDataPatch: {
          definition: parsedDefinition,
          name: 'Parsed Workflow',
          enabled: true,
          description: '',
          tags: [],
          triggerTypes: ['manual'],
          valid: true,
          yaml: yamlWithoutTopLevelEnabled,
        },
        validationErrors: [],
        shouldUpdateScheduler: true,
      });

      const { deps, client } = makeDeps();
      client.search
        .mockResolvedValueOnce({
          hits: {
            hits: [
              {
                _id: 'wf-1',
                _source: makeSource({ enabled: false, yaml: yamlWithoutTopLevelEnabled }),
                _seq_no: 1,
                _primary_term: 1,
              },
            ],
          },
        })
        .mockResolvedValueOnce({
          hits: {
            hits: [
              {
                _id: 'wf-1',
                _source: makeSource({ enabled: true, yaml: yamlWithoutTopLevelEnabled }),
                _seq_no: 4,
                _primary_term: 1,
              },
            ],
          },
        });

      const conflict = Object.assign(new Error('version conflict'), {
        statusCode: 409,
        meta: { statusCode: 409 },
      });
      client.index
        .mockRejectedValueOnce(conflict)
        .mockResolvedValueOnce({ result: 'updated', _seq_no: 5, _primary_term: 1 });

      const service = new WorkflowCrudService(deps);
      await service.updateWorkflow(
        'wf-1',
        { yaml: yamlWithoutTopLevelEnabled } as any,
        'default',
        request
      );

      expect(client.index).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          document: expect.objectContaining({ enabled: false }),
        })
      );
      expect(client.index).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          document: expect.objectContaining({
            enabled: true,
            definition: expect.objectContaining({ enabled: true }),
          }),
        })
      );

      jest.restoreAllMocks();
    });

    it('re-applies field updates against fresh existingSource on each OCC retry', async () => {
      const applyFieldUpdatesSpy = jest.spyOn(workflowPrepare, 'applyFieldUpdates');
      const { deps, client } = makeDeps();
      client.search
        .mockResolvedValueOnce({
          hits: {
            hits: [
              {
                _id: 'wf-1',
                _source: makeSource({ name: 'Before', tags: ['t1'] }),
                _seq_no: 5,
                _primary_term: 1,
              },
            ],
          },
        })
        .mockResolvedValueOnce({
          hits: {
            hits: [
              {
                _id: 'wf-1',
                _source: makeSource({ name: 'Concurrent Name', tags: ['t1'] }),
                _seq_no: 8,
                _primary_term: 1,
              },
            ],
          },
        });

      const conflict = Object.assign(new Error('version conflict'), {
        statusCode: 409,
        meta: { statusCode: 409 },
      });
      client.index
        .mockRejectedValueOnce(conflict)
        .mockResolvedValueOnce({ result: 'updated', _seq_no: 9, _primary_term: 1 });

      const service = new WorkflowCrudService(deps);
      await service.updateWorkflow('wf-1', { tags: ['t1', 't2'] } as any, 'default', request);

      expect(applyFieldUpdatesSpy).toHaveBeenCalledTimes(2);
      expect(applyFieldUpdatesSpy).toHaveBeenNthCalledWith(
        1,
        { tags: ['t1', 't2'] },
        expect.objectContaining({ name: 'Before' })
      );
      expect(applyFieldUpdatesSpy).toHaveBeenNthCalledWith(
        2,
        { tags: ['t1', 't2'] },
        expect.objectContaining({ name: 'Concurrent Name' })
      );

      applyFieldUpdatesSpy.mockRestore();
    });

    it('returns hoisted YAML validation errors without changing stored definition', async () => {
      jest.spyOn(workflowPrepare, 'applyYamlUpdate').mockReturnValue({
        updatedDataPatch: {
          definition: null,
          enabled: false,
          valid: false,
          triggerTypes: [],
        },
        validationErrors: ['YAML parse error'],
        shouldUpdateScheduler: true,
      });

      const { deps, client } = makeDeps();
      client.search.mockResolvedValue({
        hits: {
          hits: [
            {
              _id: 'wf-1',
              _source: makeSource({
                definition: {
                  name: 'Existing',
                  enabled: true,
                  version: '1' as const,
                  triggers: [],
                  steps: [],
                },
                valid: true,
              }),
              _seq_no: 2,
              _primary_term: 1,
            },
          ],
        },
      });

      const service = new WorkflowCrudService(deps);
      const result = await service.updateWorkflow(
        'wf-1',
        { yaml: 'invalid: yaml:' } as any,
        'default',
        request
      );

      expect(result.validationErrors).toEqual(['YAML parse error']);
      expect(result.valid).toBe(false);
      expect(client.index).toHaveBeenCalledWith(
        expect.objectContaining({
          document: expect.objectContaining({
            definition: null,
            valid: false,
            enabled: false,
          }),
        })
      );

      jest.restoreAllMocks();
    });

    it('skips YAML merge when the zod schema is unavailable', async () => {
      const applyYamlUpdateSpy = jest.spyOn(workflowPrepare, 'applyYamlUpdate');
      const { deps, client } = makeDeps();
      (deps.validationService.getWorkflowZodSchema as jest.Mock).mockResolvedValue(undefined);

      client.search.mockResolvedValue({
        hits: {
          hits: [
            {
              _id: 'wf-1',
              _source: makeSource({ name: 'Stored Name', tags: ['keep-me'] }),
              _seq_no: 2,
              _primary_term: 1,
            },
          ],
        },
      });

      const service = new WorkflowCrudService(deps);
      const result = await service.updateWorkflow(
        'wf-1',
        { yaml: lightweightWorkflowYaml } as any,
        'default',
        request
      );

      expect(applyYamlUpdateSpy).not.toHaveBeenCalled();
      expect(result.validationErrors).toEqual([]);
      expect(client.index).toHaveBeenCalledWith(
        expect.objectContaining({
          document: expect.objectContaining({
            name: 'Stored Name',
            tags: ['keep-me'],
            lastUpdatedBy: 'alice',
          }),
        })
      );

      applyYamlUpdateSpy.mockRestore();
    });
  });
});
