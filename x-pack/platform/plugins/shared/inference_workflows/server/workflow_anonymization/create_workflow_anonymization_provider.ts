/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ExecutionStatus, visitNestedSteps, type WorkflowYaml } from '@kbn/workflows';
import type { WorkflowAnonymizationProvider } from '@kbn/inference-plugin/server';
import type { WorkflowsManagementApi } from '@kbn/workflows-management-plugin/server';
import {
  createInferenceProceedCapabilityValue,
  createPiiTokenizationCapabilityValue,
  INFERENCE_PROCEED_CAPABILITY_ID,
  PII_TOKENIZATION_CAPABILITY_ID,
} from '@kbn/inference-plugin/server';
import {
  aroundCompletionEventSchema,
  CALL_SITE_PROCEED_STEP_ID,
  INFERENCE_AROUND_COMPLETION_TRIGGER_ID,
} from '../../common/workflow_anonymization';
import { triggerEvaluationsCounter } from './anonymization_metrics';

type WorkflowAnonymizationManagement = Pick<
  WorkflowsManagementApi,
  'resolveWorkflowTriggerMatches' | 'executeWorkflowSynchronously'
>;

type TriggerResolution = Awaited<
  ReturnType<WorkflowAnonymizationManagement['resolveWorkflowTriggerMatches']>
>;

const countWorkflowStepType = (steps: WorkflowYaml['steps'], stepType: string): number => {
  let count = 0;
  visitNestedSteps(steps, ({ step }) => {
    if (step.type === stepType) {
      count += 1;
    }
  });
  return count;
};

export const createWorkflowAnonymizationProvider = ({
  management,
  ensureManagedWorkflow,
  triggerCacheTtlMs,
}: {
  management: WorkflowAnonymizationManagement;
  ensureManagedWorkflow: (
    spaceId: string,
    request: Parameters<WorkflowAnonymizationProvider['execute']>[0]['request']
  ) => Promise<void>;
  triggerCacheTtlMs: number;
}): WorkflowAnonymizationProvider => {
  // Cache keyed on (spaceId, agentId) — the two stable identifiers that workflow trigger
  // conditions are expected to vary on. Conditions on sessionId or message content are not
  // supported with caching; those use-cases are outside the anonymization policy model.
  // TTL is controlled by xpack.inference.anonymization.triggerCacheTtlSeconds (0 = no cache).
  const triggerCache = new Map<string, { result: TriggerResolution; expiresAt: number }>();

  return {
    supportsSynchronousExecution: true,
    execute: async ({ event, namespace, request, pii, proceed, abortSignal }) => {
      if (namespace.trim().length === 0) {
        throw new Error('Workflow anonymization requires a non-empty space ID');
      }
      const parsedEvent = aroundCompletionEventSchema.parse(event);
      await ensureManagedWorkflow(namespace, request);

      const cacheKey = `${namespace}:${parsedEvent.agentId ?? ''}`;
      const now = Date.now();
      const cached = triggerCacheTtlMs > 0 ? triggerCache.get(cacheKey) : undefined;
      let resolution: TriggerResolution;

      if (cached && cached.expiresAt > now) {
        resolution = cached.result;
      } else {
        resolution = await management.resolveWorkflowTriggerMatches(
          INFERENCE_AROUND_COMPLETION_TRIGGER_ID,
          parsedEvent,
          namespace
        );
        // Only cache valid resolutions — invalid conditions are likely transient config errors
        // that should be re-evaluated on the next request rather than held for the full TTL.
        if (triggerCacheTtlMs > 0 && resolution.invalidConditionWorkflows.length === 0) {
          // Prune expired entries on every write to prevent unbounded accumulation over the
          // plugin lifetime (e.g. deleted spaces whose keys are never looked up again).
          for (const [key, entry] of triggerCache) {
            if (entry.expiresAt <= now) {
              triggerCache.delete(key);
            }
          }
          triggerCache.set(cacheKey, {
            result: resolution,
            expiresAt: now + triggerCacheTtlMs,
          });
        }
      }

      if (resolution.invalidConditionWorkflows.length > 0) {
        // Fail closed across the space. Ignoring a malformed subscribed policy could allow an
        // unprotected connector call when the workflow author intended that policy to match.
        triggerEvaluationsCounter.add(1, { outcome: 'invalid_condition' });
        throw new Error(
          `Invalid around-completion trigger condition in workflow(s): ${resolution.invalidConditionWorkflows
            .map(({ id, name }) => `${name} (${id})`)
            .join(', ')}`
        );
      }
      if (resolution.matched.length === 0) {
        triggerEvaluationsCounter.add(1, { outcome: 'no_match' });
        return { matched: false };
      }
      if (resolution.matched.length > 1) {
        triggerEvaluationsCounter.add(1, { outcome: 'overlap_conflict' });
        throw new Error('Multiple workflows matched the around-completion inference event');
      }

      const [workflow] = resolution.matched;
      const proceedCount = countWorkflowStepType(
        workflow.definition?.steps ?? [],
        CALL_SITE_PROCEED_STEP_ID
      );
      if (proceedCount !== 1) {
        throw new Error(
          `Workflow "${workflow.id}" must contain exactly one ${CALL_SITE_PROCEED_STEP_ID} step`
        );
      }

      const response = await management.executeWorkflowSynchronously({
        workflowId: workflow.id,
        // Pass the already-fetched DTO to avoid a second ES read on the inference hot path.
        // executeWorkflowSynchronously validates the DTO (enabled/valid/definition) before executing.
        workflow,
        context: {
          event: parsedEvent,
          spaceId: namespace,
          triggeredBy: INFERENCE_AROUND_COMPLETION_TRIGGER_ID,
        },
        spaceId: namespace,
        request,
        capabilities: [
          { id: PII_TOKENIZATION_CAPABILITY_ID, value: createPiiTokenizationCapabilityValue(pii) },
          {
            id: INFERENCE_PROCEED_CAPABILITY_ID,
            value: createInferenceProceedCapabilityValue(proceed),
          },
        ],
        abortSignal,
      });

      if (response.result?.status !== ExecutionStatus.COMPLETED) {
        const stepError = response.result?.error?.message;
        throw new Error(
          stepError
            ? `Workflow "${workflow.id}" did not complete successfully: ${stepError}`
            : `Workflow "${workflow.id}" did not complete successfully`
        );
      }
      const content = response.result.output?.content;
      if (typeof content !== 'string') {
        throw new Error(`Workflow "${workflow.id}" did not return string content`);
      }

      triggerEvaluationsCounter.add(1, { outcome: 'matched' });
      return { matched: true, content };
    },
  };
};
