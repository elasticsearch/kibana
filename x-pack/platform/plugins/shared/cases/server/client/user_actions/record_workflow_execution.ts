/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Boom from '@hapi/boom';
import { createCaseError } from '../../common/error';
import { UserActionActions, UserActionTypes } from '../../../common/types/domain';
import type { WorkflowOrigin, WorkflowPayload } from '../../../common/types/domain';
import type { CasesClientArgs } from '../types';
import { MAX_USER_ACTIONS_PER_CASE } from '../../../common/constants';

export interface PreflightWorkflowExecutionArgs {
  caseIds: string[];
}

export interface RecordWorkflowExecutionArgs {
  /**
   * Pre-fetched and pre-authorized entities returned by `ensureAuthorizedToRunWorkflow`.
   * The function writes exactly one user action per entity; callers must not supply entities
   * that have not already been authorized through that call.
   */
  entities: Array<{ id: string; owner: string }>;
  workflow: WorkflowPayload;
  origin?: WorkflowOrigin;
}

/**
 * Validates that recording the workflow execution would not exceed the per-case user-action limit
 * for any of the requested cases. Must be called before starting the workflow execution so a
 * rejection happens before anything irreversible.
 */
export const preflightWorkflowExecution = async (
  { caseIds }: PreflightWorkflowExecutionArgs,
  clientArgs: CasesClientArgs
): Promise<void> => {
  const {
    logger,
    services: { userActionService },
  } = clientArgs;

  try {
    const totals = await userActionService.getMultipleCasesUserActionsTotal({ caseIds });

    for (const caseId of caseIds) {
      const total = totals[caseId] ?? 0;
      if (total + 1 > MAX_USER_ACTIONS_PER_CASE) {
        throw Boom.badRequest(
          `The case with id ${caseId} has reached the limit of ${MAX_USER_ACTIONS_PER_CASE} user actions.`
        );
      }
    }
  } catch (error) {
    throw createCaseError({
      message: `Failed to preflight workflow execution for cases [${caseIds.join(', ')}]: ${error}`,
      error,
      logger,
    });
  }
};

/**
 * Records a workflow execution user action in the case activity log for each authorized entity.
 * Callers must supply `entities` from a prior `ensureAuthorizedToRunWorkflow` call — the function
 * writes exactly one user action per entity without re-checking authorization.
 */
export const recordWorkflowExecution = async (
  { entities, workflow, origin }: RecordWorkflowExecutionArgs,
  clientArgs: CasesClientArgs
): Promise<void> => {
  const {
    logger,
    user,
    services: { userActionService },
  } = clientArgs;

  const caseIds = entities.map(({ id }) => id);

  try {
    // Build one user action per case in a single bulk write.
    const userActions = entities.map(({ id: caseId, owner }) => ({
      type: UserActionTypes.workflow,
      action: UserActionActions.create,
      caseId,
      owner,
      user,
      payload: { workflow, origin },
    }));

    await userActionService.creator.bulkCreateUserAction({
      userActions,
      // wait_for ensures the activity rows are visible to the next find the client issues
      // right after the run mutation resolves.
      refresh: 'wait_for',
    });
  } catch (error) {
    throw createCaseError({
      message: `Failed to record workflow execution for cases [${caseIds.join(', ')}]: ${error}`,
      error,
      logger,
    });
  }
};
