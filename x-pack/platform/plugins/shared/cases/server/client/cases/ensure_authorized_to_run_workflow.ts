/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Boom from '@hapi/boom';
import { WriteOperations } from '../../authorization';
import type { OperationDetails } from '../../authorization';
import { CASE_SAVED_OBJECT } from '../../../common/constants';
import { createCaseError, isSOError } from '../../common/error';
import type { CasesClientArgs } from '../types';

/**
 * Authorization operation for running a workflow from a case.
 *
 * The privilege name (`updateCase`) is intentionally reused from `Operations.updateCase` so that
 * the same `cases:<owner>/updateCase` privilege controls access — keeping the privilege model
 * consistent with the existing Cases write-access requirement. Only the audit fields are overridden
 * to emit `case_workflow_run_authz` (an access event) rather than the misleading `case_update`
 * (a change event) that `Operations.updateCase` produces.
 */
export const WORKFLOW_RUN_AUTHZ_OPERATION: OperationDetails = {
  ecsType: 'access',
  name: WriteOperations.UpdateCase,
  action: 'case_workflow_run_authz',
  verbs: {
    present: 'run workflow on',
    progressive: 'running workflow on',
    past: 'ran workflow on',
  },
  docType: 'case',
  savedObjectType: CASE_SAVED_OBJECT,
};

export interface EnsureAuthorizedToRunWorkflowParams {
  ids: string[];
}

/**
 * Authorizes the caller to run a workflow against all the given case IDs.
 *
 * The check is all-or-nothing: if the caller lacks `cases:<owner>/updateCase` on *any* of the
 * requested cases, a 403 is thrown and no execution is started.
 *
 * Critically, SO errors (not-found, etc.) are never surfaced as 404s. A 404 on a subset of ids
 * would let an unauthorized caller enumerate which ids exist across owners by toggling the
 * response code. Instead, any SO error in the batch is treated as another 403 — the caller
 * cannot distinguish "id does not exist" from "you can't see it".
 *
 * Returns the authorized entities so callers can reuse them without re-fetching the cases.
 */
export const ensureAuthorizedToRunWorkflow = async (
  { ids }: EnsureAuthorizedToRunWorkflowParams,
  { authorization, logger, services: { caseService } }: CasesClientArgs
): Promise<Array<{ id: string; owner: string }>> => {
  try {
    const { saved_objects: cases } = await caseService.getCases({ caseIds: ids });

    const entities = cases
      .filter((c) => !isSOError(c))
      .map((c) => ({
        id: c.id,
        owner: (c as Exclude<typeof c, { error: unknown }>).attributes.owner,
      }));

    // If *any* id failed to load, treat the whole batch as unauthorized. Surfacing a 404 for
    // the missing id — even after a successful authorize call on the others — would let an
    // unprivileged caller enumerate which case ids exist across owners they cannot read.
    const hasMissingCases = cases.some(isSOError);
    if (entities.length === 0 || hasMissingCases) {
      // ensureAuthorized({ entities: [] }) passes vacuously because it derives an empty
      // privilege set from zero owners. Reject explicitly so an unauthorized caller never
      // receives anything other than 403.
      throw Boom.forbidden('Unauthorized to run workflow on case');
    }

    // One privilege round-trip covers all owners; throws Boom.forbidden if any is unauthorized.
    await authorization.ensureAuthorized({
      operation: WORKFLOW_RUN_AUTHZ_OPERATION,
      entities,
    });

    return entities;
  } catch (error) {
    throw createCaseError({
      message: `Failed to authorize workflow run for case ids: ${ids.join(', ')}: ${error}`,
      error,
      logger,
    });
  }
};
