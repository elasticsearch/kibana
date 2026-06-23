/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

jest.mock('../utils/with_availability_check', () => ({
  withAvailabilityCheck: (handler: any) => handler,
}));
jest.mock('../utils/route_error_handlers', () => ({
  handleRouteError: jest.fn(),
}));
jest.mock('../../../services/workflow_change_history_service');
jest.mock('../../../lib/is_workflow_versioning_enabled', () => ({
  readWorkflowVersioningEnabled: jest.fn().mockResolvedValue(true),
}));

import { errors } from '@elastic/elasticsearch';
import { coreMock, httpServerMock } from '@kbn/core/server/mocks';
import { loggerMock } from '@kbn/logging-mocks';
import { WorkflowsManagementApiActions } from '@kbn/workflows';
import { workflowsExecutionEngineMock } from '@kbn/workflows-execution-engine/server/mocks';
import type { WorkflowsExecutionEnginePluginStart } from '@kbn/workflows-execution-engine/server/types';
import {
  WORKFLOWS_EXECUTIONS_INDEX,
  WORKFLOWS_INDEX,
  WORKFLOWS_STEP_EXECUTIONS_INDEX,
} from '../../../../common';
import type { WorkflowsRouter } from '../../../types';
import { WorkflowsManagementApi } from '../../workflows_management_api';
import { WorkflowsService } from '../../workflows_management_service';
import { registerExecutionRoutes } from '../executions';
import type { RouteDependencies } from '../types';
import { createMockRequestHandlerContext } from '../utils/test_utils';
import { createWorkflowManagementAuditLogMock } from '../utils/workflow_audit_logging.mock';
import { registerWorkflowRoutes } from '../workflows';

// ─── Types ──────────────────────────────────────────────────────────────────

interface CapturedRoute {
  method: string;
  path: string;
  security: { authz: { requiredPrivileges: any[] } };
  handler: (...args: any[]) => Promise<any>;
}

interface EsOperation {
  method: string;
  type: 'read' | 'write';
  index: string | undefined;
}

interface PrivilegeScope {
  reads: string[];
  writes: string[];
  delegates: string[];
}

// ─── Constants ──────────────────────────────────────────────────────────────

const READ_METHODS = new Set(['search', 'get', 'mget', 'openPointInTime', 'closePointInTime']);
const WRITE_METHODS = new Set(['index', 'bulk', 'update', 'delete']);

/**
 * Strict privilege-to-scope mapping.
 *
 * Every privilege defines exactly what ES operations and external delegations
 * it authorizes. A route's effective scope is the union of its declared
 * privileges' scopes. Any ES operation outside that scope is a violation.
 */
const PRIVILEGE_SCOPE: Record<string, PrivilegeScope> = {
  [WorkflowsManagementApiActions.read]: {
    reads: [WORKFLOWS_INDEX],
    writes: [],
    delegates: ['actionsClient'],
  },
  [WorkflowsManagementApiActions.readExecution]: {
    reads: [WORKFLOWS_EXECUTIONS_INDEX, WORKFLOWS_STEP_EXECUTIONS_INDEX],
    writes: [],
    delegates: ['eventLoggerService'],
  },
  [WorkflowsManagementApiActions.create]: {
    reads: [],
    writes: [WORKFLOWS_INDEX],
    delegates: [],
  },
  [WorkflowsManagementApiActions.update]: {
    reads: [],
    writes: [WORKFLOWS_INDEX],
    delegates: [],
  },
  [WorkflowsManagementApiActions.updateManaged]: {
    reads: [],
    writes: [WORKFLOWS_INDEX],
    delegates: [],
  },
  [WorkflowsManagementApiActions.delete]: {
    reads: [],
    writes: [WORKFLOWS_INDEX],
    delegates: [],
  },
  [WorkflowsManagementApiActions.execute]: {
    reads: [],
    writes: [],
    delegates: ['executionEngine'],
  },
  [WorkflowsManagementApiActions.cancelExecution]: {
    reads: [],
    writes: [],
    delegates: ['executionEngine'],
  },
};

