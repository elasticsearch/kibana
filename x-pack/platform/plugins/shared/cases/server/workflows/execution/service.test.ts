/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { httpServerMock, loggingSystemMock } from '@kbn/core/server/mocks';
import { securityMock } from '@kbn/security-plugin/server/mocks';
import type { WorkflowsServerPluginSetup } from '@kbn/workflows-management-plugin/server';
import { z } from '@kbn/zod/v4';
import type { DocumentResponse, RunCaseWorkflowRequest } from '../../../common/types/api';
import type { Case } from '../../../common/types/domain';
import { SECURITY_SOLUTION_OWNER } from '../../../common/constants';
import { createCasesClientMock, createCasesClientMockArgs } from '../../client/mocks';
import type { CasesRequestHandlerContext } from '../../types';
import { CasesWorkflowRunService } from './service';
import { UnifiedAttachmentTypeRegistry } from '../../attachment_framework/unified_attachment_registry';
import type { WorkflowAttachmentValidationContext } from '../../attachment_framework/types';
import { createCasesWorkflowOperations } from '../../client/workflows/operations';

jest.mock('../../client/cases/ensure_authorized_to_run_workflow', () => ({
  ...jest.requireActual('../../client/cases/ensure_authorized_to_run_workflow'),
  ensureAuthorizedToRunWorkflow: jest.fn(),
}));

import { ensureAuthorizedToRunWorkflow } from '../../client/cases/ensure_authorized_to_run_workflow';

const mockEnsureAuthorizedToRunWorkflow = ensureAuthorizedToRunWorkflow as jest.MockedFunction<
  typeof ensureAuthorizedToRunWorkflow
>;

