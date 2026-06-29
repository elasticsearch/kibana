/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Logger } from '@kbn/core/server';
import {
  createInboxActionConflictError,
  createInvalidInboxActionSourceIdError,
  type InboxActionProvider,
  type InboxActionProviderFacetsResult,
  type InboxActionProviderListParams,
  type InboxActionProviderListProcessedParams,
  type InboxActionProviderListResult,
  type InboxRequestContext,
} from '@kbn/inbox-plugin/server';
import { ExecutionStatus } from '@kbn/workflows';
import { WorkflowExecutionInvalidStatusError } from '@kbn/workflows/common/errors';
import {
  buildWorkflowSourceId,
  parseWorkflowSourceId,
  toInboxAction,
  toInboxHistoryAction,
} from './to_inbox_action';
import type { WorkflowManagementAuditLog } from '../api/routes/utils/workflow_audit_logging';
import type { WorkflowsManagementApi } from '../api/workflows_management_api';

export const WORKFLOWS_INBOX_SOURCE_APP = 'workflows' as const;

export interface CreateWorkflowsInboxProviderArgs {
  api: WorkflowsManagementApi;
  logger: Logger;
  /** Same instance as HTTP routes — inbox resume must emit identical security audit events. */
  audit: WorkflowManagementAuditLog;
  /**
   * Fallback slice size for direct provider calls. The Inbox registry passes
   * an explicit `perPage` sized to the requested merged page.
   */
  pageSize?: number;
}

/**
 * Workflows-side {@link InboxActionProvider}. Pure HITL — emits one
 * {@link InboxAction} per step execution currently blocked on `waitForInput`.
 *
 * Aligned with HITL GA epic [security-team#16706](https://github.com/elastic/security-team/issues/16706):
 * the provider does NOT promote prior-step output into source-specific
 * "proposal" payloads. Workflow authors who need to surface context to the
 * responder embed it in the `waitForInput.with.message` template.
 */
export const createWorkflowsInboxProvider = ({
  api,
  logger,
  audit,
  pageSize = 1000,
}: CreateWorkflowsInboxProviderArgs): InboxActionProvider => {
  return {
    sourceApp: WORKFLOWS_INBOX_SOURCE_APP,

    async list(
      params: InboxActionProviderListParams,
      ctx: InboxRequestContext
    ): Promise<InboxActionProviderListResult> {
      const { results, total, reasoningByStepId } = await api.listWaitingForInputSteps(
        ctx.spaceId,
        {
          page: params.page ?? 1,
          perPage: params.perPage ?? pageSize,
          includeReasoning: true,
        }
      );

      return {
        actions: results.map((step) => toInboxAction(step, reasoningByStepId.get(step.id))),
        total,
      };
    },

    async listProcessed(
      params: InboxActionProviderListProcessedParams,
      ctx: InboxRequestContext
    ): Promise<InboxActionProviderListResult> {
      const { results, total, reasoningByStepId, deletedWorkflowIds } =
        await api.listProcessedWaitForInputSteps(ctx.spaceId, {
          page: params.page ?? 1,
          perPage: params.perPage ?? pageSize,
          // Push the filter dimensions the workflows step-exec index can
          // answer with native predicates straight down to the query service.
          q: params.q,
          channel: params.channel,
          workflowId: params.workflowId,
          respondedBy: params.respondedBy,
          sortOrder: params.sortOrder,
        });

      return {
        actions: results.map((step) =>
          toInboxHistoryAction(step, reasoningByStepId.get(step.id), {
            workflowDeleted: step.workflowId ? deletedWorkflowIds.has(step.workflowId) : false,
          })
        ),
        total,
      };
    },

    async listProcessedFacets(ctx: InboxRequestContext): Promise<InboxActionProviderFacetsResult> {
      // The query service computes facets against the same baseline scope as
      // the listing (space + waitForInput + terminated-or-audit-stamped) but
      // skips user-supplied filter clauses on purpose. See
      // `listProcessedWaitForInputFacets` for the stability rationale.
      const { channel, respondedBy } = await api.listProcessedWaitForInputFacets(ctx.spaceId);
      return { channel, respondedBy };
    },

    async respond(
      sourceId: string,
      input: Record<string, unknown>,
      ctx: InboxRequestContext
    ): Promise<void> {
      const parsed = parseWorkflowSourceId(sourceId);
      if (!parsed) {
        throw createInvalidInboxActionSourceIdError(
          WORKFLOWS_INBOX_SOURCE_APP,
          sourceId,
          'workflowId:workflowRunId:stepExecutionId'
        );
      }

      // Re-read the targeted step so stale inbox responses cannot resume a
      // later waitForInput step from the same execution.
      const stepExecution = await api.getStepExecution(
        { executionId: parsed.executionId, id: parsed.stepExecutionId },
        ctx.spaceId
      );

      if (!stepExecution) {
        throw createInboxActionConflictError(
          WORKFLOWS_INBOX_SOURCE_APP,
          sourceId,
          `step execution ${parsed.stepExecutionId} not found in space ${ctx.spaceId}`
        );
      }

      if (stepExecution.status !== ExecutionStatus.WAITING_FOR_INPUT) {
        throw createInboxActionConflictError(
          WORKFLOWS_INBOX_SOURCE_APP,
          buildWorkflowSourceId(stepExecution),
          `step execution ${parsed.stepExecutionId} is in status "${stepExecution.status}", expected "${ExecutionStatus.WAITING_FOR_INPUT}"`
        );
      }

      // A timeout can leave a stale waiting_for_input status on a settled doc.
      if (stepExecution.finishedAt || stepExecution.error) {
        throw createInboxActionConflictError(
          WORKFLOWS_INBOX_SOURCE_APP,
          buildWorkflowSourceId(stepExecution),
          `step execution ${parsed.stepExecutionId} is already settled (finishedAt=${
            stepExecution.finishedAt ?? 'unset'
          }${stepExecution.error ? `, error=${stepExecution.error.type}` : ''})`
        );
      }

      const channel = ctx.channel ?? 'inbox';
      logger.debug(
        `Workflows inbox provider resuming execution ${parsed.executionId} (workflow ${parsed.workflowId})`
      );
      try {
        const { resumedBy } = await api.resumeWorkflowExecution(
          parsed.executionId,
          ctx.spaceId,
          input,
          ctx.request,
          { channel, stepExecutionId: parsed.stepExecutionId }
        );
        audit.logExecutionResumed(ctx.request, {
          executionId: parsed.executionId,
          resumedBy,
        });
      } catch (error) {
        if (error instanceof WorkflowExecutionInvalidStatusError) {
          throw createInboxActionConflictError(
            WORKFLOWS_INBOX_SOURCE_APP,
            sourceId,
            `step execution ${parsed.stepExecutionId} was already claimed or no longer accepts input`
          );
        }
        audit.logExecutionResumed(ctx.request, {
          executionId: parsed.executionId,
          error,
        });
        throw error;
      }
    },
  };
};