/**
 * Per-route exceptions for internal reads.
 *
 * Some routes perform ES reads as an implementation detail of the write
 * operation (e.g. reading the existing document to merge an update, or
 * fetching documents by id+space before soft-deleting). These reads do NOT
 * expose data to the caller and do NOT require the user-facing `read`
 * privilege. They are listed here as exceptions keyed by route.
 */
const INTERNAL_READ_EXCEPTIONS: Record<string, string[]> = {
  'PUT:/api/workflows/workflow/{id}': [WORKFLOWS_INDEX],
  'PUT:/api/workflows/managed/workflow/{id}': [WORKFLOWS_INDEX],
  'DELETE:/api/workflows/workflow/{id}': [WORKFLOWS_INDEX],
  'DELETE:/api/workflows': [WORKFLOWS_INDEX],
  // ID collision detection during single create (see WorkflowsService.resolveUniqueWorkflowIds / getWorkflow)
  'POST:/api/workflows/workflow': [WORKFLOWS_INDEX],
  // ID deduplication and collision detection during bulk create (see WorkflowsService.resolveAndDeduplicateBulkIds)
  'POST:/api/workflows': [WORKFLOWS_INDEX],
  // Existence check before cancelAllActiveWorkflowExecutions (see WorkflowsManagementApi.cancelAllActiveWorkflowExecutions)
  'POST:/api/workflows/workflow/{workflowId}/executions/cancel': [WORKFLOWS_INDEX],
};

/**
 * Routes with conditional privilege behaviour. These routes use `anyRequired`
 * to make `readExecution` optional: when the user holds it, extra execution
 * data is included; when not, the response omits it. Both modes must pass
 * the privilege check.
 */
const CONDITIONAL_PRIVILEGE_TESTS: Array<{
  routeKey: string;
  label: string;
  authzResult: Record<string, boolean>;
  effectivePrivileges: string[];
}> = [
  {
    routeKey: 'GET:/api/workflows',
    label: 'read only (no execution history)',
    authzResult: {
      [WorkflowsManagementApiActions.read]: true,
      [WorkflowsManagementApiActions.readExecution]: false,
    },
    effectivePrivileges: [WorkflowsManagementApiActions.read],
  },
  {
    routeKey: 'GET:/api/workflows',
    label: 'read + readExecution (with execution history)',
    authzResult: {
      [WorkflowsManagementApiActions.read]: true,
      [WorkflowsManagementApiActions.readExecution]: true,
    },
    effectivePrivileges: [
      WorkflowsManagementApiActions.read,
      WorkflowsManagementApiActions.readExecution,
    ],
  },
  {
    routeKey: 'GET:/api/workflows/stats',
    label: 'read only (no execution stats)',
    authzResult: {
      [WorkflowsManagementApiActions.read]: true,
      [WorkflowsManagementApiActions.readExecution]: false,
    },
    effectivePrivileges: [WorkflowsManagementApiActions.read],
  },
  {
    routeKey: 'GET:/api/workflows/stats',
    label: 'read + readExecution (with execution stats)',
    authzResult: {
      [WorkflowsManagementApiActions.read]: true,
      [WorkflowsManagementApiActions.readExecution]: true,
    },
    effectivePrivileges: [
      WorkflowsManagementApiActions.read,
      WorkflowsManagementApiActions.readExecution,
    ],
  },
];

// ─── Mock data ──────────────────────────────────────────────────────────────

const mockWorkflowDocument = {
  _id: 'test-workflow-id',
  _source: {
    name: 'Test Workflow',
    description: 'A test workflow',
    enabled: true,
    tags: [],
    triggerTypes: [],
    yaml: 'name: Test Workflow\nenabled: true',
    definition: { name: 'Test Workflow', enabled: true },
    createdBy: 'test-user',
    lastUpdatedBy: 'test-user',
    spaceId: 'default',
    deleted_at: null,
    valid: true,
    created_at: '2023-01-01T00:00:00.000Z',
    updated_at: '2023-01-01T00:00:00.000Z',
  },
};

