/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { z } from '@kbn/zod/v4';
import {
  ConsoleStepInputSchema,
  DataSetStepInputSchema,
  ForEachStepConfigSchema,
  IfStepConfigSchema,
  ParallelStepConfigSchema,
  SwitchStepConfigSchema,
  WaitForApprovalStepInputSchema,
  WaitForInputStepInputSchema,
  WaitStepInputSchema,
  WhileStepConfigSchema,
  WorkflowExecuteAsyncStepOutputSchema,
  WorkflowExecuteStepInputSchema,
} from './schema';
import { type BaseStepDefinition, StepCategory } from './step_definition_types';
import {
  MAX_HITL_CHANNEL_LENGTH,
  MAX_HITL_RESPONDED_AT_LENGTH,
  MAX_HITL_RESPONDED_BY_LENGTH,
  MAX_HITL_RESPONSE_FIELD_KEY_LENGTH,
} from '../common/hitl';

const EmptyObjectSchema = z.object({});

/** Shared HITL audit fields on waitForInput / waitForApproval step output. */
export const hitlAuditOutputFields = {
  respondedBy: z.string().max(MAX_HITL_RESPONDED_BY_LENGTH),
  channel: z.string().max(MAX_HITL_CHANNEL_LENGTH).optional(),
  respondedAt: z.string().max(MAX_HITL_RESPONDED_AT_LENGTH).optional(),
};

export type BuiltInStepDefinition = BaseStepDefinition;

/**
 * Built-in step definitions derived from the Zod schemas in schema.ts.
 * Each definition decomposes into inputSchema (the `with` block),
 * configSchema (step-level props like condition/steps/else/foreach),
 * and outputSchema.
 */
