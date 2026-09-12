/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggerMock } from '@kbn/logging-mocks';
import { httpServerMock } from '@kbn/core-http-server-mocks';
import { ExecutionStatus } from '@kbn/workflows';
import type { ListProposalsQuery } from '../../../common/proposals/proposal';
import type { ProposalDocument, ProposalsStorageClient } from '../storage/proposals_storage';
import {
  ProposalConflictError,
  ProposalExpiredError,
  ProposalInvalidActionInputError,
  ProposalNotFoundError,
} from './errors';
import { ProposalsService } from './proposals_service';

const SPACE_ID = 'default';
const EXECUTION_ID = 'exec-1';

/** The resolved actor, in the shape the service stores. */
const analyst = (username: string, profileUid = `${username}-uid`) => ({
  username,
  fullName: null,
  email: null,
  profileUid,
});

const baseDocument = (overrides: Partial<ProposalDocument> = {}): ProposalDocument => ({
  spaceId: SPACE_ID,
  conversationId: 'conv-1',
  comment: 'Tune the noisy rule',
  actionWorkflowId: 'system-alertzero-action-create-rule',
  actionInput: { name: 'Suspicious PowerShell' },
  status: 'pending',
  impact: 'low',
  confidence: 'medium',
  category: 'tune',
  origin: 'worker',
  impactRank: 3,
  confidenceRank: 1,
  workflowExecutionId: EXECUTION_ID,
  createdAt: '2026-09-01T00:00:00.000Z',
  ...overrides,
});

/** The full query shape, so a test only states the filters it cares about. */
const listQuery = (overrides: Partial<ListProposalsQuery> = {}): ListProposalsQuery => ({
  excludeExpired: false,
  size: 50,
  from: 0,
  ...overrides,
});

const searchHit = (document: ProposalDocument, id = 'proposal-1') => ({
  _id: id,
  _source: document,
  _seq_no: 7,
  _primary_term: 1,
});

/** An empty ES|QL result, which every `chartsSummary` query defaults to. */
const emptyEsql = () => ({ columns: [], values: [] });

const createStorage = (document?: ProposalDocument) => {
  const hits = document ? [searchHit(document)] : [];
  return {
    index: jest.fn().mockResolvedValue({ _id: 'proposal-1' }),
    search: jest.fn().mockResolvedValue({
      hits: { hits, total: { value: hits.length } },
    }),
    esql: jest.fn().mockResolvedValue(emptyEsql()),
  } as unknown as jest.Mocked<ProposalsStorageClient> & {
    index: jest.Mock;
    search: jest.Mock;
    esql: jest.Mock;
  };
};

const createWorkflowsApi = () => ({
  getWorkflow: jest.fn().mockResolvedValue({
    definition: {
      consts: {
        actionMetadata: {
          name: 'Create detection rule',
          category: 'tune',
          impact: 'low',
          reversible: true,
          approvalPolicy: 'always-gate',
        },
      },
    },
  }),
  getWorkflowExecution: jest.fn().mockResolvedValue({
    id: EXECUTION_ID,
    status: ExecutionStatus.WAITING_FOR_INPUT,
    finishedAt: undefined,
    stepExecutions: [
      {
        id: 'step-exec-1',
        stepType: 'waitForApproval',
        status: ExecutionStatus.WAITING_FOR_INPUT,
        startedAt: '2026-09-01T00:01:00.000Z',
      },
    ],
  }),
  resumeWorkflowExecution: jest.fn().mockResolvedValue({ resumedBy: 'analyst' }),
});

/** Pass `null` for `workflowsApi` to simulate the API being unavailable. */
const createService = (
  storage: ReturnType<typeof createStorage>,
  workflowsApi: ReturnType<typeof createWorkflowsApi> | null = createWorkflowsApi()
) => {
  const logger = loggerMock.create();
  return {
    service: new ProposalsService({
      storage,
      logger,
      getWorkflowsApi: () => (workflowsApi ?? undefined) as never,
    }),
    workflowsApi: workflowsApi ?? createWorkflowsApi(),
    logger,
  };
};

const decisionContext = () => ({
  spaceId: SPACE_ID,
  request: httpServerMock.createKibanaRequest(),
  user: analyst('analyst'),
});