const mockExecutionDocument = {
  _id: 'test-exec-id',
  _source: {
    workflowId: 'test-workflow-id',
    workflowName: 'Test Workflow',
    status: 'completed',
    spaceId: 'default',
    createdAt: '2023-01-01T00:00:00.000Z',
    completedAt: '2023-01-01T00:01:00.000Z',
    executionType: 'manual',
  },
};

const mockStepExecutionDocument = {
  _id: 'test-step-exec-id',
  _source: {
    executionId: 'test-exec-id',
    stepId: 'step-1',
    stepName: 'Test Step',
    status: 'completed',
    spaceId: 'default',
  },
};

const ROUTE_REQUEST_FIXTURES: Record<string, { params?: any; body?: any; query?: any }> = {
  'GET:/api/workflows': {},
  'GET:/api/workflows/workflow/{id}': { params: { id: 'test-workflow-id' } },
  'POST:/api/workflows/workflow': { body: { yaml: 'name: Test\nenabled: true' } },
  'PUT:/api/workflows/workflow/{id}': {
    params: { id: 'test-workflow-id' },
    body: { yaml: 'name: Updated\nenabled: true' },
  },
  'PUT:/api/workflows/managed/workflow/{id}': {
    params: { id: 'test-workflow-id' },
    body: { yaml: 'name: Updated\nenabled: true' },
  },
  'DELETE:/api/workflows/workflow/{id}': { params: { id: 'test-workflow-id' } },
  'POST:/api/workflows': {
    body: { workflows: [{ yaml: 'name: Bulk\nenabled: true' }] },
    query: { overwrite: false },
  },
  'DELETE:/api/workflows': { body: { ids: ['test-workflow-id'] } },
  'POST:/api/workflows/workflow/{id}/clone': { params: { id: 'test-workflow-id' } },
  'GET:/api/workflows/stats': {},
  'GET:/api/workflows/aggs': { query: { fields: ['tags'] } },
  'GET:/api/workflows/connectors': {},
  'GET:/api/workflows/schema': { query: { loose: false } },
  'POST:/api/workflows/export': { body: { ids: ['test-workflow-id'] } },
  'POST:/api/workflows/mget': { body: { ids: ['test-workflow-id'] } },
  'POST:/api/workflows/validate': { body: { yaml: 'name: Test\nenabled: true' } },
  'POST:/api/workflows/workflow/{id}/run': {
    params: { id: 'test-workflow-id' },
    body: { inputs: {} },
  },
  'POST:/api/workflows/test': {
    body: { workflowId: 'test-workflow-id', inputs: {} },
  },
  'POST:/api/workflows/step/test': {
    body: {
      stepId: 'step-1',
      workflowYaml: 'name: Test\nenabled: true',
      contextOverride: {},
    },
  },
  'POST:/api/workflows/executions/{executionId}/cancel': {
    params: { executionId: 'test-exec-id' },
  },
  'POST:/api/workflows/workflow/{workflowId}/executions/cancel': {
    params: { workflowId: 'test-workflow-id' },
  },
  'GET:/api/workflows/executions/{executionId}': {
    params: { executionId: 'test-exec-id' },
  },
  'GET:/api/workflows/executions/{executionId}/children': {
    params: { executionId: 'test-exec-id' },
  },
  'GET:/api/workflows/executions/{executionId}/logs': {
    params: { executionId: 'test-exec-id' },
  },
  'GET:/api/workflows/executions/{executionId}/step/{stepExecutionId}': {
    params: { executionId: 'test-exec-id', stepExecutionId: 'test-step-exec-id' },
  },
  'GET:/api/workflows/workflow/{workflowId}/executions': {
    params: { workflowId: 'test-workflow-id' },
  },
  'GET:/api/workflows/workflow/{workflowId}/executions/steps': {
    params: { workflowId: 'test-workflow-id' },
  },
  'POST:/api/workflows/executions/{executionId}/resume': {
    params: { executionId: 'test-exec-id' },
    body: { input: {} },
  },
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function normalizeIndex(index: string | string[] | undefined): string | undefined {
  if (!index) return undefined;
  const raw = Array.isArray(index) ? index[0] : index;
  return raw.replace(/-\d+$/, '').replace(/-\*$/, '');
}

function collectEsOperations(esClient: Record<string, any>): EsOperation[] {
  const ops: EsOperation[] = [];
  const allMethods = [...READ_METHODS, ...WRITE_METHODS];
  for (const method of allMethods) {
    const fn = esClient[method];
    if (fn?.mock?.calls) {
      const type: 'read' | 'write' = READ_METHODS.has(method) ? 'read' : 'write';
      for (const call of fn.mock.calls) {
        const args = call[0] ?? {};
        ops.push({ method, type, index: normalizeIndex(args.index) });
      }
    }
  }
  return ops;
}

/**
 * Extracts flat privilege names from a `requiredPrivileges` array that may
 * contain plain strings or `{ anyRequired: [...] }` / `{ allRequired: [...] }`
 * objects (Kibana's PrivilegeSet shape).
 */
function extractPrivilegeNames(requiredPrivileges: any[]): string[] {
  const names: string[] = [];
  for (const entry of requiredPrivileges) {
    if (typeof entry === 'string') {
      names.push(entry);
    } else if (typeof entry === 'object' && entry !== null) {
      if (Array.isArray(entry.anyRequired)) {
        names.push(...entry.anyRequired.filter((p: any) => typeof p === 'string'));
      }
      if (Array.isArray(entry.allRequired)) {
        names.push(...entry.allRequired.filter((p: any) => typeof p === 'string'));
      }
    }
  }
  return [...new Set(names)];
}

function computeAllowedScope(privileges: string[]) {
  const allowedReads = new Set<string>();
  const allowedWrites = new Set<string>();
  const allowedDelegates = new Set<string>();
  for (const priv of privileges) {
    const scope = PRIVILEGE_SCOPE[priv];
    if (scope) {
      scope.reads.forEach((r) => allowedReads.add(r));
      scope.writes.forEach((w) => allowedWrites.add(w));
      scope.delegates.forEach((d) => allowedDelegates.add(d));
    }
  }
  return { allowedReads, allowedWrites, allowedDelegates };
}

function assertOperationsConsistent(
  routeKey: string,
  privileges: string[],
  esOps: EsOperation[],
  executionEngineMethods: jest.Mocked<WorkflowsExecutionEnginePluginStart>,
  eventLoggerSearch: jest.Mock,
  internalReadExceptions: string[] = []
) {
  const { allowedReads, allowedWrites, allowedDelegates } = computeAllowedScope(privileges);
  const exceptedReads = new Set(internalReadExceptions);
  const violations: string[] = [];

  for (const op of esOps) {
    if (op.index) {
      if (op.type === 'read' && !allowedReads.has(op.index) && !exceptedReads.has(op.index)) {
        violations.push(
          `ES read on '${op.index}' via ${op.method}() not covered by privileges [${privileges.join(
            ', '
          )}]`
        );
      }
      if (op.type === 'write' && !allowedWrites.has(op.index)) {
        violations.push(
          `ES write on '${op.index}' via ${
            op.method
          }() not covered by privileges [${privileges.join(', ')}]`
        );
      }
    }
  }

  const engineCalled = Object.values(executionEngineMethods).some(
    (fn) => fn.mock?.calls?.length > 0
  );
  if (engineCalled && !allowedDelegates.has('executionEngine')) {
    violations.push('Execution engine delegation not covered by privileges');
  }

  if (eventLoggerSearch.mock.calls.length > 0 && !allowedDelegates.has('eventLoggerService')) {
    violations.push('Event logger delegation not covered by privileges');
  }

  expect(violations).toEqual([]);
}

// ─── Test suite ─────────────────────────────────────────────────────────────

describe('Route privilege/ES-operation consistency', () => {
  const capturedRoutes = new Map<string, CapturedRoute>();
  let mockEsClient: Record<string, any>;
  let mockExecutionEngine: jest.Mocked<WorkflowsExecutionEnginePluginStart>;
  let mockEventLoggerSearch: jest.Mock;

  beforeAll(async () => {
    const notFoundError = new errors.ResponseError({
      statusCode: 404,
      body: {},
      headers: {},
      meta: {} as any,
      warnings: [],
    });

    mockExecutionEngine = workflowsExecutionEngineMock.createStart();
    mockEventLoggerSearch = mockExecutionEngine.workflowEventLoggerService.searchLogs as jest.Mock;

    // ── Spy ES client with index-aware search responses ──

    mockEsClient = {
      indices: {
        exists: jest.fn().mockResolvedValue(false),
        create: jest.fn().mockResolvedValue({}),
        putMapping: jest.fn().mockResolvedValue({}),
        getIndexTemplate: jest.fn().mockRejectedValue(notFoundError),
        putIndexTemplate: jest.fn().mockResolvedValue({}),
        getAlias: jest.fn().mockRejectedValue(notFoundError),
        putAlias: jest.fn().mockResolvedValue({}),
        get: jest.fn().mockResolvedValue({}),
        simulateIndexTemplate: jest.fn().mockResolvedValue({ template: { mappings: {} } }),
      },
      search: jest.fn().mockImplementation((params: any) => {
        const idx = params?.index;
        if (idx === WORKFLOWS_EXECUTIONS_INDEX) {
          return Promise.resolve({
            hits: { hits: [mockExecutionDocument], total: { value: 1 } },
            aggregations: {},
          });
        }
        if (idx === WORKFLOWS_STEP_EXECUTIONS_INDEX) {
          return Promise.resolve({
            hits: { hits: [mockStepExecutionDocument], total: { value: 1 } },
          });
        }
        return Promise.resolve({
          hits: { hits: [mockWorkflowDocument], total: { value: 1 } },
          aggregations: {
            enabled_count: { doc_count: 1 },
            disabled_count: { doc_count: 0 },
          },
        });
      }),
      get: jest.fn().mockResolvedValue({
        _id: 'test-exec-id',
        _source: mockExecutionDocument._source,
        found: true,
      }),
      index: jest.fn().mockResolvedValue({ _id: 'test-id', result: 'created' }),
      update: jest.fn().mockResolvedValue({ _id: 'test-id', result: 'updated' }),
      delete: jest.fn().mockResolvedValue({ _id: 'test-id', result: 'deleted' }),
      bulk: jest.fn().mockResolvedValue({
        errors: false,
        items: [{ index: { _id: 'test-id', result: 'created', status: 201 } }],
      }),
      openPointInTime: jest.fn().mockResolvedValue({ id: 'pit-123' }),
      closePointInTime: jest.fn().mockResolvedValue({ succeeded: true, num_freed: 1 }),
      mget: jest.fn().mockResolvedValue({ docs: [] }),
    } as any;

    // ── Execution engine mock ──

    mockExecutionEngine.executeWorkflow.mockResolvedValue({
      workflowExecutionId: 'test-exec-id',
    });
    mockExecutionEngine.executeWorkflowStep.mockResolvedValue({
      workflowExecutionId: 'test-exec-id',
    });
    mockExecutionEngine.cancelWorkflowExecution.mockResolvedValue(undefined);
    mockExecutionEngine.resumeWorkflowExecution.mockResolvedValue({ resumedBy: 'user' });
    mockExecutionEngine.scheduleWorkflow.mockResolvedValue({
      workflowExecutionId: 'test-exec-id',
    });

    // ── WorkflowsService ──

    const mockLogger = loggerMock.create();

    const mockCoreStart = {
      ...coreMock.createStart(),
      elasticsearch: { client: { asInternalUser: mockEsClient } },
    };

    const mockPluginsStart = {
      workflowsExecutionEngine: mockExecutionEngine,
      actions: {
        getUnsecuredActionsClient: jest.fn().mockResolvedValue({
          getAll: jest.fn().mockResolvedValue([]),
          execute: jest.fn(),
          bulkEnqueueExecution: jest.fn(),
        }),
        getActionsClientWithRequest: jest.fn().mockResolvedValue({
          listTypes: jest.fn().mockResolvedValue([]),
          getAll: jest.fn().mockResolvedValue({ data: [] }),
        }),
      },
      workflowsExtensions: {
        getAllTriggerDefinitions: jest.fn().mockReturnValue([]),
      },
    };

    const startServices = jest.fn().mockResolvedValue([mockCoreStart, mockPluginsStart]) as any;
    const service = new WorkflowsService(startServices, mockLogger, '9.0.0');
    await service.getCoreStart();

    // ── WorkflowsManagementApi ──

    const api = new WorkflowsManagementApi(service, true);

    // ── Capturing mock router ──

    const createVersionedRoute = (method: string, path: string, config: any) => ({
      addVersion: jest.fn().mockImplementation((_versionConfig: unknown, handler: any) => {
        capturedRoutes.set(`${method}:${path}`, {
          method,
          path,
          security: config.security,
          handler,
        });
        return { addVersion: jest.fn() };
      }),
    });

    const mockRouter = {
      versioned: {
        get: jest
          .fn()
          .mockImplementation((config: any) => createVersionedRoute('GET', config.path, config)),
        post: jest
          .fn()
          .mockImplementation((config: any) => createVersionedRoute('POST', config.path, config)),
        put: jest
          .fn()
          .mockImplementation((config: any) => createVersionedRoute('PUT', config.path, config)),
        delete: jest
          .fn()
          .mockImplementation((config: any) => createVersionedRoute('DELETE', config.path, config)),
      },
    } as unknown as jest.Mocked<WorkflowsRouter>;

    const mockSpaces = { getSpaceId: jest.fn().mockReturnValue('default') } as any;
    const mockAudit = createWorkflowManagementAuditLogMock();

    const deps: RouteDependencies = {
      router: mockRouter,
      api,
      service,
      logger: mockLogger,
      spaces: mockSpaces,
      audit: mockAudit,
    };

    registerWorkflowRoutes(deps);
    registerExecutionRoutes(deps);
  });

  it('should discover all expected public routes', () => {
    expect(Array.from(capturedRoutes.keys()).sort()).toEqual(
      Object.keys(ROUTE_REQUEST_FIXTURES).sort()
    );
  });

  it('should have security config on every route', () => {
    for (const [, route] of capturedRoutes) {
      expect(route.security?.authz?.requiredPrivileges).toBeDefined();
      expect(route.security.authz.requiredPrivileges.length).toBeGreaterThan(0);
    }
  });

  describe('regular privilege modes', () => {
    it.each(Object.keys(ROUTE_REQUEST_FIXTURES))(
      '%s: ES operations match declared privileges',
      async (routeKey) => {
        const route = capturedRoutes.get(routeKey);
        if (!route) {
          return;
        }

        jest.clearAllMocks();

        const rawPrivileges = route.security?.authz?.requiredPrivileges ?? [];
        const privileges = extractPrivilegeNames(rawPrivileges);
        const fixture = ROUTE_REQUEST_FIXTURES[routeKey] ?? {};

        const request = httpServerMock.createKibanaRequest({
          ...fixture,
          method: route.method.toLowerCase() as any,
          path: route.path,
        });

        // For routes with anyRequired, simulate the platform populating
        // authzResult with all privileges granted (maximal access).
        const authzResult: Record<string, boolean> = {};
        for (const p of privileges) {
          authzResult[p] = true;
        }
        (request as any).authzResult = authzResult;

        const context = createMockRequestHandlerContext();
        const response = httpServerMock.createResponseFactory();

        try {
          await route.handler(context, request, response);
        } catch {
          // Handler errors are expected for some routes (validation failures,
          // incomplete mock data). We still inspect the ES operations that
          // occurred before the error.
        }

        const esOps = collectEsOperations(mockEsClient);
        assertOperationsConsistent(
          routeKey,
          privileges,
          esOps,
          mockExecutionEngine,
          mockEventLoggerSearch,
          INTERNAL_READ_EXCEPTIONS[routeKey]
        );
      }
    );
  });

  // ── Conditional privilege modes ──
  // Routes that conditionally include execution data based on authzResult.
  describe('conditional privilege modes', () => {
    it.each(CONDITIONAL_PRIVILEGE_TESTS.map((t) => [`${t.routeKey} (${t.label})`, t] as const))(
      '%s: ES operations match declared privileges',
      async (_label, { routeKey, authzResult, effectivePrivileges }) => {
        const route = capturedRoutes.get(routeKey);
        if (!route) {
          return;
        }

        jest.clearAllMocks();

        const fixture = ROUTE_REQUEST_FIXTURES[routeKey] ?? {};
        const request = httpServerMock.createKibanaRequest({
          ...fixture,
          method: route.method.toLowerCase() as any,
          path: route.path,
        });
        (request as any).authzResult = authzResult;

        const context = createMockRequestHandlerContext();
        const response = httpServerMock.createResponseFactory();

        try {
          await route.handler(context, request, response);
        } catch {
          // still check ES ops
        }

        const esOps = collectEsOperations(mockEsClient);
        assertOperationsConsistent(
          routeKey,
          effectivePrivileges,
          esOps,
          mockExecutionEngine,
          mockEventLoggerSearch
        );
      }
    );
  });

  // ── Negative test: verify the assertion catches violations ──

  describe('assertOperationsConsistent', () => {
    let noopEngine: jest.Mocked<WorkflowsExecutionEnginePluginStart>;

    beforeEach(() => {
      noopEngine = workflowsExecutionEngineMock.createStart();
      jest.clearAllMocks();
    });

    it('should detect read operations not covered by privileges', () => {
      const esOps: EsOperation[] = [{ method: 'search', type: 'read', index: WORKFLOWS_INDEX }];
      const noopLogger = jest.fn();

      expect(() =>
        assertOperationsConsistent(
          'TEST:/fake',
          [WorkflowsManagementApiActions.execute],
          esOps,
          noopEngine,
          noopLogger
        )
      ).toThrow();
    });

    it('should detect write operations not covered by privileges', () => {
      const esOps: EsOperation[] = [{ method: 'index', type: 'write', index: WORKFLOWS_INDEX }];
      const noopLogger = jest.fn();

      expect(() =>
        assertOperationsConsistent(
          'TEST:/fake',
          [WorkflowsManagementApiActions.read],
          esOps,
          noopEngine,
          noopLogger
        )
      ).toThrow();
    });

    it('should detect execution engine delegation not covered by privileges', () => {
      (noopEngine as any).executeWorkflow();

      expect(() =>
        assertOperationsConsistent(
          'TEST:/fake',
          [WorkflowsManagementApiActions.read],
          [],
          noopEngine,
          jest.fn()
        )
      ).toThrow();
    });

    it('should pass when all operations are covered', () => {
      const esOps: EsOperation[] = [
        { method: 'search', type: 'read', index: WORKFLOWS_INDEX },
        { method: 'index', type: 'write', index: WORKFLOWS_INDEX },
      ];

      expect(() =>
        assertOperationsConsistent(
          'TEST:/fake',
          [WorkflowsManagementApiActions.read, WorkflowsManagementApiActions.create],
          esOps,
          noopEngine,
          jest.fn()
        )
      ).not.toThrow();
    });
  });
});