describe('CasesWorkflowRunService', () => {
  const request = httpServerMock.createKibanaRequest();
  const logger = loggingSystemMock.createLogger();
  const audit = securityMock.createSetup().audit;
  const auditLogger = audit.asScoped(request);
  const auditLog = auditLogger.log as jest.MockedFunction<typeof auditLogger.log>;
  const casesClient = createCasesClientMock();
  const clientArgs = createCasesClientMockArgs();
  const workflowOperations = createCasesWorkflowOperations(clientArgs);
  let workflowsAvailable = true;
  let licenseValid = true;
  const license = {
    isAvailable: true,
    isActive: true,
    hasAtLeast: jest.fn(() => licenseValid),
  };
  const context = {
    licensing: Promise.resolve({ license }),
  } as unknown as CasesRequestHandlerContext;
  const management = {
    get isWorkflowsAvailable() {
      return workflowsAvailable;
    },
    getWorkflow: jest.fn(),
    runWorkflowWithAlertPreprocessing: jest.fn(),
  } as unknown as jest.Mocked<WorkflowsServerPluginSetup['management']>;
  const attachmentTypeRegistry = new UnifiedAttachmentTypeRegistry();
  const validateAlertTargets = ({ targets, inputs }: WorkflowAttachmentValidationContext): void => {
    const event = inputs.event as Record<string, unknown> | undefined;
    const pairs = event?.alertIds;
    const selectedIds = Array.isArray(pairs)
      ? pairs.map((pair) => (pair as { _id: string })._id)
      : [];
    if (selectedIds.length === 0) {
      throw new Error('Alert attachment workflow origins require selected alert inputs.');
    }
    const targetIds = new Set(targets.map(({ id }) => id));
    const selectedIdSet = new Set(selectedIds);
    if (
      targetIds.size !== selectedIdSet.size ||
      [...targetIds].some((id) => !selectedIdSet.has(id))
    ) {
      throw new Error('Alert workflow origin targets must match the selected alerts.');
    }
  };
  attachmentTypeRegistry.register({
    id: 'security.alert',
    schema: z.any(),
    workflow: { validateTargets: validateAlertTargets },
  });
  attachmentTypeRegistry.register({
    id: 'security.event',
    schema: z.any(),
    workflow: {},
  });
  const service = new CasesWorkflowRunService({
    management,
    logger,
    audit,
    attachmentTypeRegistry,
  });
  const theCase = {
    id: 'case-1',
    owner: SECURITY_SOLUTION_OWNER,
    observables: [],
  } as unknown as Case;
  const createAttachedAlerts = (
    ...attachments: Array<{ type: 'alert'; alertId: string; index: string }>
  ): DocumentResponse =>
    attachments.map(({ alertId, index }) => ({
      id: alertId,
      index,
      attached_at: '2026-08-26T00:00:00.000Z',
    }));
  const setCaseAlerts = (
    ...attachments: Array<{ type: 'alert'; alertId: string; index: string }>
  ) => {
    casesClient.cases.get.mockResolvedValue({
      ...theCase,
      comments: attachments,
    } as unknown as Case);
    casesClient.attachments.getAllDocumentsAttachedToCase.mockResolvedValue(
      createAttachedAlerts(...attachments)
    );
  };
  const alertOrigin = (attachmentId: string) =>
    ({
      type: 'cases.attachment',
      caseId: 'case-1',
      attachmentType: 'security.alert',
      attachmentId,
    } as const);
  const alertsOrigin = (attachmentIds: string[]) =>
    ({
      type: 'cases.attachments',
      caseId: 'case-1',
      attachmentType: 'security.alert',
      attachmentIds,
    } as const);
  const defaultBody: RunCaseWorkflowRequest = {
    caseIds: ['case-1'],
    inputs: { event: { caseIds: ['case-1'] } },
    origin: { type: 'cases.case', caseId: 'case-1' },
  };

  const run = (body: RunCaseWorkflowRequest = defaultBody) =>
    service.run({
      workflowId: 'workflow-1',
      body,
      request,
      context,
      casesClient,
      workflowOperations,
      spaceId: 'default',
    });

  beforeEach(() => {
    jest.clearAllMocks();
    workflowsAvailable = true;
    licenseValid = true;
    // Default: authorization succeeds for case-1 with the security solution owner.
    mockEnsureAuthorizedToRunWorkflow.mockResolvedValue([
      { id: 'case-1', owner: SECURITY_SOLUTION_OWNER },
    ]);
    casesClient.cases.get.mockResolvedValue(theCase);
    clientArgs.services.userActionService.getMultipleCasesUserActionsTotal.mockResolvedValue({});
    clientArgs.services.userActionService.creator.bulkCreateUserAction.mockResolvedValue(
      undefined as never
    );
    casesClient.attachments.getAllDocumentsAttachedToCase.mockResolvedValue([]);
    management.getWorkflow.mockResolvedValue({
      id: 'workflow-1',
      name: 'Investigate case',
      valid: true,
      enabled: true,
    } as Awaited<ReturnType<typeof management.getWorkflow>>);
    management.runWorkflowWithAlertPreprocessing.mockResolvedValue({
      workflowExecutionId: 'execution-1',
    });
  });

  it('starts the workflow with server-owned metadata', async () => {
    await expect(run()).resolves.toEqual({
      workflowExecutionId: 'execution-1',
      activityStatus: 'succeeded',
    });

    expect(mockEnsureAuthorizedToRunWorkflow).toHaveBeenCalledWith({ ids: ['case-1'] }, clientArgs);
    expect(casesClient.attachments.getAllDocumentsAttachedToCase).not.toHaveBeenCalled();
    expect(
      (mockEnsureAuthorizedToRunWorkflow as jest.Mock).mock.invocationCallOrder[0]
    ).toBeLessThan(management.runWorkflowWithAlertPreprocessing.mock.invocationCallOrder[0]);
    expect(management.runWorkflowWithAlertPreprocessing).toHaveBeenCalledWith({
      workflow: expect.objectContaining({ id: 'workflow-1', name: 'Investigate case' }),
      spaceId: 'default',
      // Client-supplied event.caseIds is stripped from inputs; the server re-injects the
      // authorized set via eventOverrides (applied after alert preprocessing so it survives
      // preprocessAlertInputs's event replacement).
      inputs: { event: {} },
      request,
      preprocessingContext: context,
      eventOverrides: { caseIds: ['case-1'] },
      metadata: {
        schemaVersion: 1,
        source: 'cases',
        caseIds: ['case-1'],
        origin: defaultBody.origin,
      },
    });
    // preflightWorkflowExecution runs before the workflow to enforce the user-action limit.
    expect(
      clientArgs.services.userActionService.getMultipleCasesUserActionsTotal
    ).toHaveBeenCalledWith({
      caseIds: ['case-1'],
    });
    // recordWorkflowExecution persists the activity log entry after a successful run.
    expect(clientArgs.services.userActionService.creator.bulkCreateUserAction).toHaveBeenCalledWith(
      expect.objectContaining({
        userActions: [
          expect.objectContaining({
            caseId: 'case-1',
            owner: SECURITY_SOLUTION_OWNER,
            payload: {
              workflow: {
                id: 'workflow-1',
                name: 'Investigate case',
                executionId: 'execution-1',
              },
              origin: { type: 'cases.case', id: 'case-1' },
            },
          }),
        ],
      })
    );
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        event: expect.objectContaining({
          action: 'case_workflow_run',
          outcome: 'success',
        }),
        kibana: expect.objectContaining({
          saved_object: expect.objectContaining({ id: 'case-1' }),
        }),
      })
    );
  });

  it('records activity with the owner from the authorized entities (no extra getCases)', async () => {
    // The owner for the activity log comes from the entities returned by
    // ensureAuthorizedToRunWorkflow (which already fetched the cases for authorization).
    // recordWorkflowExecution must reuse those entities and must NOT issue a second getCases.
    mockEnsureAuthorizedToRunWorkflow.mockResolvedValue([
      { id: 'case-1', owner: 'owner-from-authz' },
    ]);

    await run();

    expect(clientArgs.services.userActionService.creator.bulkCreateUserAction).toHaveBeenCalledWith(
      expect.objectContaining({
        userActions: [expect.objectContaining({ owner: 'owner-from-authz' })],
      })
    );
    // The authz step fetched the cases; recordWorkflowExecution must NOT fetch them again.
    expect(clientArgs.services.caseService.getCases).not.toHaveBeenCalled();
  });

  it('passes alert preprocessing context with event intact', async () => {
    const body: RunCaseWorkflowRequest = {
      caseIds: ['case-1'],
      inputs: {
        event: {
          triggerType: 'alert',
          alertIds: [{ _id: 'alert-1', _index: '.alerts' }],
        },
      },
      origin: alertOrigin('alert-1'),
    };
    setCaseAlerts({ type: 'alert', alertId: 'alert-1', index: '.alerts' });
    management.runWorkflowWithAlertPreprocessing.mockResolvedValue({
      workflowExecutionId: 'execution-1',
    });

    await expect(run(body)).resolves.toEqual({
      workflowExecutionId: 'execution-1',
      activityStatus: 'succeeded',
    });

    expect(casesClient.attachments.getAllDocumentsAttachedToCase).toHaveBeenCalledWith({
      caseId: 'case-1',
      attachmentTypes: ['alert'],
    });
    expect(management.runWorkflowWithAlertPreprocessing).toHaveBeenCalledWith(
      expect.objectContaining({
        // caseIds is passed via eventOverrides, not pre-merged into inputs.event, so that it
        // survives alert preprocessing which replaces the entire event object.
        inputs: {
          event: {
            triggerType: 'alert',
            alertIds: [{ _id: 'alert-1', _index: '.alerts' }],
          },
        },
        eventOverrides: { caseIds: ['case-1'] },
        preprocessingContext: context,
      })
    );
  });

  describe('bulk runs (no origin)', () => {
    const bulkBody: RunCaseWorkflowRequest = {
      caseIds: ['case-a', 'case-b', 'case-c'],
      inputs: { event: { caseIds: ['case-a', 'case-b', 'case-c'] } },
    };

    it('fires exactly one workflow execution for N cases with server-owned event.caseIds', async () => {
      mockEnsureAuthorizedToRunWorkflow.mockResolvedValue([
        { id: 'case-a', owner: SECURITY_SOLUTION_OWNER },
        { id: 'case-b', owner: SECURITY_SOLUTION_OWNER },
        { id: 'case-c', owner: SECURITY_SOLUTION_OWNER },
      ]);
      await expect(run(bulkBody)).resolves.toEqual({
        workflowExecutionId: 'execution-1',
        activityStatus: 'succeeded',
      });
      expect(management.runWorkflowWithAlertPreprocessing).toHaveBeenCalledTimes(1);
      expect(management.runWorkflowWithAlertPreprocessing).toHaveBeenCalledWith(
        expect.objectContaining({
          spaceId: 'default',
          // Client-supplied event.caseIds is stripped; authorized set goes via eventOverrides.
          inputs: { event: {} },
          eventOverrides: { caseIds: ['case-a', 'case-b', 'case-c'] },
          request,
          metadata: expect.objectContaining({ caseIds: ['case-a', 'case-b', 'case-c'] }),
        })
      );
    });

    it('does NOT call casesClient.cases.get for bulk runs (avoids N×fetch)', async () => {
      await run(bulkBody);
      expect(casesClient.cases.get).not.toHaveBeenCalled();
    });

    it('is also legal when exactly one case is selected (list-surface single-select)', async () => {
      await expect(run({ caseIds: ['case-1'], inputs: {} })).resolves.toEqual({
        workflowExecutionId: 'execution-1',
        activityStatus: 'succeeded',
      });
      // No case fetch when origin is absent.
      expect(casesClient.cases.get).not.toHaveBeenCalled();
    });

    it('passes all caseIds to preflightWorkflowExecution', async () => {
      mockEnsureAuthorizedToRunWorkflow.mockResolvedValue([
        { id: 'case-a', owner: SECURITY_SOLUTION_OWNER },
        { id: 'case-b', owner: SECURITY_SOLUTION_OWNER },
        { id: 'case-c', owner: SECURITY_SOLUTION_OWNER },
      ]);
      await run(bulkBody);
      expect(
        clientArgs.services.userActionService.getMultipleCasesUserActionsTotal
      ).toHaveBeenCalledWith({
        caseIds: ['case-a', 'case-b', 'case-c'],
      });
    });

    it('records activity for all authorized cases', async () => {
      mockEnsureAuthorizedToRunWorkflow.mockResolvedValue([
        { id: 'case-a', owner: SECURITY_SOLUTION_OWNER },
        { id: 'case-b', owner: SECURITY_SOLUTION_OWNER },
        { id: 'case-c', owner: SECURITY_SOLUTION_OWNER },
      ]);
      await run(bulkBody);
      expect(
        clientArgs.services.userActionService.creator.bulkCreateUserAction
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          userActions: expect.arrayContaining(
            ['case-a', 'case-b', 'case-c'].map((caseId) =>
              expect.objectContaining({ caseId, owner: SECURITY_SOLUTION_OWNER })
            )
          ),
        })
      );
    });

    it('emits one audit event per case on success', async () => {
      mockEnsureAuthorizedToRunWorkflow.mockResolvedValue([
        { id: 'case-a', owner: SECURITY_SOLUTION_OWNER },
        { id: 'case-b', owner: SECURITY_SOLUTION_OWNER },
        { id: 'case-c', owner: SECURITY_SOLUTION_OWNER },
      ]);
      await run(bulkBody);
      expect(auditLog).toHaveBeenCalledTimes(3);
      for (const id of ['case-a', 'case-b', 'case-c']) {
        expect(auditLog).toHaveBeenCalledWith(
          expect.objectContaining({
            event: expect.objectContaining({ action: 'case_workflow_run', outcome: 'success' }),
            kibana: expect.objectContaining({ saved_object: expect.objectContaining({ id }) }),
          })
        );
      }
    });

    it('emits one audit event per case on failure', async () => {
      mockEnsureAuthorizedToRunWorkflow.mockResolvedValue([
        { id: 'case-a', owner: SECURITY_SOLUTION_OWNER },
        { id: 'case-b', owner: SECURITY_SOLUTION_OWNER },
        { id: 'case-c', owner: SECURITY_SOLUTION_OWNER },
      ]);
      management.runWorkflowWithAlertPreprocessing.mockRejectedValue(new Error('execution failed'));
      await expect(run(bulkBody)).rejects.toThrow('execution failed');
      expect(auditLog).toHaveBeenCalledTimes(3);
      for (const id of ['case-a', 'case-b', 'case-c']) {
        expect(auditLog).toHaveBeenCalledWith(
          expect.objectContaining({
            event: expect.objectContaining({ action: 'case_workflow_run', outcome: 'failure' }),
            kibana: expect.objectContaining({ saved_object: expect.objectContaining({ id }) }),
          })
        );
      }
    });

    // SECURITY REGRESSION TEST: a user authorized on case-a but not case-b must NOT be able
    // to start a workflow that acts on case-b.
    it('refuses to start the workflow when the caller is not authorized on all cases', async () => {
      mockEnsureAuthorizedToRunWorkflow.mockRejectedValue(new Error('Unauthorized: case-b'));

      await expect(run(bulkBody)).rejects.toThrow('Unauthorized: case-b');
      expect(management.runWorkflowWithAlertPreprocessing).not.toHaveBeenCalled();
    });

    it('rejects alert inputs when origin is absent', async () => {
      await expect(
        run({
          caseIds: ['case-a', 'case-b'],
          inputs: { event: { alertIds: [{ _id: 'a-1', _index: '.alerts' }] } },
        })
      ).rejects.toThrow('Alert inputs can only be used with a single case.');
      expect(management.runWorkflowWithAlertPreprocessing).not.toHaveBeenCalled();
    });

    it('rejects observable inputs when origin is absent (no silent drop)', async () => {
      // observableIds is a server-owned key that gets stripped by SERVER_OWNED_EVENT_KEYS.
      // Without the guard, a bulk run carrying observableIds would silently receive an empty
      // {{ event.observableIds }} — the same silent-empty outcome the guard prevents for the
      // origin-present path. The guard must fire regardless of whether origin is provided.
      await expect(
        run({
          caseIds: ['case-a', 'case-b'],
          inputs: { event: { observableIds: ['obs-1'] } },
        })
      ).rejects.toThrow('Observable inputs can only be used with observable origins.');
      expect(management.runWorkflowWithAlertPreprocessing).not.toHaveBeenCalled();
    });

    it('rejects observable inputs when origin is a non-observable type', async () => {
      casesClient.cases.get.mockResolvedValue({ ...theCase, observables: [] } as unknown as Case);
      await expect(
        run({
          caseIds: ['case-1'],
          inputs: { event: { observableIds: ['obs-1'] } },
          origin: { type: 'cases.case', caseId: 'case-1' },
        })
      ).rejects.toThrow('Observable inputs can only be used with observable origins.');
      expect(management.runWorkflowWithAlertPreprocessing).not.toHaveBeenCalled();
    });
  });

  describe('single-case (sub-entity) origin types reject multiple caseIds', () => {
    it('rejects cases.case with multiple caseIds', async () => {
      await expect(
        run({
          caseIds: ['case-a', 'case-b'],
          inputs: {},
          origin: { type: 'cases.case', caseId: 'case-a' },
        })
      ).rejects.toThrow('can only be used with a single case');
      expect(management.runWorkflowWithAlertPreprocessing).not.toHaveBeenCalled();
    });

    it('rejects cases.observable with multiple caseIds', async () => {
      await expect(
        run({
          caseIds: ['case-a', 'case-b'],
          inputs: {},
          origin: { type: 'cases.observable', caseId: 'case-a', observableId: 'obs-1' },
        })
      ).rejects.toThrow('can only be used with a single case');
      expect(management.runWorkflowWithAlertPreprocessing).not.toHaveBeenCalled();
    });

    it('rejects cases.attachment with multiple caseIds', async () => {
      await expect(
        run({
          caseIds: ['case-a', 'case-b'],
          inputs: {},
          origin: { ...alertOrigin('alert-1'), caseId: 'case-a' },
        })
      ).rejects.toThrow('can only be used with a single case');
      expect(management.runWorkflowWithAlertPreprocessing).not.toHaveBeenCalled();
    });

    it('rejects cases.attachments with multiple caseIds', async () => {
      await expect(
        run({
          caseIds: ['case-a', 'case-b'],
          inputs: {},
          origin: { ...alertsOrigin(['alert-1']), caseId: 'case-a' },
        })
      ).rejects.toThrow('can only be used with a single case');
      expect(management.runWorkflowWithAlertPreprocessing).not.toHaveBeenCalled();
    });
  });

  it('strips client-supplied event.caseIds and re-injects the authorized set via eventOverrides', async () => {
    // A client that sends a superset in inputs cannot widen the blast radius
    // beyond the ids it declared in body.caseIds (and was authorized for).
    // Client caseIds are dropped from inputs; the authorized set is re-applied after
    // alert preprocessing via eventOverrides so it survives event object replacement.
    await run({
      caseIds: ['case-1'],
      inputs: { event: { caseIds: ['case-1', 'case-evil'], triggerType: 'manual' } },
      origin: { type: 'cases.case', caseId: 'case-1' },
    });

    expect(management.runWorkflowWithAlertPreprocessing).toHaveBeenCalledWith(
      expect.objectContaining({
        // Client-supplied caseIds stripped; triggerType preserved; authorized set in eventOverrides.
        inputs: { event: { triggerType: 'manual' } },
        eventOverrides: { caseIds: ['case-1'] },
        request,
      })
    );
  });

  it('rejects execution when workflows are unavailable', async () => {
    workflowsAvailable = false;

    await expect(run()).rejects.toThrow('Workflows are not available.');
    expect(management.runWorkflowWithAlertPreprocessing).not.toHaveBeenCalled();
  });

  it('rejects execution when the license is insufficient', async () => {
    licenseValid = false;

    await expect(run()).rejects.toThrow('Workflows require an active Enterprise license.');
    expect(management.runWorkflowWithAlertPreprocessing).not.toHaveBeenCalled();
  });

  it('rejects execution when preflight fails (user-action limit reached)', async () => {
    clientArgs.services.userActionService.getMultipleCasesUserActionsTotal.mockRejectedValue(
      new Error('User action limit reached')
    );

    await expect(run()).rejects.toThrow('User action limit reached');
    expect(management.runWorkflowWithAlertPreprocessing).not.toHaveBeenCalled();
  });

  it('rejects execution when the case update is unauthorized', async () => {
    mockEnsureAuthorizedToRunWorkflow.mockRejectedValue(new Error('not authorized'));

    await expect(run()).rejects.toThrow('not authorized');
    expect(management.runWorkflowWithAlertPreprocessing).not.toHaveBeenCalled();
  });

  it('rejects a case origin whose caseId does not match the target case', async () => {
    await expect(
      run({ caseIds: ['case-1'], inputs: {}, origin: { type: 'cases.case', caseId: 'case-2' } })
    ).rejects.toThrow('Workflow origin caseId must match case id "case-1".');
    expect(management.runWorkflowWithAlertPreprocessing).not.toHaveBeenCalled();
  });

  it('rejects an observable that does not belong to the case', async () => {
    // theCase has observables: [] by default, so 'observable-1' is absent.
    await expect(
      run({
        caseIds: ['case-1'],
        inputs: {},
        origin: { type: 'cases.observable', caseId: 'case-1', observableId: 'observable-1' },
      })
    ).rejects.toThrow('Observable "observable-1" does not belong to case "case-1".');
    expect(management.runWorkflowWithAlertPreprocessing).not.toHaveBeenCalled();
  });

  it('passes observableIds and observableTypeKeys (not values) via eventOverrides for cases.observable', async () => {
    // The `value` field must never reach the workflow execution so that users without Cases read
    // access cannot observe case data through a workflow or the persisted trigger-events data stream.
    casesClient.cases.get.mockResolvedValue({
      ...theCase,
      observables: [{ id: 'observable-1', typeKey: 'observable-type-ipv4', value: '1.2.3.4' }],
    } as unknown as Case);

    await expect(
      run({
        caseIds: ['case-1'],
        inputs: {},
        origin: { type: 'cases.observable', caseId: 'case-1', observableId: 'observable-1' },
      })
    ).resolves.toEqual({ workflowExecutionId: 'execution-1', activityStatus: 'succeeded' });

    // Exact-shape assertion: any extra key (e.g. `value` or `description`) would fail this check.
    expect(management.runWorkflowWithAlertPreprocessing).toHaveBeenCalledWith(
      expect.objectContaining({
        eventOverrides: {
          caseIds: ['case-1'],
          observableIds: ['observable-1'],
          observableTypeKeys: ['observable-type-ipv4'],
        },
      })
    );
  });

  it('passes index-aligned observableIds and observableTypeKeys for cases.observables, repeating type keys', async () => {
    // Two observables share the same type key; the arrays must stay index-aligned so
    // observableTypeKeys[i] is the type of observableIds[i].
    casesClient.cases.get.mockResolvedValue({
      ...theCase,
      observables: [
        { id: 'obs-1', typeKey: 'observable-type-ipv4', value: '1.2.3.4' },
        { id: 'obs-2', typeKey: 'observable-type-ipv4', value: '5.6.7.8' },
        { id: 'obs-3', typeKey: 'observable-type-url', value: 'https://example.com' },
      ],
    } as unknown as Case);

    await expect(
      run({
        caseIds: ['case-1'],
        inputs: {},
        origin: {
          type: 'cases.observables',
          caseId: 'case-1',
          observableIds: ['obs-1', 'obs-2', 'obs-3'],
        },
      })
    ).resolves.toEqual({ workflowExecutionId: 'execution-1', activityStatus: 'succeeded' });

    expect(management.runWorkflowWithAlertPreprocessing).toHaveBeenCalledWith(
      expect.objectContaining({
        eventOverrides: {
          caseIds: ['case-1'],
          observableIds: ['obs-1', 'obs-2', 'obs-3'],
          // obs-1 and obs-2 share a type key; it repeats to keep the arrays index-aligned.
          observableTypeKeys: [
            'observable-type-ipv4',
            'observable-type-ipv4',
            'observable-type-url',
          ],
        },
      })
    );
  });

  it('strips client-supplied event.observableIds / event.observableTypeKeys and re-injects server-resolved values', async () => {
    casesClient.cases.get.mockResolvedValue({
      ...theCase,
      observables: [{ id: 'observable-1', typeKey: 'observable-type-ipv4', value: '1.2.3.4' }],
    } as unknown as Case);

    await run({
      caseIds: ['case-1'],
      inputs: {
        event: {
          observableIds: ['spoofed-id'],
          observableTypeKeys: ['spoofed-type'],
          extra: 'keep-me',
        },
      },
      origin: { type: 'cases.observable', caseId: 'case-1', observableId: 'observable-1' },
    });

    expect(management.runWorkflowWithAlertPreprocessing).toHaveBeenCalledWith(
      expect.objectContaining({
        // Client-supplied observableIds / observableTypeKeys are stripped; extra is preserved.
        inputs: { event: { extra: 'keep-me' } },
        eventOverrides: {
          caseIds: ['case-1'],
          observableIds: ['observable-1'],
          observableTypeKeys: ['observable-type-ipv4'],
        },
      })
    );
  });

  it('rejects alert inputs for a case origin when alerts are not attached', async () => {
    // A cases.case origin must not bypass alert-membership validation — an attacker
    // could otherwise inject arbitrary alerts by switching to a non-alert origin type.
    casesClient.attachments.getAllDocumentsAttachedToCase.mockResolvedValue(
      createAttachedAlerts({ type: 'alert', alertId: 'alert-1', index: '.alerts' })
    );

    await expect(
      run({
        caseIds: ['case-1'],
        inputs: { event: { alertIds: [{ _id: 'alert-99', _index: '.alerts' }] } },
        origin: { type: 'cases.case', caseId: 'case-1' },
      })
    ).rejects.toThrow('All selected alerts must belong to the case.');
    expect(management.runWorkflowWithAlertPreprocessing).not.toHaveBeenCalled();
  });

  it('rejects alert inputs for an observable origin when alerts are not attached', async () => {
    casesClient.cases.get.mockResolvedValue({
      ...theCase,
      observables: [{ id: 'observable-1', typeKey: 'observable-type-ipv4', value: '1.2.3.4' }],
    } as unknown as Case);
    casesClient.attachments.getAllDocumentsAttachedToCase.mockResolvedValue(
      createAttachedAlerts({ type: 'alert', alertId: 'alert-1', index: '.alerts' })
    );

    await expect(
      run({
        caseIds: ['case-1'],
        inputs: { event: { alertIds: [{ _id: 'alert-99', _index: '.alerts' }] } },
        origin: { type: 'cases.observable', caseId: 'case-1', observableId: 'observable-1' },
      })
    ).rejects.toThrow('All selected alerts must belong to the case.');
    expect(management.runWorkflowWithAlertPreprocessing).not.toHaveBeenCalled();
  });

  it('rejects a selected alert that is not attached to the case', async () => {
    setCaseAlerts({ type: 'alert', alertId: 'alert-1', index: '.alerts' });

    await expect(
      run({
        caseIds: ['case-1'],
        inputs: { event: { alertIds: [{ _id: 'alert-2', _index: '.alerts' }] } },
        origin: alertOrigin('alert-2'),
      })
    ).rejects.toThrow('Attachment target "alert-2"');
    expect(management.runWorkflowWithAlertPreprocessing).not.toHaveBeenCalled();
  });

  it('rejects a selected alert with a matching id but wrong index', async () => {
    // Alert membership is validated as (id, index) pairs so that an alert id from
    // one index cannot be used to access data from a different index.
    setCaseAlerts({ type: 'alert', alertId: 'alert-1', index: '.alerts-real' });

    await expect(
      run({
        caseIds: ['case-1'],
        inputs: { event: { alertIds: [{ _id: 'alert-1', _index: '.alerts-spoofed' }] } },
        origin: alertOrigin('alert-1'),
      })
    ).rejects.toThrow('All selected alerts must belong to the case.');
    expect(management.runWorkflowWithAlertPreprocessing).not.toHaveBeenCalled();
  });

  it('rejects an alert origin without selected alerts with a specific validation error', async () => {
    setCaseAlerts({ type: 'alert', alertId: 'alert-1', index: '.alerts' });

    await expect(
      run({
        caseIds: ['case-1'],
        inputs: {},
        origin: alertOrigin('alert-1'),
      })
    ).rejects.toThrow('Alert attachment workflow origins require selected alert inputs.');
    expect(casesClient.attachments.getAllDocumentsAttachedToCase).not.toHaveBeenCalled();
    expect(management.runWorkflowWithAlertPreprocessing).not.toHaveBeenCalled();
  });

  it('rejects a single-alert origin whose alertId is not among the selected alerts', async () => {
    setCaseAlerts(
      { type: 'alert', alertId: 'alert-1', index: '.alerts' },
      { type: 'alert', alertId: 'alert-2', index: '.alerts' }
    );

    await expect(
      run({
        caseIds: ['case-1'],
        inputs: { event: { alertIds: [{ _id: 'alert-1', _index: '.alerts' }] } },
        origin: alertOrigin('alert-2'),
      })
    ).rejects.toThrow('Alert workflow origin targets must match the selected alerts.');
    expect(management.runWorkflowWithAlertPreprocessing).not.toHaveBeenCalled();
  });

  it('accepts selected alerts that are attached to the case', async () => {
    setCaseAlerts(
      { type: 'alert', alertId: 'alert-1', index: '.alerts' },
      { type: 'alert', alertId: 'alert-2', index: '.alerts' }
    );

    await expect(
      run({
        caseIds: ['case-1'],
        inputs: {
          event: {
            alertIds: [
              { _id: 'alert-1', _index: '.alerts' },
              { _id: 'alert-2', _index: '.alerts' },
            ],
          },
        },
        origin: alertsOrigin(['alert-1', 'alert-2']),
      })
    ).resolves.toEqual({ workflowExecutionId: 'execution-1', activityStatus: 'succeeded' });
  });

  it('rejects a missing workflow', async () => {
    management.getWorkflow.mockResolvedValue(null);

    await expect(run()).rejects.toThrow('Workflow "workflow-1" was not found.');
    expect(management.runWorkflowWithAlertPreprocessing).not.toHaveBeenCalled();
  });

  it('rejects an invalid workflow', async () => {
    management.getWorkflow.mockResolvedValue({
      id: 'workflow-1',
      name: 'Invalid workflow',
      valid: false,
      enabled: true,
    } as Awaited<ReturnType<typeof management.getWorkflow>>);

    await expect(run()).rejects.toThrow('Workflow is not valid.');
    expect(management.runWorkflowWithAlertPreprocessing).not.toHaveBeenCalled();
  });

  it('rejects a disabled workflow', async () => {
    management.getWorkflow.mockResolvedValue({
      id: 'workflow-1',
      name: 'Disabled workflow',
      valid: true,
      enabled: false,
    } as Awaited<ReturnType<typeof management.getWorkflow>>);

    await expect(run()).rejects.toThrow('Workflow is disabled. Enable it to run it.');
    expect(management.runWorkflowWithAlertPreprocessing).not.toHaveBeenCalled();
  });

  it('returns activityStatus: failed when recordWorkflowExecution throws, without rethrowing', async () => {
    clientArgs.services.userActionService.creator.bulkCreateUserAction.mockRejectedValue(
      new Error('activity recording failed')
    );

    await expect(run()).resolves.toEqual({
      workflowExecutionId: 'execution-1',
      activityStatus: 'failed',
    });
    expect(logger.error).toHaveBeenCalled();
  });

  it('audits execution failures', async () => {
    management.runWorkflowWithAlertPreprocessing.mockRejectedValue(new Error('execution failed'));

    await expect(run()).rejects.toThrow('execution failed');
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        error: { message: 'execution failed' },
        event: expect.objectContaining({
          action: 'case_workflow_run',
          outcome: 'failure',
        }),
      })
    );
  });

  it('does not let audit logging failures block execution', async () => {
    auditLog.mockImplementation(() => {
      throw new Error('audit failed');
    });

    await expect(run()).resolves.toEqual({
      workflowExecutionId: 'execution-1',
      activityStatus: 'succeeded',
    });
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('Failed to write Cases workflow audit event')
    );
  });

  // ── B1: observable inputs rejected on non-observable origins ─────────────────

  it('rejects observableIds inputs when the origin is not an observable origin (cases.case)', async () => {
    await expect(
      run({
        caseIds: ['case-1'],
        inputs: { event: { observableIds: ['obs-1'] } },
        origin: { type: 'cases.case', caseId: 'case-1' },
      })
    ).rejects.toThrow('Observable inputs can only be used with observable origins.');
    expect(management.runWorkflowWithAlertPreprocessing).not.toHaveBeenCalled();
  });

  it('rejects observableTypeKeys inputs when the origin is an attachment origin', async () => {
    setCaseAlerts({ type: 'alert', alertId: 'alert-1', index: '.alerts' });
    await expect(
      run({
        caseIds: ['case-1'],
        inputs: {
          event: {
            alertIds: [{ _id: 'alert-1', _index: '.alerts' }],
            observableTypeKeys: ['ip'],
          },
        },
        origin: alertOrigin('alert-1'),
      })
    ).rejects.toThrow('Observable inputs can only be used with observable origins.');
    expect(management.runWorkflowWithAlertPreprocessing).not.toHaveBeenCalled();
  });

  it('accepts observableIds when the origin is cases.observable', async () => {
    casesClient.cases.get.mockResolvedValue({
      ...theCase,
      observables: [{ id: 'obs-1', typeKey: 'ip', value: '1.2.3.4' }],
    } as unknown as Case);
    await expect(
      run({
        caseIds: ['case-1'],
        inputs: { event: { observableIds: ['obs-1'] } },
        origin: { type: 'cases.observable', caseId: 'case-1', observableId: 'obs-1' },
      })
    ).resolves.toEqual({ workflowExecutionId: 'execution-1', activityStatus: 'succeeded' });
  });

  // ── B2: includeComments gated on attachment origins ───────────────────────────

  it('fetches case without comments for a cases.case origin', async () => {
    await run(defaultBody);
    expect(casesClient.cases.get).toHaveBeenCalledWith(
      expect.objectContaining({ includeComments: false })
    );
  });

  it('fetches case without comments for a cases.observable origin', async () => {
    casesClient.cases.get.mockResolvedValue({
      ...theCase,
      observables: [{ id: 'obs-1', typeKey: 'ip', value: '1.2.3.4' }],
    } as unknown as Case);
    await run({
      caseIds: ['case-1'],
      inputs: {},
      origin: { type: 'cases.observable', caseId: 'case-1', observableId: 'obs-1' },
    });
    expect(casesClient.cases.get).toHaveBeenCalledWith(
      expect.objectContaining({ includeComments: false })
    );
  });

  it('fetches case with comments for a cases.attachment origin', async () => {
    setCaseAlerts({ type: 'alert', alertId: 'alert-1', index: '.alerts' });
    await run({
      caseIds: ['case-1'],
      inputs: { event: { alertIds: [{ _id: 'alert-1', _index: '.alerts' }] } },
      origin: alertOrigin('alert-1'),
    });
    expect(casesClient.cases.get).toHaveBeenCalledWith(
      expect.objectContaining({ includeComments: true })
    );
  });
});