export const builtInStepDefinitions: BaseStepDefinition[] = [
  {
    id: 'console',
    label: 'Console',
    description: 'Log a message for debugging and observability',
    category: StepCategory.Kibana,
    inputSchema: ConsoleStepInputSchema,
    outputSchema: z.string(),
    documentation: {
      examples: [
        `- name: log_payload
  type: console
  with:
    message: "{{ steps.fetch_data.output | json }}"`,
      ],
    },
  },
  {
    id: 'if',
    label: 'If',
    description:
      'Conditional execution. Runs steps when condition is true, with optional else block for the false branch',
    category: StepCategory.FlowControl,
    inputSchema: EmptyObjectSchema,
    outputSchema: EmptyObjectSchema,
    configSchema: IfStepConfigSchema,
    documentation: {
      examples: [
        `- name: check_status
  type: if
  condition: "steps.previous_step.output.status : 'success'"
  steps:
    - name: on_success
      type: console
      with:
        message: "Success!"
  else:
    - name: on_failure
      type: console
      with:
        message: "Failed!"`,
      ],
    },
  },
  {
    id: 'foreach',
    label: 'Loop (foreach)',
    description:
      'Loop over a list. Access current item via {{ foreach.item }}, index via {{ foreach.index }}, total via {{ foreach.total }}',
    category: StepCategory.FlowControl,
    inputSchema: EmptyObjectSchema,
    outputSchema: EmptyObjectSchema,
    configSchema: ForEachStepConfigSchema,
    documentation: {
      examples: [
        `- name: process_items
  type: foreach
  foreach: "{{ steps.search.output.hits.hits | json }}"
  steps:
    - name: log_item
      type: console
      with:
        message: "Processing item {{ foreach.index }}: {{ foreach.item._source.name }}"`,
      ],
    },
  },
  {
    id: 'while',
    label: 'While Loop',
    description:
      'Repeat steps while condition is true (do-while semantics — first iteration always runs). Access iteration index via {{ while.iteration }}',
    category: StepCategory.FlowControl,
    inputSchema: EmptyObjectSchema,
    outputSchema: EmptyObjectSchema,
    configSchema: WhileStepConfigSchema,
    documentation: {
      examples: [
        `- name: poll_api
  type: while
  max-iterations: 10
  condition: "steps.poll_api.inner_http.output.status_code : 200"
  steps:
    - name: inner_http
      type: http
      with:
        url: https://api.example.com/status`,
      ],
    },
  },
  {
    id: 'switch',
    label: 'Switch',
    description:
      'Multi-way branching. Evaluates an expression and runs the steps of the first case whose match equals the expression',
    category: StepCategory.FlowControl,
    inputSchema: EmptyObjectSchema,
    outputSchema: EmptyObjectSchema,
    configSchema: SwitchStepConfigSchema,
    documentation: {
      examples: [
        `- name: route_by_status
  type: switch
  expression: "{{ steps.check.output.status }}"
  cases:
    - match: success
      steps:
        - name: on_success
          type: console
          with:
            message: "Operation succeeded"
    - match: error
      steps:
        - name: on_error
          type: console
          with:
            message: "Operation failed"
  default:
    - name: on_unknown
      type: console
      with:
        message: "Unknown status"`,
      ],
    },
  },
  {
    id: 'parallel',
    label: 'Parallel',
    description:
      'Run branches concurrently and collect their results. Use dynamic fan-out (`foreach` + `steps`) to run the same body once per item, or static `branches` to run a fixed set of named, heterogeneous branches.',
    category: StepCategory.FlowControl,
    stability: 'tech_preview',
    inputSchema: EmptyObjectSchema,
    outputSchema: EmptyObjectSchema,
    configSchema: ParallelStepConfigSchema,
    documentation: {
      examples: [
        `- name: enrich
  type: parallel
  branches:
    - name: virustotal
      steps:
        - name: scan_hash
          type: http
          with:
            url: "https://example.com/vt/{{ inputs.file_hash }}"
    - name: geoip
      steps:
        - name: geo_lookup
          type: http
          with:
            url: "http://ip-api.com/json/{{ inputs.source_ip }}"`,
      ],
    },
  },
  {
    id: 'loop.break',
    label: 'Break',
    description: 'Exit the enclosing loop immediately. Valid only inside a foreach or while body',
    category: StepCategory.FlowControl,
    inputSchema: EmptyObjectSchema,
    outputSchema: EmptyObjectSchema,
    documentation: {
      examples: [
        `- name: stop_on_done
  type: loop.break
  if: "foreach.item.status : 'done'"`,
      ],
    },
  },
  {
    id: 'loop.continue',
    label: 'Continue',
    description:
      'Skip remaining steps in the current iteration and advance to the next one. Valid only inside a foreach or while body',
    category: StepCategory.FlowControl,
    inputSchema: EmptyObjectSchema,
    outputSchema: EmptyObjectSchema,
    documentation: {
      examples: [
        `- name: skip_processed
  type: loop.continue
  if: "foreach.item.processed : true"`,
      ],
    },
  },
  {
    id: 'wait',
    supportedExecutionModes: ['async'],
    label: 'Wait',
    description: 'Pause execution for a specified duration',
    category: StepCategory.FlowControl,
    inputSchema: WaitStepInputSchema,
    outputSchema: EmptyObjectSchema,
    documentation: {
      examples: [
        `- name: wait_before_retry
  type: wait
  with:
    duration: "30s"`,
      ],
    },
  },
  {
    id: 'data.set',
    label: 'Set Variables',
    description: 'Set variables in the workflow context',
    category: StepCategory.Data,
    inputSchema: DataSetStepInputSchema,
    outputSchema: EmptyObjectSchema,
    documentation: {
      examples: [
        `- name: set_variables
  type: data.set
  with:
    user_name: "{{ steps.get_user.output.body.name }}"
    alert_count: "{{ steps.search_alerts.output.hits.total.value }}"`,
      ],
    },
  },
  {
    id: 'workflow.execute',
    supportedExecutionModes: ['async'],
    label: 'Execute Workflow',
    description: 'Execute another workflow and wait for it to complete',
    category: StepCategory.FlowControl,
    stability: 'tech_preview',
    inputSchema: WorkflowExecuteStepInputSchema,
    outputSchema: z.unknown(),
    documentation: {
      examples: [
        `- name: run_child_workflow
  type: workflow.execute
  with:
    workflow-id: "child_workflow"
    inputs:
      alertId: "{{ workflow.event.id }}"`,
      ],
    },
  },
  {
    id: 'waitForInput',
    supportedExecutionModes: ['async'],
    label: 'Wait For Input',
    description: 'Pause execution until external input is provided (human-in-the-loop)',
    category: StepCategory.FlowControl,
    stability: 'tech_preview',
    inputSchema: WaitForInputStepInputSchema,
    outputSchema: z.object({
      response: z.record(z.string().max(MAX_HITL_RESPONSE_FIELD_KEY_LENGTH), z.unknown()),
      ...hitlAuditOutputFields,
    }),
    documentation: {
      examples: [
        `- name: wait_for_approval
  type: waitForInput
  with:
    message: "Please approve before continuing"`,
        `- name: collect_reason
  type: waitForInput
  with:
    message: "Provide a reason for escalation"
    schema:
      properties:
        reason:
          type: string
        severity:
          type: string
          enum: [low, medium, high]
          default: medium
      required:
        - reason`,
        `- name: ask_in_slack
  type: waitForInput
  with:
    message: "Choose how to proceed"
    channels:
      slack_api:
        connector-id: my-slack-api-connector
        channels: ['C0123456789', '#alerts']`,
      ],
    },
  },
  {
    id: 'waitForApproval',
    supportedExecutionModes: ['async'],
    label: 'Wait For Approval',
    description: 'Pause execution until approval or rejection is received (human-in-the-loop)',
    category: StepCategory.FlowControl,
    stability: 'tech_preview',
    inputSchema: WaitForApprovalStepInputSchema,
    outputSchema: z.object({
      response: z.object({ approved: z.boolean() }),
      ...hitlAuditOutputFields,
    }),
    documentation: {
      examples: [
        `- name: request-approval
  type: waitForApproval
  timeout: 24h
  with:
    message: "Approve isolation for {{ inputs.hostname }}?"
    approveLabel: Approve
    rejectLabel: Decline
    channels:
      slack:
        connector-id: my-slack-webhook-connector
      slack_api:
        connector-id: my-slack-api-connector
        channels: ['C0123456789', '#alerts']`,
      ],
    },
  },
  {
    id: 'workflow.executeAsync',
    supportedExecutionModes: ['async'],
    label: 'Execute Workflow (Async)',
    description: 'Start another workflow and continue without waiting for completion',
    category: StepCategory.FlowControl,
    stability: 'tech_preview',
    inputSchema: WorkflowExecuteStepInputSchema,
    outputSchema: WorkflowExecuteAsyncStepOutputSchema,
    documentation: {
      examples: [
        `- name: start_child_workflow
  type: workflow.executeAsync
  with:
    workflow-id: "child_workflow"
    inputs:
      alertId: "{{ workflow.event.id }}"`,
      ],
    },
  },
];

const builtInStepDefinitionsMap = new Map(builtInStepDefinitions.map((s) => [s.id, s]));

export function getBuiltInStepDefinition(id: string): BaseStepDefinition | undefined {
  return builtInStepDefinitionsMap.get(id);
}
