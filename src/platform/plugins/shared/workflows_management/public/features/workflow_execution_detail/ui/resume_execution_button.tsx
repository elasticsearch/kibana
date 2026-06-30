/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { EuiButton, EuiCallOut, EuiFlexGroup, EuiFlexItem } from '@elastic/eui';
import type { JSONSchema7 } from 'json-schema';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import type { StepContext } from '@kbn/workflows';
import { convertJsonSchemaToZod } from '@kbn/workflows/spec/lib/build_fields_zod_validator';
import type { JsonModelSchemaType } from '@kbn/workflows/spec/schema/common/json_model_schema';
import {
  generateSampleFromJsonSchema,
  ResumeExecutionModal,
  useWorkflowsApi,
  useWorkflowsCapabilities,
} from '@kbn/workflows-ui';

import { useTelemetry } from '../../../hooks/use_telemetry';
import { useWorkflowUrlState } from '../../../hooks/use_workflow_url_state';
import type { ContextOverrideData } from '../../../shared/utils/build_step_context_override/build_step_context_override';

interface ResumeExecutionButtonProps {
  executionId: string;
  workflowId?: string;
  /** Step execution `startedAt` (ISO) for telemetry: approximate human-wait duration vs time in modal */
  stepStartedAt?: string;
  resumeMessage?: string;
  resumeSchema?: JsonModelSchemaType;
  /** When true, opens the input modal immediately on mount */
  autoOpen?: boolean;
  /** Step execution document id for the active waitForInput pause; when it changes, re-enable after a prior submit */
  waitingStepExecutionId?: string;
}

export const ResumeExecutionButton: React.FC<ResumeExecutionButtonProps> = ({
  executionId,
  workflowId,
  stepStartedAt,
  resumeMessage,
  resumeSchema,
  autoOpen = false,
  waitingStepExecutionId,
}) => {
  const { notifications } = useKibana().services;
  const workflowsApi = useWorkflowsApi();
  const { canExecuteWorkflow } = useWorkflowsCapabilities();
  const { clearResumeParam } = useWorkflowUrlState();
  const telemetry = useTelemetry();
  const [isModalOpen, setIsModalOpen] = useState(autoOpen);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const modalOpenedAtRef = useRef<number | null>(null);

  // Honour autoOpen changes (e.g. when navigated to with ?resume=true)
  useEffect(() => {
    if (autoOpen) {
      modalOpenedAtRef.current = Date.now();
      setIsModalOpen(true);
    }
  }, [autoOpen]);

  useEffect(() => {
    setIsSubmitted(false);
  }, [waitingStepExecutionId]);

  const contextOverride = useMemo<ContextOverrideData | undefined>(() => {
    if (!resumeSchema) return undefined;
    try {
      const jsonSchema = resumeSchema as JSONSchema7;
      const zodSchema = convertJsonSchemaToZod(jsonSchema);
      const defaults = generateSampleFromJsonSchema(jsonSchema);
      return {
        schema: zodSchema,
        stepContext: defaults as Partial<StepContext>,
        rawJsonSchema: resumeSchema,
      };
    } catch {
      // A malformed or unsupported schema must not crash the execution detail page
      // Fall back to no context override so the modal still opens with a free form JSON editor.
      return undefined;
    }
  }, [resumeSchema]);

  const openModal = useCallback(() => {
    modalOpenedAtRef.current = Date.now();
    setIsModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    clearResumeParam();
    setIsModalOpen(false);
  }, [clearResumeParam]);

  const handleSubmit = useCallback(
    async ({ stepInputs }: { stepInputs: Record<string, unknown> }) => {
      setIsSubmitting(true);
      const submittedAt = Date.now();
      const timeInModalMs =
        modalOpenedAtRef.current != null ? submittedAt - modalOpenedAtRef.current : undefined;
      const stepStartMs = stepStartedAt != null ? Date.parse(stepStartedAt) : NaN;
      const timeSinceStepStartedMs = !Number.isNaN(stepStartMs)
        ? Math.max(0, submittedAt - stepStartMs)
        : undefined;
      try {
        await workflowsApi.resumeExecution(executionId, { input: stepInputs });
        notifications?.toasts.addSuccess({
          title: i18n.translate(
            'workflowsManagement.executionDetail.resumeButton.successNotificationTitle',
            { defaultMessage: 'Workflow resumed' }
          ),
        });
        telemetry.reportWorkflowRunResumed({
          workflowExecutionId: executionId,
          workflowId,
          timeInModalMs,
          timeSinceStepStartedMs,
        });
        setIsSubmitted(true);
        closeModal();
      } catch (error) {
        const errorObj = error instanceof Error ? error : new Error(String(error));
        notifications?.toasts.addError?.(errorObj, {
          title: i18n.translate(
            'workflowsManagement.executionDetail.resumeButton.errorNotificationTitle',
            { defaultMessage: 'Error resuming workflow' }
          ),
        });
        telemetry.reportWorkflowRunResumed({
          workflowExecutionId: executionId,
          workflowId,
          timeInModalMs,
          timeSinceStepStartedMs,
          error: errorObj,
        });
      } finally {
        setIsSubmitting(false);
      }
    },
    [executionId, workflowId, stepStartedAt, workflowsApi, notifications, telemetry, closeModal]
  );

  return (
    <>
      <EuiCallOut color="warning" data-test-subj="waitForInputCallout">
        <EuiFlexGroup
          alignItems="center"
          justifyContent="spaceBetween"
          gutterSize="s"
          responsive={false}
        >
          <EuiFlexItem>
            <FormattedMessage
              id="workflowsManagement.executionDetail.resumeButton.calloutText"
              defaultMessage="User action is required"
            />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButton
              fill
              color="warning"
              size="s"
              onClick={openModal}
              disabled={!canExecuteWorkflow || isSubmitting || isSubmitted}
              isLoading={isSubmitting}
              data-test-subj="provideActionButton"
            >
              <FormattedMessage
                id="workflowsManagement.executionDetail.resumeButton.label"
                defaultMessage="Provide action"
              />
            </EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiCallOut>

      {isModalOpen && (
        <ResumeExecutionModal
          initialcontextOverride={contextOverride}
          resumeMessage={resumeMessage}
          onClose={closeModal}
          onSubmit={handleSubmit}
        />
      )}
    </>
  );
};
