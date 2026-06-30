/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { KibanaRequest } from '@kbn/core-http-server';
import {
  WorkflowManagementAuditActions,
  WorkflowManagementAuditLog,
} from './workflow_audit_logging';
import type { WorkflowsService } from '../../workflows_management_service';

async function createAuditHarness() {
  const log = jest.fn();
  const systemLog = jest.fn();
  const audit = new WorkflowManagementAuditLog({
    service: {
      getCoreStart: jest.fn().mockResolvedValue({
        security: {
          audit: {
            asScoped: jest.fn().mockReturnValue({ log }),
            withoutRequest: { log: systemLog },
          },
          authc: { getCurrentUser: jest.fn() },
        },
      }),
    } as unknown as WorkflowsService,
  });
  const request = {} as KibanaRequest;
  return { audit, request, log, systemLog };
}

describe('WorkflowManagementAuditLog', () => {
  describe('when delegating to core security audit logger', () => {
    const err = new Error('boom');

    it('does not throw when audit log fails (success path remains safe for callers)', async () => {
      const { audit, request, log } = await createAuditHarness();
      log.mockImplementation(() => {
        throw new Error('audit sink failed');
      });
      expect(() => audit.logWorkflowCreated(request, { id: 'w-1' })).not.toThrow();
    });

    it('logWorkflowCreated (single)', async () => {
      const { audit, request, log } = await createAuditHarness();
      audit.logWorkflowCreated(request, { id: 'w-1' });
      expect(log).toHaveBeenCalledTimes(1);
      expect(log.mock.calls[0][0]).toEqual(
        expect.objectContaining({
          message: 'User created workflow [id=w-1]',
          event: expect.objectContaining({
            action: WorkflowManagementAuditActions.CREATE,
            outcome: 'success',
            type: ['creation'],
            category: ['database'],
          }),
        })
      );
    });

    it('logWorkflowCreated (bulk import)', async () => {
      const { audit, request, log } = await createAuditHarness();
      audit.logWorkflowCreated(request, {
        id: 'w-2',
        viaBulkImport: true,
      });
      expect(log.mock.calls[0][0].event.action).toBe(WorkflowManagementAuditActions.BULK_CREATE);
      expect(log.mock.calls[0][0].message).toContain('bulk import');
      expect(log.mock.calls[0][0].message).toContain('[id=w-2]');
    });

    it('logWorkflowCreateFailed (single vs bulk message)', async () => {
      const { audit: a1, request: r1, log: l1 } = await createAuditHarness();
      a1.logWorkflowCreateFailed(r1, err);
      expect(l1.mock.calls[0][0].message).toBe('User failed to create a workflow');
      expect(l1.mock.calls[0][0].event.action).toBe(WorkflowManagementAuditActions.CREATE);

      const { audit: a2, request: r2, log: l2 } = await createAuditHarness();
      a2.logWorkflowCreateFailed(r2, err, { bulkOperation: true });
      expect(l2.mock.calls[0][0].message).toBe('User failed bulk workflow create');
      expect(l2.mock.calls[0][0].event.action).toBe(WorkflowManagementAuditActions.BULK_CREATE);
    });

    it('logBulkWorkflowCreateResults', async () => {
      const { audit, request, log } = await createAuditHarness();
      audit.logBulkWorkflowCreateResults(request, {
        created: [{ id: 'new-1' }, { id: 'new-2' }],
        failed: [{ index: 0, id: 'bad', error: 'nope' }],
      });
      expect(log).toHaveBeenCalledTimes(3);
      expect(log.mock.calls[0][0].event.action).toBe(WorkflowManagementAuditActions.BULK_CREATE);
      expect(log.mock.calls[1][0].event.action).toBe(WorkflowManagementAuditActions.BULK_CREATE);
      expect(log.mock.calls[2][0].event.action).toBe(WorkflowManagementAuditActions.BULK_CREATE);
      expect(log.mock.calls[0][0].message).toContain('bulk import');
      expect(log.mock.calls[0][0].message).toContain('[id=new-1]');
      expect(log.mock.calls[1][0].message).toContain('[id=new-2]');
      expect(log.mock.calls[2][0].error).toEqual({ code: 'Unknown', message: 'nope' });
    });

    it('logWorkflowUpdated (success and failure)', async () => {
      const { audit, request, log } = await createAuditHarness();
      audit.logWorkflowUpdated(request, { id: 'u-1' });
      expect(log.mock.calls[0][0].event.action).toBe(WorkflowManagementAuditActions.UPDATE);

      const { audit: a2, request: r2, log: l2 } = await createAuditHarness();
      a2.logWorkflowUpdated(r2, { id: 'u-1', error: err });
      expect(l2.mock.calls[0][0]).toEqual(
        expect.objectContaining({
          message: expect.stringContaining('[id=u-1]'),
          error: { code: 'Error', message: 'boom' },
        })
      );
    });

    it('logWorkflowRestored (success and failure)', async () => {
      const { audit, request, log } = await createAuditHarness();
      audit.logWorkflowRestored(request, {
        id: 'wf-1',
        eventId: 'event-v3',
        version: 8,
        sequence: 3,
      });
      expect(log.mock.calls[0][0]).toEqual(
        expect.objectContaining({
          message:
            'User restored workflow from history [id=wf-1] [eventId=event-v3] [sequence=3] [version=8]',
          event: expect.objectContaining({
            action: WorkflowManagementAuditActions.RESTORE,
            outcome: 'success',
            type: ['change'],
          }),
        })
      );

      const { audit: a2, request: r2, log: l2 } = await createAuditHarness();
      a2.logWorkflowRestored(r2, {
        id: 'wf-1',
        eventId: 'missing-event',
        error: err,
      });
      expect(l2.mock.calls[0][0]).toEqual(
        expect.objectContaining({
          message: 'User failed to restore workflow from history [id=wf-1] [eventId=missing-event]',
          event: expect.objectContaining({
            action: WorkflowManagementAuditActions.RESTORE,
            outcome: 'failure',
          }),
          error: { code: 'Error', message: 'boom' },
        })
      );
    });

    it('logs managed workflow fields and uses the system logger without a request', async () => {
      const { audit, systemLog } = await createAuditHarness();
      audit.logWorkflowUpdated(undefined, {
        id: 'managed-doc',
        managed: true,
        originalWorkflowId: 'registry-id',
        ownerPlugin: 'ownerPlugin',
        spaceId: 'default',
        reason: 'reinstall',
      });

      expect(systemLog).toHaveBeenCalledWith(
        expect.objectContaining({
          message:
            'System updated workflow [id=managed-doc] [managed=true] ' +
            '[originalWorkflowId=registry-id] [ownerPlugin=ownerPlugin] [space=default] ' +
            '[reason=reinstall]',
        })
      );
      expect(systemLog.mock.calls[0][0]).not.toHaveProperty('labels');
    });

    it('logWorkflowDeleted (success and failure)', async () => {
      const { audit, request, log } = await createAuditHarness();
      audit.logWorkflowDeleted(request, { id: 'd-1' });
      expect(log.mock.calls[0][0].event.type).toEqual(['deletion']);
      expect(log.mock.calls[0][0].message).toBe('User deleted workflow [id=d-1]');

      const { audit: aBulk, request: rBulk, log: lBulk } = await createAuditHarness();
      aBulk.logWorkflowDeleted(rBulk, {
        id: 'd-2',
        viaBulkDelete: true,
      });
      expect(lBulk.mock.calls[0][0].event.action).toBe(WorkflowManagementAuditActions.BULK_DELETE);
      expect(lBulk.mock.calls[0][0].message).toContain('via bulk delete');
      expect(lBulk.mock.calls[0][0].message).toContain('[id=d-2]');

      const { audit: a2, request: r2, log: l2 } = await createAuditHarness();
      a2.logWorkflowDeleted(r2, { id: 'd-1', error: err });
      expect(l2.mock.calls[0][0].event.type).toEqual(['deletion']);
      expect(l2.mock.calls[0][0].event.outcome).toBe('failure');
      expect(l2.mock.calls[0][0].message).toContain('User failed to delete workflow [id=d-1]');
      expect(l2.mock.calls[0][0].message).not.toContain('bulk delete');

      const { audit: a3, request: r3, log: l3 } = await createAuditHarness();
      a3.logWorkflowDeleted(r3, {
        id: 'd-2',
        error: err,
        viaBulkDelete: true,
      });
      expect(l3.mock.calls[0][0].event.action).toBe(WorkflowManagementAuditActions.BULK_DELETE);
      expect(l3.mock.calls[0][0].message).toContain('via bulk delete');
    });

    it('logWorkflowDeleted includes (force) tag when force is true', async () => {
      const { audit, request, log } = await createAuditHarness();
      audit.logWorkflowDeleted(request, { id: 'd-1', force: true });
      expect(log.mock.calls[0][0].message).toBe('User deleted workflow [id=d-1] (force)');

      const { audit: a2, request: r2, log: l2 } = await createAuditHarness();
      a2.logWorkflowDeleted(r2, { id: 'd-1', force: false });
      expect(l2.mock.calls[0][0].message).not.toContain('(force)');
    });

    it('logBulkWorkflowDeleteResults and logBulkWorkflowDeleteFailed', async () => {
      const { audit, request, log } = await createAuditHarness();
      audit.logBulkWorkflowDeleteResults(request, {
        successfulIds: ['w1', 'w2'],
        failures: [{ id: 'w3', error: 'es error' }],
      });
      expect(log).toHaveBeenCalledTimes(3);
      expect(log.mock.calls[0][0].event.action).toBe(WorkflowManagementAuditActions.BULK_DELETE);
      expect(log.mock.calls[1][0].event.action).toBe(WorkflowManagementAuditActions.BULK_DELETE);
      expect(log.mock.calls[2][0].event.action).toBe(WorkflowManagementAuditActions.BULK_DELETE);
      expect(log.mock.calls[0][0].message).toContain('via bulk delete');
      expect(log.mock.calls[0][0].message).toContain('[id=w1]');
      expect(log.mock.calls[1][0].message).toContain('via bulk delete');
      expect(log.mock.calls[1][0].message).toContain('[id=w2]');
      expect(log.mock.calls[2][0].event.outcome).toBe('failure');
      expect(log.mock.calls[2][0].message).toContain('via bulk delete');
      expect(log.mock.calls[2][0].message).toContain('[id=w3]');

      const { audit: a2, request: r2, log: l2 } = await createAuditHarness();
      a2.logBulkWorkflowDeleteFailed(r2, err);
      expect(l2.mock.calls[0][0].event.action).toBe(WorkflowManagementAuditActions.BULK_DELETE);
    });

    it('logBulkWorkflowDeleteResults includes (force) tag when force is true', async () => {
      const { audit, request, log } = await createAuditHarness();
      audit.logBulkWorkflowDeleteResults(request, {
        successfulIds: ['w1'],
        failures: [{ id: 'w2', error: 'es error' }],
        force: true,
      });
      expect(log.mock.calls[0][0].message).toContain('(force)');
      expect(log.mock.calls[1][0].message).toContain('(force)');
    });

    it('logBulkWorkflowDeleteFailed includes (force) tag when force is true', async () => {
      const { audit, request, log } = await createAuditHarness();
      audit.logBulkWorkflowDeleteFailed(request, err, { force: true });
      expect(log.mock.calls[0][0].message).toContain('(force)');

      const { audit: a2, request: r2, log: l2 } = await createAuditHarness();
      a2.logBulkWorkflowDeleteFailed(r2, err);
      expect(l2.mock.calls[0][0].message).not.toContain('(force)');
    });

    it('logWorkflowCloned (success and failure)', async () => {
      const { audit, request, log } = await createAuditHarness();
      audit.logWorkflowCloned(request, { sourceId: 'a', newId: 'b' });
      expect(log.mock.calls[0][0].message).toContain('sourceId=a');
      expect(log.mock.calls[0][0].message).toContain('[id=b]');

      const { audit: a2, request: r2, log: l2 } = await createAuditHarness();
      a2.logWorkflowCloned(r2, { sourceId: 'a', error: err });
      expect(l2.mock.calls[0][0].event.type).toEqual(['creation']);
    });

    it('logWorkflowsExported (success per id and failure)', async () => {
      const { audit, request, log } = await createAuditHarness();
      audit.logWorkflowsExported(request, { ids: ['exp-1'] });
      expect(log.mock.calls[0][0].event.type).toEqual(['access']);

      const { audit: aBatch, request: rBatch, log: lBatch } = await createAuditHarness();
      aBatch.logWorkflowsExported(rBatch, { ids: ['a', 'b'] });
      expect(lBatch).toHaveBeenCalledTimes(2);
      expect(lBatch.mock.calls[0][0].message).toContain('[id=a]');
      expect(lBatch.mock.calls[1][0].message).toContain('[id=b]');

      const { audit: a2, request: r2, log: l2 } = await createAuditHarness();
      a2.logWorkflowsExported(r2, { error: err });
      expect(l2.mock.calls[0][0].event.action).toBe(WorkflowManagementAuditActions.EXPORT);
    });

    it('logWorkflowAccessed (success and failure)', async () => {
      const { audit, request, log } = await createAuditHarness();
      audit.logWorkflowAccessed(request, { id: 'g-1' });
      expect(log.mock.calls[0][0].event.action).toBe(WorkflowManagementAuditActions.GET);

      const { audit: a2, request: r2, log: l2 } = await createAuditHarness();
      a2.logWorkflowAccessed(r2, { id: 'g-1', error: err });
      expect(l2.mock.calls[0][0].event.type).toEqual(['access']);
    });

    it('logWorkflowMget (success and failure)', async () => {
      const { audit, request, log } = await createAuditHarness();
      audit.logWorkflowMget(request, {
        requestedCount: 5,
        returnedCount: 3,
      });
      expect(log.mock.calls[0][0].message).toContain('requested 5');
      expect(log.mock.calls[0][0].message).toContain('returned 3');

      const { audit: a2, request: r2, log: l2 } = await createAuditHarness();
      a2.logWorkflowMget(r2, { error: err });
      expect(l2.mock.calls[0][0].event.action).toBe(WorkflowManagementAuditActions.MGET);
    });

    it('logWorkflowRun (success and failure)', async () => {
      const { audit, request, log } = await createAuditHarness();
      audit.logWorkflowRun(request, {
        workflowId: 'wf',
        executionId: 'ex',
      });
      expect(log.mock.calls[0][0].message).toContain('[id=wf]');
      expect(log.mock.calls[0][0].message).toContain('[executionId=ex]');

      const { audit: a2, request: r2, log: l2 } = await createAuditHarness();
      a2.logWorkflowRun(r2, { workflowId: 'wf', error: err });
      expect(l2.mock.calls[0][0].event.action).toBe(WorkflowManagementAuditActions.RUN);
    });

    it('logWorkflowTest with and without workflowId', async () => {
      const { audit: a1, request: r1, log: l1 } = await createAuditHarness();
      a1.logWorkflowTest(r1, {
        workflowExecutionId: 'e1',
        workflowId: 'w',
      });
      expect(l1.mock.calls[0][0].message).toContain('[workflowId=w]');

      const { audit: a2, request: r2, log: l2 } = await createAuditHarness();
      a2.logWorkflowTest(r2, { workflowExecutionId: 'e2' });
      expect(l2.mock.calls[0][0].message).toContain('[draft yaml]');
    });

    it('logWorkflowTest (failure path)', async () => {
      const { audit, request, log } = await createAuditHarness();
      audit.logWorkflowTest(request, {
        workflowExecutionId: '',
        error: err,
      });
      expect(log.mock.calls[0][0].event.action).toBe(WorkflowManagementAuditActions.TEST);
    });

    it('logWorkflowStepTest with and without workflowId', async () => {
      const { audit: a1, request: r1, log: l1 } = await createAuditHarness();
      a1.logWorkflowStepTest(r1, {
        stepId: 's1',
        workflowExecutionId: 'e1',
        workflowId: 'w',
      });
      expect(l1.mock.calls[0][0].message).toContain('[stepId=s1]');
      expect(l1.mock.calls[0][0].message).toContain('[workflowId=w]');

      const { audit: a2, request: r2, log: l2 } = await createAuditHarness();
      a2.logWorkflowStepTest(r2, {
        stepId: 's2',
        workflowExecutionId: 'e2',
      });
      expect(l2.mock.calls[0][0].message).toContain('[draft yaml]');
    });

    it('logWorkflowStepTest (failure path)', async () => {
      const { audit, request, log } = await createAuditHarness();
      audit.logWorkflowStepTest(request, {
        stepId: 's0',
        workflowExecutionId: '',
        error: err,
      });
      expect(log.mock.calls[0][0].event.action).toBe(WorkflowManagementAuditActions.TEST_STEP);
    });

    it('logExecutionCanceled (success and failure)', async () => {
      const { audit, request, log } = await createAuditHarness();
      audit.logExecutionCanceled(request, { executionId: 'x-1' });
      expect(log.mock.calls[0][0].message).toContain('[executionId=x-1]');

      const { audit: a2, request: r2, log: l2 } = await createAuditHarness();
      a2.logExecutionCanceled(r2, {
        executionId: 'x-1',
        error: err,
      });
      expect(l2.mock.calls[0][0].event.action).toBe(
        WorkflowManagementAuditActions.CANCEL_EXECUTION
      );
    });

    it('logExecutionResumed (success and failure)', async () => {
      const { audit, request, log } = await createAuditHarness();
      audit.logExecutionResumed(request, { executionId: 'r-1' });
      expect(log.mock.calls[0][0].event.action).toBe(
        WorkflowManagementAuditActions.RESUME_EXECUTION
      );
      expect(log.mock.calls[0][0].message).toContain('[executionId=r-1]');

      const { audit: aEnriched, request: rEnriched, log: lEnriched } = await createAuditHarness();
      aEnriched.logExecutionResumed(rEnriched, {
        executionId: 'r-2',
        resumedBy: 'jdoe',
      });
      expect(lEnriched.mock.calls[0][0].message).toContain('[responder=jdoe]');

      const { audit: a2, request: r2, log: l2 } = await createAuditHarness();
      a2.logExecutionResumed(r2, {
        executionId: 'r-1',
        error: err,
      });
      expect(l2.mock.calls[0][0].event.outcome).toBe('failure');
    });
  });

  describe('bulk audit action naming for operators (workflow_bulk_* prefix)', () => {
    const bulkActionPrefix = /^workflow_bulk_/;

    it('every WorkflowManagementAuditActions key containing BULK maps to a workflow_bulk_* string', () => {
      const actions = WorkflowManagementAuditActions as Record<string, string>;
      for (const [key, value] of Object.entries(actions)) {
        if (key.includes('BULK')) {
          expect(value).toMatch(bulkActionPrefix);
        }
      }
    });

    it('single-workflow create/delete actions do not use the bulk prefix', () => {
      expect(WorkflowManagementAuditActions.CREATE).not.toMatch(bulkActionPrefix);
      expect(WorkflowManagementAuditActions.DELETE).not.toMatch(bulkActionPrefix);
    });

    it('bulk create/delete audit paths emit workflow_bulk_* event.action', async () => {
      const boom = new Error('boom');
      const { audit: aCreate, request: rCreate, log: lCreate } = await createAuditHarness();
      aCreate.logBulkWorkflowCreateResults(rCreate, {
        created: [{ id: 'a' }],
        failed: [{ index: 0, id: 'b', error: 'e' }],
      });
      for (const call of lCreate.mock.calls) {
        expect(call[0].event.action).toMatch(bulkActionPrefix);
      }

      const { audit: aDel, request: rDel, log: lDel } = await createAuditHarness();
      aDel.logBulkWorkflowDeleteResults(rDel, {
        successfulIds: ['w1'],
        failures: [{ id: 'w2', error: 'x' }],
      });
      for (const call of lDel.mock.calls) {
        expect(call[0].event.action).toMatch(bulkActionPrefix);
      }

      const { audit: aCatch, request: rCatch, log: lCatch } = await createAuditHarness();
      aCatch.logBulkWorkflowDeleteFailed(rCatch, boom);
      expect(lCatch.mock.calls[0][0].event.action).toMatch(bulkActionPrefix);

      const {
        audit: aFailCreate,
        request: rFailCreate,
        log: lFailCreate,
      } = await createAuditHarness();
      aFailCreate.logWorkflowCreateFailed(rFailCreate, boom, {
        bulkOperation: true,
      });
      expect(lFailCreate.mock.calls[0][0].event.action).toMatch(bulkActionPrefix);
    });
  });
});
