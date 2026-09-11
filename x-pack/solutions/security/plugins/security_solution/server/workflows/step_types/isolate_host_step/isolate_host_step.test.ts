/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ExecutionError } from '@kbn/workflows/server';
import type { ActionDetails } from '../../../../common/endpoint/types';
import { createMockEndpointAppContextService } from '../../../endpoint/mocks';
import { getEndpointAuthzInitialStateMock } from '../../../../common/endpoint/service/authz/mocks';
import { getActionDetailsById } from '../../../endpoint/services/actions';
import { createIsolateHostStepDefinition } from './isolate_host_step';

jest.mock('../../../endpoint/services/actions', () => ({
  getActionDetailsById: jest.fn(),
}));

const mockGetActionDetailsById = getActionDetailsById as jest.MockedFunction<
  typeof getActionDetailsById
>;

type StepDef = ReturnType<typeof createIsolateHostStepDefinition>;
type StartContext = Parameters<NonNullable<StepDef['start']>>[0];
type PollContext = Parameters<StepDef['poll']>[0];

const SPACE_ID = 'default';
const ACTION_ID = 'test-action-id';

const makeActionDetails = (
  overrides: Pick<ActionDetails, 'status' | 'isCompleted' | 'wasSuccessful'>
): ActionDetails => ({
  id: ACTION_ID,
  agents: ['agent-1'],
  hosts: { 'agent-1': { name: 'test-host' } },
  command: 'isolate',
  isExpired: false,
  wasCanceled: false,
  errors: undefined,
  startedAt: '2024-01-01T00:00:00.000Z',
  completedAt: undefined,
  agentState: {},
  createdBy: 'test-user',
  agentType: 'endpoint',
  ...overrides,
});

const createStartContext = (input: { endpoint_ids: string[]; comment?: string }): StartContext =>
  ({
    input,
    contextManager: {
      getContext: jest.fn().mockReturnValue({ workflow: { spaceId: SPACE_ID } }),
      getFakeRequest: jest.fn().mockReturnValue({}),
    },
  } as unknown as StartContext);

const createPollContext = (state: unknown): PollContext =>
  ({
    state,
    attempt: 0,
    contextManager: {
      getContext: jest.fn().mockReturnValue({ workflow: { spaceId: SPACE_ID } }),
    },
  } as unknown as PollContext);

describe('createIsolateHostStepDefinition', () => {
  let mockEndpointService: ReturnType<typeof createMockEndpointAppContextService>;
  let mockIsolate: jest.Mock;
  let stepDefinition: ReturnType<typeof createIsolateHostStepDefinition>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockEndpointService = createMockEndpointAppContextService();
    mockIsolate = jest.fn().mockResolvedValue({ id: ACTION_ID });
    (mockEndpointService.getInternalResponseActionsClient as jest.Mock).mockReturnValue({
      isolate: mockIsolate,
    });
    stepDefinition = createIsolateHostStepDefinition(mockEndpointService);
  });

  describe('start', () => {
    it('dispatches the isolation action and returns action_id as state', async () => {
      const result = await stepDefinition.start!(
        createStartContext({ endpoint_ids: ['agent-1'], comment: 'test isolation' })
      );

      expect(mockIsolate).toHaveBeenCalledWith({
        endpoint_ids: ['agent-1'],
        comment: 'test isolation',
      });
      expect(result).toEqual({ state: { action_id: ACTION_ID } });
    });

    it('uses an empty string comment when comment is omitted', async () => {
      await stepDefinition.start!(createStartContext({ endpoint_ids: ['agent-1'] }));

      expect(mockIsolate).toHaveBeenCalledWith(expect.objectContaining({ comment: '' }));
    });

    it('throws ExecutionError when the user lacks canIsolateHost privilege', async () => {
      (mockEndpointService.getEndpointAuthz as jest.Mock).mockResolvedValue(
        getEndpointAuthzInitialStateMock({ canIsolateHost: false })
      );

      await expect(
        stepDefinition.start!(createStartContext({ endpoint_ids: ['agent-1'] }))
      ).rejects.toThrow(ExecutionError);
    });
  });

  describe('poll', () => {
    it('returns undefined to continue polling when the action is not yet complete', async () => {
      mockGetActionDetailsById.mockResolvedValue(
        makeActionDetails({ status: 'pending', isCompleted: false, wasSuccessful: false })
      );

      const result = await stepDefinition.poll(createPollContext({ action_id: ACTION_ID }));

      expect(result).toBeUndefined();
    });

    it('returns completed output when the action succeeds', async () => {
      mockGetActionDetailsById.mockResolvedValue(
        makeActionDetails({ status: 'successful', isCompleted: true, wasSuccessful: true })
      );

      const result = await stepDefinition.poll(createPollContext({ action_id: ACTION_ID }));

      expect(result).toEqual({
        output: {
          action_id: ACTION_ID,
          status: 'successful',
          was_successful: true,
          message: expect.stringContaining('completed successfully'),
        },
      });
    });

    it('returns completed output when the action fails', async () => {
      mockGetActionDetailsById.mockResolvedValue(
        makeActionDetails({ status: 'failed', isCompleted: true, wasSuccessful: false })
      );

      const result = await stepDefinition.poll(createPollContext({ action_id: ACTION_ID }));

      expect(result).toEqual({
        output: {
          action_id: ACTION_ID,
          status: 'failed',
          was_successful: false,
          message: expect.stringContaining('failed'),
        },
      });
    });

    it('throws ExecutionError when action_id is missing from poll state', async () => {
      await expect(stepDefinition.poll(createPollContext(undefined))).rejects.toThrow(
        ExecutionError
      );
      await expect(stepDefinition.poll(createPollContext({}))).rejects.toThrow(ExecutionError);
    });
  });
});
