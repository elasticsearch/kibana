/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { i18n } from '@kbn/i18n';
import { z } from '@kbn/zod/v4';
import type { CommonTriggerDefinition } from '../trigger_registry/types';

export const WORKFLOW_EXECUTION_FAILED_TRIGGER_ID = 'workflows.failed' as const;

const workflowExecutionFailedWorkflowSchema = z
  .object({
    id: z.string().describe(
      i18n.translate('workflowsExtensions.triggers.workflowExecutionFailed.schema.workflow.id', {
        defaultMessage: 'The failed workflow id.',
      })
    ),
    name: z.string().describe(
      i18n.translate('workflowsExtensions.triggers.workflowExecutionFailed.schema.workflow.name', {
        defaultMessage: 'The failed workflow name.',
      })
    ),
    spaceId: z.string().describe(
      i18n.translate(
        'workflowsExtensions.triggers.workflowExecutionFailed.schema.workflow.spaceId',
        {
          defaultMessage: 'The space where the workflow ran.',
        }
      )
    ),
    isErrorHandler: z.boolean().describe(
      i18n.translate(
        'workflowsExtensions.triggers.workflowExecutionFailed.schema.workflow.isErrorHandler',
        {
          defaultMessage:
            'True when the failed workflow was itself triggered by an error event; use to avoid infinite error loops.',
        }
      )
    ),
  })
  .strict();

const workflowExecutionFailedExecutionSchema = z
  .object({
    id: z.string().describe(
      i18n.translate('workflowsExtensions.triggers.workflowExecutionFailed.schema.execution.id', {
        defaultMessage: 'The execution id.',
      })
    ),
    startedAt: z.string().describe(
      i18n.translate(
        'workflowsExtensions.triggers.workflowExecutionFailed.schema.execution.startedAt',
        {
          defaultMessage: 'ISO timestamp when the execution started.',
        }
      )
    ),
    failedAt: z.string().describe(
      i18n.translate(
        'workflowsExtensions.triggers.workflowExecutionFailed.schema.execution.failedAt',
        {
          defaultMessage: 'ISO timestamp when the execution failed.',
        }
      )
    ),
  })
  .strict();

const workflowExecutionFailedErrorSchema = z
  .object({
    message: z.string().describe(
      i18n.translate('workflowsExtensions.triggers.workflowExecutionFailed.schema.error.message', {
        defaultMessage: 'The error message.',
      })
    ),
    stepId: z
      .string()
      .optional()
      .describe(
        i18n.translate('workflowsExtensions.triggers.workflowExecutionFailed.schema.error.stepId', {
          defaultMessage: 'Optional step id where the failure occurred.',
        })
      ),
    stepName: z
      .string()
      .optional()
      .describe(
        i18n.translate(
          'workflowsExtensions.triggers.workflowExecutionFailed.schema.error.stepName',
          {
            defaultMessage: 'Optional step name where the failure occurred.',
          }
        )
      ),
    stepExecutionId: z
      .string()
      .optional()
      .describe(
        i18n.translate(
          'workflowsExtensions.triggers.workflowExecutionFailed.schema.error.stepExecutionId',
          {
            defaultMessage: 'Optional id of the step execution where the failure occurred.',
          }
        )
      ),
  })
  .strict();

export const workflowExecutionFailedEventSchema = z
  .object({
    workflow: workflowExecutionFailedWorkflowSchema.describe(
      i18n.translate('workflowsExtensions.triggers.workflowExecutionFailed.schema.workflowGroup', {
        defaultMessage: 'Details of the workflow that failed.',
      })
    ),
    execution: workflowExecutionFailedExecutionSchema.describe(
      i18n.translate('workflowsExtensions.triggers.workflowExecutionFailed.schema.executionGroup', {
        defaultMessage: 'Details of the failed execution.',
      })
    ),
    error: workflowExecutionFailedErrorSchema.describe(
      i18n.translate('workflowsExtensions.triggers.workflowExecutionFailed.schema.errorGroup', {
        defaultMessage: 'Details of the failure.',
      })
    ),
  })
  .strict();

export type WorkflowExecutionFailedEvent = z.infer<typeof workflowExecutionFailedEventSchema>;

export const commonWorkflowExecutionFailedTriggerDefinition: CommonTriggerDefinition = {
  id: WORKFLOW_EXECUTION_FAILED_TRIGGER_ID,
  stability: 'tech_preview',
  eventSchema: workflowExecutionFailedEventSchema,
  title: i18n.translate('workflowsExtensions.triggers.workflowExecutionFailed.title', {
    defaultMessage: 'Workflow failed',
  }),
  description: i18n.translate('workflowsExtensions.triggers.workflowExecutionFailed.description', {
    defaultMessage:
      'Emitted when any workflow in the same space fails. Use to handle errors, send notifications, perform cleanup, or retry failed operations.',
  }),
  documentation: {
    details: i18n.translate(
      'workflowsExtensions.triggers.workflowExecutionFailed.documentation.details',
      {
        defaultMessage: `Emitted when a workflow run fails. The event includes \`workflow\` (id, name, spaceId, isErrorHandler), \`execution\` (id, startedAt, failedAt), and \`error\` (message, stepId, stepName, stepExecutionId). Use KQL in \`on.condition\` to filter by workflow name, failed step, or exclude error-handler workflows to avoid infinite loops.`,
      }
    ),
    examples: [
      i18n.translate(
        'workflowsExtensions.triggers.workflowExecutionFailed.documentation.exampleBasic',
        {
          defaultMessage: `## Log all workflow failures
\`\`\`yaml
triggers:
  - type: {triggerId}
steps:
  - name: log_to_index
    type: elasticsearch.index
    with:
      index: workflow-errors
      body:
        workflow_id: "{eventWorkflowId}"
        error: "{eventErrorMessage}"
        timestamp: "{eventFailedAt}"
\`\`\``,
          values: {
            triggerId: WORKFLOW_EXECUTION_FAILED_TRIGGER_ID,
            eventWorkflowId: '{{event.workflow.id}}',
            eventErrorMessage: '{{event.error.message}}',
            eventFailedAt: '{{event.execution.failedAt}}',
          },
        }
      ),
      i18n.translate(
        'workflowsExtensions.triggers.workflowExecutionFailed.documentation.exampleFilterName',
        {
          defaultMessage: `## Filter by workflow name
\`\`\`yaml
triggers:
  - type: {triggerId}
    on:
      condition: event.workflow.name: critical*
\`\`\``,
          values: { triggerId: WORKFLOW_EXECUTION_FAILED_TRIGGER_ID },
        }
      ),
      i18n.translate(
        'workflowsExtensions.triggers.workflowExecutionFailed.documentation.exampleExcludeErrorHandlers',
        {
          defaultMessage: `## Exclude error-handler workflows (prevent loops)
\`\`\`yaml
triggers:
  - type: {triggerId}
    on:
      condition: not event.workflow.isErrorHandler:true
\`\`\``,
          values: { triggerId: WORKFLOW_EXECUTION_FAILED_TRIGGER_ID },
        }
      ),
    ],
  },
  snippets: {
    condition: 'not event.workflow.isErrorHandler:true',
  },
};