describe('ProposalsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should store a pending proposal with the category resolved from the action workflow', async () => {
      const storage = createStorage();
      const { service } = createService(storage);

      const proposal = await service.create(
        {
          conversationId: 'conv-1',
          comment: 'Tune the noisy rule',
          actionWorkflowId: 'system-alertzero-action-create-rule',
          actionInput: { name: 'Suspicious PowerShell' },
          impact: 'high',
          confidence: 'high',
          origin: 'worker',
          workflowExecutionId: EXECUTION_ID,
        },
        { spaceId: SPACE_ID, user: analyst('worker-user') }
      );

      expect(proposal.status).toBe('pending');
      expect(proposal.category).toBe('tune');
      expect(proposal.workflowExecutionId).toBe(EXECUTION_ID);
      expect(storage.index).toHaveBeenCalledWith(
        expect.objectContaining({ op_type: 'create', id: proposal.id })
      );
    });

    it('should reject an actionInput the action could never accept', async () => {
      const storage = createStorage();
      const workflowsApi = createWorkflowsApi();
      workflowsApi.getWorkflow.mockResolvedValue({
        definition: {
          consts: { actionMetadata: { name: 'Create rule', category: 'tune' } },
          triggers: [
            {
              type: 'manual',
              inputs: {
                properties: {
                  actionInput: {
                    type: 'object',
                    properties: { name: { type: 'string' } },
                    required: ['name'],
                  },
                },
              },
            },
          ],
        },
      });
      const { service } = createService(storage, workflowsApi);

      // Caught here rather than after an analyst approves something unrunnable.
      await expect(
        service.create(
          {
            conversationId: 'conv-1',
            comment: 'Tune the noisy rule',
            actionWorkflowId: 'system-alertzero-action-create-rule',
            actionInput: {},
            impact: 'low',
            confidence: 'medium',
            origin: 'worker',
          },
          { spaceId: SPACE_ID }
        )
      ).rejects.toThrow(ProposalInvalidActionInputError);
      expect(storage.index).not.toHaveBeenCalled();
    });

    it('should fetch the action definition only once while creating', async () => {
      const storage = createStorage();
      const workflowsApi = createWorkflowsApi();
      workflowsApi.getWorkflow.mockResolvedValue({
        definition: { consts: { actionMetadata: { name: 'Create rule', category: 'tune' } } },
      });
      const { service } = createService(storage, workflowsApi);

      await service.create(
        {
          conversationId: 'conv-1',
          comment: 'Tune the noisy rule',
          actionWorkflowId: 'system-alertzero-action-create-rule',
          impact: 'low',
          confidence: 'medium',
          origin: 'worker',
        },
        { spaceId: SPACE_ID }
      );

      // Metadata and input validation share the one fetch.
      expect(workflowsApi.getWorkflow).toHaveBeenCalledTimes(1);
    });

    it('should write the sort ranks so Elasticsearch can order the queue', async () => {
      const storage = createStorage();
      const workflowsApi = createWorkflowsApi();
      workflowsApi.getWorkflow.mockResolvedValue({
        definition: {
          consts: { actionMetadata: { name: 'Contain host', category: 'contain', impact: 'high' } },
        },
      });
      const { service } = createService(storage, workflowsApi);

      await service.create(
        {
          conversationId: 'conv-1',
          comment: 'Contain the host',
          actionWorkflowId: 'system-alertzero-action-create-rule',
          impact: 'low',
          confidence: 'high',
          origin: 'worker',
        },
        { spaceId: SPACE_ID }
      );

      const [[indexArgs]] = storage.index.mock.calls;
      expect(indexArgs.document).toMatchObject({
        impactRank: 1,
        confidenceRank: 0,
      });
    });

    it('should take impact from the action metadata rather than the caller', async () => {
      const storage = createStorage();
      const workflowsApi = createWorkflowsApi();
      workflowsApi.getWorkflow.mockResolvedValue({
        definition: {
          consts: { actionMetadata: { name: 'Create rule', category: 'tune', impact: 'high' } },
        },
      });
      const { service } = createService(storage, workflowsApi);

      const proposal = await service.create(
        {
          conversationId: 'conv-1',
          comment: 'Tune the noisy rule',
          actionWorkflowId: 'system-alertzero-action-create-rule',
          // Impact is intrinsic to the action, so the action's own value wins.
          impact: 'low',
          confidence: 'medium',
          origin: 'worker',
        },
        { spaceId: SPACE_ID }
      );

      expect(proposal.impact).toBe('high');
      expect(proposal.category).toBe('tune');
    });

    it('should keep the caller impact when the action declares none', async () => {
      const storage = createStorage();
      const workflowsApi = createWorkflowsApi();
      workflowsApi.getWorkflow.mockResolvedValue({
        definition: { consts: { actionMetadata: { name: 'Create rule', category: 'tune' } } },
      });
      const { service } = createService(storage, workflowsApi);

      const proposal = await service.create(
        {
          conversationId: 'conv-1',
          comment: 'Tune the noisy rule',
          actionWorkflowId: 'system-alertzero-action-create-rule',
          impact: 'critical',
          confidence: 'medium',
          origin: 'worker',
        },
        { spaceId: SPACE_ID }
      );

      expect(proposal.impact).toBe('critical');
    });

    it('should leave the category unset when the action declares no metadata', async () => {
      const storage = createStorage();
      const workflowsApi = createWorkflowsApi();
      workflowsApi.getWorkflow.mockResolvedValue({ definition: { consts: {} } });
      const { service } = createService(storage, workflowsApi);

      const proposal = await service.create(
        {
          conversationId: 'conv-1',
          comment: 'Tune the noisy rule',
          actionWorkflowId: 'system-alertzero-action-create-rule',
          impact: 'low',
          confidence: 'low',
          origin: 'worker',
        },
        { spaceId: SPACE_ID }
      );

      // The category vocabulary belongs to the solution that authored the
      // action, so there is no default for this plugin to invent.
      expect(proposal.category).toBeUndefined();
    });

    it('should treat empty template output as absent rather than storing it', async () => {
      const storage = createStorage();
      const { service, workflowsApi } = createService(storage);

      // Liquid renders a missing workflow input as '', and `expiresAt: ''` is
      // rejected outright by the date mapping.
      const proposal = await service.create(
        {
          conversationId: 'conv-1',
          comment: 'Tune the noisy rule',
          actionWorkflowId: '',
          expiresAt: '',
          impact: 'low',
          confidence: 'medium',
          origin: 'worker',
          workflowExecutionId: '',
        },
        { spaceId: SPACE_ID }
      );

      expect(proposal.expiresAt).toBeUndefined();
      expect(proposal.actionWorkflowId).toBeUndefined();
      expect(proposal.workflowExecutionId).toBeUndefined();
      // An empty action id must not look action-bearing.
      expect(workflowsApi.getWorkflow).not.toHaveBeenCalled();
    });

    it('should create a proposal that carries no action', async () => {
      const storage = createStorage();
      const { service, workflowsApi } = createService(storage);

      const proposal = await service.create(
        {
          conversationId: 'conv-1',
          comment: 'Rotate the credentials by hand, then approve',
          impact: 'medium',
          confidence: 'high',
          origin: 'worker',
        },
        { spaceId: SPACE_ID }
      );

      expect(proposal.actionWorkflowId).toBeUndefined();
      expect(workflowsApi.getWorkflow).not.toHaveBeenCalled();
    });
  });

  describe('approve', () => {
    it('should record the decision before resuming the gate', async () => {
      const storage = createStorage(baseDocument());
      const { service, workflowsApi } = createService(storage);
      const callOrder: string[] = [];
      storage.index.mockImplementation(async () => {
        callOrder.push('index');
      });
      workflowsApi.resumeWorkflowExecution.mockImplementation(async () => {
        callOrder.push('resume');
        return { resumedBy: 'analyst' };
      });

      const proposal = await service.approve(
        'proposal-1',
        { actionInput: { name: 'Suspicious PowerShell' } },
        decisionContext()
      );

      expect(proposal.status).toBe('approved');
      expect(proposal.decidedBy).toEqual(
        expect.objectContaining({ username: 'analyst', profileUid: 'analyst-uid' })
      );
      expect(proposal.decidedAt).toEqual(expect.any(String));
      expect(callOrder).toEqual(['index', 'resume']);
    });

    it('should resume with the explicitly resolved waitForApproval step execution id', async () => {
      const storage = createStorage(baseDocument());
      const { service, workflowsApi } = createService(storage);

      await service.approve('proposal-1', {}, decisionContext());

      expect(workflowsApi.resumeWorkflowExecution).toHaveBeenCalledWith(
        EXECUTION_ID,
        SPACE_ID,
        { approved: true },
        expect.anything(),
        expect.objectContaining({ stepExecutionId: 'step-exec-1' })
      );
    });

    it('should guard the write with the loaded sequence number', async () => {
      const storage = createStorage(baseDocument());
      const { service } = createService(storage);

      await service.approve('proposal-1', {}, decisionContext());

      expect(storage.index).toHaveBeenCalledWith(
        expect.objectContaining({ if_seq_no: 7, if_primary_term: 1 })
      );
    });

    it('should reject an approval whose action input no longer matches the record', async () => {
      const storage = createStorage(baseDocument());
      const { service, workflowsApi } = createService(storage);

      await expect(
        service.approve(
          'proposal-1',
          { actionInput: { name: 'something else' } },
          decisionContext()
        )
      ).rejects.toBeInstanceOf(ProposalConflictError);

      expect(storage.index).not.toHaveBeenCalled();
      expect(workflowsApi.resumeWorkflowExecution).not.toHaveBeenCalled();
    });

    it('should reject when another actor already decided', async () => {
      const storage = createStorage(baseDocument({ status: 'approved' }));
      const { service } = createService(storage);

      await expect(service.approve('proposal-1', {}, decisionContext())).rejects.toBeInstanceOf(
        ProposalConflictError
      );
    });

    it('should surface a losing concurrency race as a conflict', async () => {
      const storage = createStorage(baseDocument());
      const { service } = createService(storage);
      storage.index.mockRejectedValue(
        Object.assign(new Error('version conflict'), {
          statusCode: 409,
        })
      );

      await expect(service.approve('proposal-1', {}, decisionContext())).rejects.toBeInstanceOf(
        ProposalConflictError
      );
    });

    it('should reject a proposal past its decision deadline', async () => {
      const storage = createStorage(baseDocument({ expiresAt: '2020-01-01T00:00:00.000Z' }));
      const { service } = createService(storage);

      await expect(service.approve('proposal-1', {}, decisionContext())).rejects.toBeInstanceOf(
        ProposalExpiredError
      );
    });

    it('should reject when the execution is no longer waiting for input', async () => {
      const storage = createStorage(baseDocument());
      const { service, workflowsApi } = createService(storage);
      workflowsApi.getWorkflowExecution.mockResolvedValue({
        id: EXECUTION_ID,
        status: ExecutionStatus.COMPLETED,
        stepExecutions: [],
      });

      await expect(service.approve('proposal-1', {}, decisionContext())).rejects.toBeInstanceOf(
        ProposalConflictError
      );
    });

    it('should skip the resume for a proposal with no waiting execution', async () => {
      const storage = createStorage(baseDocument({ workflowExecutionId: undefined }));
      const { service, workflowsApi } = createService(storage);

      const proposal = await service.approve('proposal-1', {}, decisionContext());

      expect(proposal.status).toBe('approved');
      expect(workflowsApi.resumeWorkflowExecution).not.toHaveBeenCalled();
    });

    it('should throw when the proposal does not exist in the space', async () => {
      const storage = createStorage();
      const { service } = createService(storage);

      await expect(service.approve('missing', {}, decisionContext())).rejects.toBeInstanceOf(
        ProposalNotFoundError
      );
    });

    it('should accept an approval whose action input matches under a different key order', async () => {
      const storage = createStorage(
        baseDocument({ actionInput: { name: 'PowerShell', tag: 'a' } })
      );
      const { service, workflowsApi } = createService(storage);

      const proposal = await service.approve(
        'proposal-1',
        { actionInput: { tag: 'a', name: 'PowerShell' } },
        decisionContext()
      );

      expect(proposal.status).toBe('approved');
      expect(workflowsApi.resumeWorkflowExecution).toHaveBeenCalled();
    });

    it('should record the resume failure on the proposal when the gate cannot be released', async () => {
      const storage = createStorage(baseDocument());
      const { service, workflowsApi } = createService(storage);
      workflowsApi.resumeWorkflowExecution.mockRejectedValue(new Error('resume exploded'));

      await expect(service.approve('proposal-1', {}, decisionContext())).rejects.toThrow(
        'resume exploded'
      );

      expect(storage.index).toHaveBeenCalledTimes(2);
      expect(storage.index.mock.calls[1][0].document).toEqual(
        expect.objectContaining({ status: 'failed', executionError: 'resume exploded' })
      );
    });

    it('should keep the resume failure when recording it also fails', async () => {
      const storage = createStorage(baseDocument());
      const { service, workflowsApi, logger } = createService(storage);
      workflowsApi.resumeWorkflowExecution.mockRejectedValue(new Error('resume exploded'));
      storage.index
        .mockResolvedValueOnce({ _id: 'proposal-1' })
        .mockRejectedValueOnce(new Error('index unavailable'));

      await expect(service.approve('proposal-1', {}, decisionContext())).rejects.toThrow(
        'resume exploded'
      );

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('index unavailable'));
    });
  });

  describe('dismiss', () => {
    it('should record the structured reason and release the gate negatively', async () => {
      const storage = createStorage(baseDocument());
      const { service, workflowsApi } = createService(storage);

      const proposal = await service.dismiss(
        'proposal-1',
        { dismissReason: 'low_value', rationale: 'Noise, not worth a rule' },
        decisionContext()
      );

      expect(proposal.status).toBe('dismissed');
      expect(proposal.dismissReason).toBe('low_value');
      expect(proposal.rationale).toBe('Noise, not worth a rule');
      expect(workflowsApi.resumeWorkflowExecution).toHaveBeenCalledWith(
        EXECUTION_ID,
        SPACE_ID,
        { approved: false },
        expect.anything(),
        expect.anything()
      );
    });

    it('should log and surface a gate that could not be released', async () => {
      const storage = createStorage(baseDocument());
      const { service, workflowsApi, logger } = createService(storage);
      workflowsApi.resumeWorkflowExecution.mockRejectedValue(new Error('resume exploded'));

      await expect(
        service.dismiss('proposal-1', { dismissReason: 'low_value' }, decisionContext())
      ).rejects.toThrow('resume exploded');

      // Terminal already, so the only trace of the parked gate is the log.
      expect(storage.index).toHaveBeenCalledTimes(1);
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('resume exploded'));
    });
  });

  describe('update', () => {
    it('should move the proposal to a terminal execution state', async () => {
      const storage = createStorage(baseDocument({ status: 'approved' }));
      const { service } = createService(storage);

      const proposal = await service.update({ id: 'proposal-1', status: 'succeeded' }, SPACE_ID);

      expect(proposal.status).toBe('succeeded');
    });

    it.each(['succeeded', 'failed', 'dismissed'] as const)(
      'should refuse to move a proposal that already settled as %s',
      async (settled) => {
        const storage = createStorage(baseDocument({ status: settled }));
        const { service } = createService(storage);

        // A late on-failure handler must not rewrite an outcome that already
        // happened, so the guard lives here rather than in the workflow YAML.
        await expect(
          service.update({ id: 'proposal-1', status: 'failed' }, SPACE_ID)
        ).rejects.toThrow(ProposalConflictError);
        expect(storage.index).not.toHaveBeenCalled();
      }
    );

    it('should refuse a blank id without issuing an unsearchable ids query', async () => {
      const storage = createStorage(baseDocument());
      const { service } = createService(storage);

      // An on-failure handler that fires before creation succeeded resolves its
      // template to ''. Elasticsearch would answer with an opaque shard failure.
      await expect(service.update({ id: '', status: 'failed' }, SPACE_ID)).rejects.toBeInstanceOf(
        ProposalNotFoundError
      );

      expect(storage.search).not.toHaveBeenCalled();
    });

    it('should keep the failure detail when the action failed', async () => {
      const storage = createStorage(baseDocument({ status: 'executing' }));
      const { service } = createService(storage);

      const proposal = await service.update(
        { id: 'proposal-1', status: 'failed', executionError: 'gate timed out' },
        SPACE_ID
      );

      expect(proposal.status).toBe('failed');
      expect(proposal.executionError).toBe('gate timed out');
    });
  });

  describe('resolveActionMetadata', () => {
    it('should ignore metadata that does not match the schema', async () => {
      const storage = createStorage();
      const workflowsApi = createWorkflowsApi();
      workflowsApi.getWorkflow.mockResolvedValue({
        // `name` is required; `category` is any keyword, so it cannot be the
        // thing that fails here.
        definition: { consts: { actionMetadata: { category: 'tune' } } },
      });
      const { service } = createService(storage, workflowsApi);

      await expect(
        service.resolveActionMetadata('system-alertzero-action-create-rule', SPACE_ID)
      ).resolves.toBeUndefined();
    });

    it('should not fail when the workflows API is unavailable', async () => {
      const storage = createStorage();
      const { service } = createService(storage, null);

      await expect(
        service.resolveActionMetadata('system-alertzero-action-create-rule', SPACE_ID)
      ).resolves.toBeUndefined();
    });
  });

  describe('list', () => {
    it('should filter by space, status and conversation', async () => {
      const storage = createStorage(baseDocument());
      const { service } = createService(storage);

      await service.list(listQuery({ status: 'pending', conversationId: 'conv-1' }), SPACE_ID);

      const [[searchArgs]] = storage.search.mock.calls;
      expect(searchArgs.query.bool.filter).toEqual(
        expect.arrayContaining([
          { term: { spaceId: SPACE_ID } },
          { term: { status: 'pending' } },
          { term: { conversationId: 'conv-1' } },
        ])
      );
    });

    it('should order by rank in Elasticsearch rather than after the fetch', async () => {
      const storage = createStorage(baseDocument());
      const { service } = createService(storage);

      await service.list(listQuery(), SPACE_ID);

      const [[searchArgs]] = storage.search.mock.calls;
      // The keyword enums sort alphabetically, so the queue's order comes from
      // the numeric ranks written at creation.
      expect(searchArgs.sort).toEqual([
        { impactRank: { order: 'asc' } },
        { confidenceRank: { order: 'asc' } },
        { expiresAt: { order: 'asc', missing: '_last' } },
        { createdAt: { order: 'desc' } },
      ]);
    });

    it('should page in Elasticsearch, so the queue is not capped at a single fetch', async () => {
      const storage = createStorage(baseDocument());
      const { service } = createService(storage);

      await service.list(listQuery({ size: 25, from: 50 }), SPACE_ID);

      const [[searchArgs]] = storage.search.mock.calls;
      expect(searchArgs.size).toBe(25);
      expect(searchArgs.from).toBe(50);
      expect(searchArgs.track_total_hits).toBe(true);
    });

    it('should keep proposals with no deadline when excluding expired ones', async () => {
      const storage = createStorage(baseDocument());
      const { service } = createService(storage);

      await service.list(listQuery({ excludeExpired: true }), SPACE_ID);

      const [[searchArgs]] = storage.search.mock.calls;
      // A proposal without a deadline never expires, so it has to survive.
      expect(searchArgs.query.bool.filter).toEqual(
        expect.arrayContaining([
          {
            bool: {
              should: [
                { bool: { must_not: { exists: { field: 'expiresAt' } } } },
                { range: { expiresAt: { gt: 'now' } } },
              ],
              minimum_should_match: 1,
            },
          },
        ])
      );
    });

    it('should not filter on expiry by default', async () => {
      const storage = createStorage(baseDocument());
      const { service } = createService(storage);

      await service.list(listQuery(), SPACE_ID);

      const [[searchArgs]] = storage.search.mock.calls;
      expect(JSON.stringify(searchArgs.query.bool.filter)).not.toContain('expiresAt');
    });

    it('should not leak the storage-only sort ranks into the response', async () => {
      const storage = createStorage(baseDocument());
      const { service } = createService(storage);

      const { proposals } = await service.list(listQuery(), SPACE_ID);

      expect(proposals[0]).not.toHaveProperty('impactRank');
      expect(proposals[0]).not.toHaveProperty('confidenceRank');
    });
  });

  describe('listByWindow', () => {
    const activityQuery = (decidedWithinHours = 24) => ({
      includeStatuses: ['pending' as const],
      decidedWithinHours,
    });

    it('includes pending proposals regardless of age', async () => {
      const storage = createStorage(baseDocument({ status: 'pending' }));
      const { service } = createService(storage);

      const { proposals } = await service.listByWindow(activityQuery(), SPACE_ID);

      expect(proposals).toHaveLength(1);
    });

    it('queries with a should disjunction covering pending and decided-within-window', async () => {
      const storage = createStorage(baseDocument());
      const { service } = createService(storage);

      await service.listByWindow(activityQuery(48), SPACE_ID);

      const [[searchArgs]] = storage.search.mock.calls;
      const { bool } = searchArgs.query;
      expect(bool.filter).toEqual(expect.arrayContaining([{ term: { spaceId: SPACE_ID } }]));
      expect(bool.minimum_should_match).toBe(1);
      expect(bool.should).toEqual(
        expect.arrayContaining([
          { terms: { status: ['pending'] } },
          { range: { decidedAt: { gte: 'now-48h' } } },
        ])
      );
    });

    it('returns truncated=true when total exceeds the cap', async () => {
      const doc = baseDocument();
      const storage = {
        ...createStorage(doc),
        search: jest.fn().mockResolvedValue({
          hits: { hits: [searchHit(doc)], total: { value: 9999 } },
        }),
      } as unknown as ReturnType<typeof createStorage>;
      const { service } = createService(storage);

      const { truncated, total } = await service.listByWindow(activityQuery(), SPACE_ID);

      expect(truncated).toBe(true);
      expect(total).toBe(9999);
    });

    it('returns truncated=false when total is within the cap', async () => {
      const storage = createStorage(baseDocument());
      const { service } = createService(storage);

      const { truncated } = await service.listByWindow(activityQuery(), SPACE_ID);

      expect(truncated).toBe(false);
    });

    it('fetches action metadata only once for proposals sharing an actionWorkflowId', async () => {
      const doc = baseDocument({ actionWorkflowId: 'shared-action' });
      const storage = {
        ...createStorage(doc),
        search: jest.fn().mockResolvedValue({
          hits: {
            hits: [searchHit(doc, 'p1'), searchHit(doc, 'p2'), searchHit(doc, 'p3')],
            total: { value: 3 },
          },
        }),
      } as unknown as ReturnType<typeof createStorage>;
      const workflowsApi = createWorkflowsApi();
      const { service } = createService(storage, workflowsApi);

      await service.listByWindow(activityQuery(), SPACE_ID);

      expect(workflowsApi.getWorkflow).toHaveBeenCalledTimes(1);
    });

    it('does not leak sort ranks into the response', async () => {
      const storage = createStorage(baseDocument());
      const { service } = createService(storage);

      const { proposals } = await service.listByWindow(activityQuery(), SPACE_ID);

      expect(proposals[0]).not.toHaveProperty('categoryRank');
      expect(proposals[0]).not.toHaveProperty('impactRank');
      expect(proposals[0]).not.toHaveProperty('confidenceRank');
    });
  });

  describe('chartsSummary', () => {
    /**
     * A 2h window at 30m granularity anchored to a fixed clock: five buckets at
     * 10:00, 10:30, 11:00, 11:30 and 12:00, the last one still open at 12:10.
     */
    const NOW = '2026-09-11T12:10:00.000Z';
    const WINDOW_START = Date.parse('2026-09-11T10:00:00.000Z');
    const BUCKET_MS = 30 * 60 * 1000;
    const chartsQuery = { windowHours: 2, bucketMinutes: 30 };

    /** Column order deliberately differs from the STATS order, to exercise by-name lookup. */
    const byCategory = (field: string, rows: Array<[string, number]>) => ({
      columns: [{ name: field }, { name: 'category' }],
      values: rows.map(([category, count]) => [count, category]),
    });

    const byIdxAndCategory = (field: string, rows: Array<[number, string, number]>) => ({
      columns: [{ name: field }, { name: 'idx' }, { name: 'category' }],
      values: rows.map(([idx, category, count]) => [count, idx, category]),
    });

    /** The four queries resolve in the order the service issues them. */
    const mockEsql = (
      storage: ReturnType<typeof createStorage>,
      {
        anchor,
        opens,
        closes,
        expiries,
      }: {
        anchor?: object;
        opens?: object;
        closes?: object;
        expiries?: object;
      }
    ) => {
      storage.esql
        .mockResolvedValueOnce(anchor ?? emptyEsql())
        .mockResolvedValueOnce(opens ?? emptyEsql())
        .mockResolvedValueOnce(closes ?? emptyEsql())
        .mockResolvedValueOnce(expiries ?? emptyEsql());
    };

    const issuedQueries = (storage: ReturnType<typeof createStorage>): string[] =>
      storage.esql.mock.calls.map(([args]) => args.pipeline.toRequest().query as string);

    const esqlError = (type: string, reason: string) =>
      Object.assign(new Error(reason), { meta: { body: { error: { type, reason } } } });

    beforeEach(() => {
      jest.useFakeTimers({ now: new Date(NOW) });
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should seed a running sum from the anchor and move it with opens and closes', async () => {
      const storage = createStorage();
      mockEsql(storage, {
        anchor: byCategory('anchor', [['contain', 2]]),
        opens: byIdxAndCategory('opens', [[1, 'contain', 3]]),
        closes: byIdxAndCategory('closes', [[3, 'contain', 1]]),
      });
      const { service } = createService(storage);

      const { buckets } = await service.chartsSummary(chartsQuery, SPACE_ID);

      expect(buckets.map((b) => b.counts.contain)).toEqual([2, 5, 5, 4, 4]);
    });

    it('should include the current partial bucket', async () => {
      const storage = createStorage();
      const { service } = createService(storage);

      const { buckets } = await service.chartsSummary(chartsQuery, SPACE_ID);

      expect(buckets).toHaveLength(5);
      expect(buckets.map((b) => b.timestamp)).toEqual(
        [0, 1, 2, 3, 4].map((i) => WINDOW_START + i * BUCKET_MS)
      );
    });

    it('should clamp at zero rather than report a negative count', async () => {
      const storage = createStorage();
      mockEsql(storage, { closes: byIdxAndCategory('closes', [[0, 'contain', 2]]) });
      const { service } = createService(storage);

      const { buckets } = await service.chartsSummary(chartsQuery, SPACE_ID);

      expect(buckets.map((b) => b.counts.contain)).toEqual([0, 0, 0, 0, 0]);
    });

    it('should close a proposal at the bucket it expired in', async () => {
      const storage = createStorage();
      mockEsql(storage, {
        anchor: byCategory('anchor', [['contain', 1]]),
        expiries: byIdxAndCategory('expiries', [[2, 'contain', 1]]),
      });
      const { service } = createService(storage);

      const { buckets } = await service.chartsSummary(chartsQuery, SPACE_ID);

      expect(buckets.map((b) => b.counts.contain)).toEqual([1, 1, 0, 0, 0]);
    });

    /**
     * The regression this guards: a request-time `expiresAt > NOW()` filter would
     * erase an expired proposal from the buckets in which it was genuinely open,
     * so the same past bucket would answer differently on every refetch.
     */
    it('should not filter any query on request-time expiry', async () => {
      const storage = createStorage();
      const { service } = createService(storage);

      await service.chartsSummary(chartsQuery, SPACE_ID);

      for (const query of issuedQueries(storage)) {
        expect(query).not.toMatch(/expiresAt\s*>\s*NOW\(\)/i);
      }
    });

    it('should give action-less proposals a category so they are counted', async () => {
      const storage = createStorage();
      mockEsql(storage, { anchor: byCategory('anchor', [['uncategorized', 4]]) });
      const { service } = createService(storage);

      const { buckets } = await service.chartsSummary(chartsQuery, SPACE_ID);

      for (const query of issuedQueries(storage)) {
        expect(query).toContain('COALESCE(category');
      }
      expect(buckets.at(-1)?.counts).toEqual({ uncategorized: 4 });
    });

    it('should ask for no more rows than Elasticsearch will return', async () => {
      const storage = createStorage();
      const { service } = createService(storage);

      await service.chartsSummary(chartsQuery, SPACE_ID);

      // A larger LIMIT is capped to the truncation max rather than honoured, so
      // asking for one only hides that the newest buckets were dropped.
      for (const query of issuedQueries(storage)) {
        const limit = Number(query.match(/LIMIT\s+(\d+)\s*$/)?.[1]);
        expect(limit).toBeLessThanOrEqual(10000);
      }
    });

    it('should warn when a query comes back at the truncation ceiling', async () => {
      const storage = createStorage();
      mockEsql(storage, {
        opens: {
          columns: [{ name: 'opens' }, { name: 'idx' }, { name: 'category' }],
          values: Array.from({ length: 10000 }, () => [1, 0, 'contain']),
        },
      });
      const { service, logger } = createService(storage);

      await service.chartsSummary(chartsQuery, SPACE_ID);

      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('truncation ceiling'));
    });

    it('should return zero buckets when the mapping has not caught up', async () => {
      const storage = createStorage();
      storage.esql.mockRejectedValue(
        esqlError('verification_exception', 'line 1:20: Unknown column [expiresAt]')
      );
      const { service, logger } = createService(storage);

      const { buckets } = await service.chartsSummary(chartsQuery, SPACE_ID);

      expect(buckets).toHaveLength(5);
      expect(buckets.every((b) => Object.keys(b.counts).length === 0)).toBe(true);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('unknown column'));
    });

    /**
     * Swallowing these would render a flat line of zeroes with a 200, which reads
     * as a healthy empty dashboard rather than as the broken query it is.
     */
    it('should rethrow a verification error that is not an unknown column', async () => {
      const storage = createStorage();
      storage.esql.mockRejectedValue(
        esqlError('verification_exception', 'line 1:8: Unknown function [DATE_DIFFF]')
      );
      const { service } = createService(storage);

      await expect(service.chartsSummary(chartsQuery, SPACE_ID)).rejects.toThrow(
        'Unknown function'
      );
    });

    it('should rethrow an infrastructure error', async () => {
      const storage = createStorage();
      storage.esql.mockRejectedValue(
        esqlError('search_phase_execution_exception', 'all shards failed')
      );
      const { service } = createService(storage);

      await expect(service.chartsSummary(chartsQuery, SPACE_ID)).rejects.toThrow(
        'all shards failed'
      );
    });
  });
});
