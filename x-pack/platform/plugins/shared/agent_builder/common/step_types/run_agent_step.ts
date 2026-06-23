/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import type { CommonStepDefinition } from '@kbn/workflows-extensions/common';
import { StepCategory } from '@kbn/workflows';
import { JsonModelSchema } from '@kbn/workflows/spec/schema/common/json_model_schema';
import { i18n } from '@kbn/i18n';
import {
  CONNECTOR_OR_INFERENCE_ID_CONFLICT_MESSAGE_WORKFLOW,
  normalizeOptionalConnectorOrInferenceParam,
} from '../resolve_connector_or_inference_id';

/**
 * Step type ID for the agentBuilder run agent step.
 */
export const RunAgentStepTypeId = 'ai.agent';

/**
 * Input schema for the run agent step.
 */
export const InputSchema = z.object({
  /**
   * output schema for the run agent step, if provided agent will return structured output
   */
  schema: JsonModelSchema.optional().describe('The schema for the output of the agent.'),
  /**
   * The user input message to send to the agent.
   */
  message: z.string().describe('The user input message to send to the agent.'),
  /**
   * Optional attachments to provide to the agent.
   */
  attachments: z
    .array(
      z
        .object({
          /**
           * Optional unique identifier for the attachment.
           */
          id: z.string().optional(),
          /**
           * Type of the attachment (e.g., "security.alert").
           */
          type: z.string(),
          /**
           * Data payload of the attachment, specific to the attachment type.
           * Required unless `origin` is provided.
           */
          data: z.record(z.string(), z.any()).optional(),
          /**
           * Origin string (e.g. saved object ID) for by-reference attachments; resolved at send time when `data` is omitted.
           */
          origin: z.string().optional(),
          /**
           * When true, the attachment will not be displayed in the UI.
           */
          hidden: z.boolean().optional(),
        })
        .refine((a) => a.data !== undefined || a.origin !== undefined, {
          message: 'Each attachment must include either data or origin',
        })
    )
    .optional()
    .describe('Optional attachments to provide to the agent.'),
  /**
   * Optional existing conversation id to continue a previous conversation.
   */
  conversation_id: z
    .string()
    .optional()
    .describe('Optional existing conversation ID to continue a previous conversation.'),
});

/**
 * Output schema for the run agent step.
 */
export const OutputSchema = z.object({
  message: z
    .string()
    .describe(
      'The text response from the agent. When schema is provided, contains a string version of the structured output'
    ),
  structured_output: z
    .any()
    .optional()
    .describe('The structured output from the agent. Only here when schema was provided'),
  conversation_id: z
    .string()
    .optional()
    .describe(
      'Conversation ID associated with this step execution. Present when create_conversation is enabled or conversation_id is provided.'
    ),
  metadata: z
    .object({
      usage: z.object({
        inputTokens: z.number().describe('Total input tokens consumed across all LLM rounds.'),
        outputTokens: z.number().describe('Total output tokens produced across all LLM rounds.'),
        totalTokens: z.number().describe('Sum of input and output tokens across all LLM rounds.'),
      }),
    })
    .describe('Step execution metadata, including token usage across all LLM rounds.')
    .optional(),
});

/**
 * Validation message shown when `aggregate-by` is set without a `plugin-id`. The parent
 * rollup id (`aggregateBy`) is only meaningful alongside the billing attribution id (`pluginId`).
 */
export const AGGREGATE_BY_REQUIRES_PLUGIN_ID_MESSAGE =
  '`aggregate-by` can only be set when `plugin-id` is also set.';

/**
 * Config schema for the run agent step.
 */
export const ConfigSchema = z
  .object({
    /**
     * The ID of the agent to chat with. Defaults to the default Elastic AI agent.
     */
    'agent-id': z
      .string()
      .optional()
      .describe('The ID of the agent to chat with. Defaults to the default Elastic AI agent.'),
    /**
     * The ID of the connector to use for model routing. Mutually exclusive with `inference-id`.
     */
    'connector-id': z
      .string()
      .optional()
      .describe(
        'The ID of the connector to use. Defaults to the default GenAI connector. Mutually exclusive with `inference-id`.'
      ),
    /**
     * Inference endpoint ID for model routing (alias for the same internal id as connector-id).
     */
    'inference-id': z
      .string()
      .optional()
      .describe(
        'The inference endpoint ID to use. Mutually exclusive with `connector-id`; defaults apply when both are omitted.'
      ),
    /**
     * When true, create/persist a conversation and associate it with the executing user.
     * If conversation_id is provided, this can auto-create the conversation with that id if it does not exist.
     */
    'create-conversation': z
      .boolean()
      .optional()
      .describe('When true, creates a conversation for the step.'),
    /**
     * Connector telemetry feature id used to attribute this step's LLM calls for billing
     * (sets `metadata.connectorTelemetry.pluginId`). When omitted, the default Agent Builder
     * attribution is used.
     */
    'plugin-id': z
      .string()
      .max(255)
      .optional()
      .describe(
        "The feature id to attribute this step's LLM calls to for billing (connector telemetry pluginId)."
      ),
    /**
     * Parent feature id used to roll up this step's LLM token usage under a parent feature
     * (sets `metadata.connectorTelemetry.aggregateBy`). Only used when `plugin-id` is set.
     */
    'aggregate-by': z
      .string()
      .max(255)
      .optional()
      .describe(
        "The parent feature id to group this step's LLM token usage under (connector telemetry aggregateBy)."
      ),
  })
  .superRefine((cfg, ctx) => {
    const connector = normalizeOptionalConnectorOrInferenceParam(cfg['connector-id']);
    const inference = normalizeOptionalConnectorOrInferenceParam(cfg['inference-id']);
    if (connector !== undefined && inference !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: CONNECTOR_OR_INFERENCE_ID_CONFLICT_MESSAGE_WORKFLOW,
        path: ['connector-id'],
      });
    }
    if (cfg['aggregate-by'] !== undefined && cfg['plugin-id'] === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: AGGREGATE_BY_REQUIRES_PLUGIN_ID_MESSAGE,
        path: ['aggregate-by'],
      });
    }
  });

export type RunAgentStepInputSchema = typeof InputSchema;
export type RunAgentStepOutputSchema = typeof OutputSchema;
export type RunAgentStepConfigSchema = typeof ConfigSchema;

/**
 * Common step definition for RunAgent step.
 * This is shared between server and public implementations.
 * Input and output types are automatically inferred from the schemas.
 */
export const runAgentStepCommonDefinition: CommonStepDefinition<
  RunAgentStepInputSchema,
  RunAgentStepOutputSchema,
  RunAgentStepConfigSchema
> = {
  id: RunAgentStepTypeId,
  category: StepCategory.Ai,
  label: i18n.translate('xpack.agentBuilder.runAgentStep.label', {
    defaultMessage: 'Run Agent',
  }),
  description: i18n.translate('xpack.agentBuilder.runAgentStep.description', {
    defaultMessage:
      'Execute an AgentBuilder AI agent to process input and generate responses. Optionally provide a JSON schema to receive structured output.',
  }),
  documentation: {
    details: i18n.translate('xpack.agentBuilder.runAgentStep.documentation.details', {
      defaultMessage:
        'The agentBuilder.runAgent step allows you to invoke an AI agent within your workflow. The agent will process the input message and return a response, optionally using tools and maintaining conversation context. To receive structured output, provide a JSON schema that defines the expected response format.',
    }),
    examples: [
      `## Basic agent invocation
\`\`\`yaml
- name: run_agent
  type: ${RunAgentStepTypeId}
  with:
    message: "Analyze the following data and provide insights"
\`\`\``,

      `## Use a specific agent
\`\`\`yaml
- name: custom_agent
  type: ${RunAgentStepTypeId}
  agent-id: "my-custom-agent"
  with:
    message: "{{ workflow.input.message }}"
\`\`\``,

      `## Use an inference endpoint (mutually exclusive with connector-id)
\`\`\`yaml
- name: run_with_inference
  type: ${RunAgentStepTypeId}
  inference-id: "my-inference-endpoint-id"
  with:
    message: "Summarize the findings."
\`\`\``,

      `## Create a conversation and reuse it in a follow-up step
\`\`\`yaml
- name: initial_analysis
  type: ${RunAgentStepTypeId}
  agent-id: "my-custom-agent"
  create-conversation: true
  with:
    message: "Analyze the event and suggest next steps. {{ event | json }}"

- name: followup
  type: ${RunAgentStepTypeId}
  agent-id: "my-custom-agent"
  with:
    conversation_id: "{{ steps.initial_analysis.output.conversation_id }}"
    message: "Continue from the previous analysis and complete any missing steps."
\`\`\``,

      `## Get structured output using a JSON schema
\`\`\`yaml
- name: extract_person_data
  type: ${RunAgentStepTypeId}
  with:
    message: "Extract information about famous scientists from the text"
    schema:
      title: Person Array
      type: array
      items:
        title: Person
        type: object
        properties:
          name:
            type: string
            description: The person's first name
          surname:
            type: string
            description: The person's last name
          field:
            type: string
            description: Their field of study
        required:
          - name
          - surname
\`\`\`

When a schema is provided, the agent's response will be available in \`output.structured_output\` as a typed object, while \`output.message\` will contain a string representation of the structured output.`,

      `## Structured output with simple object schema
\`\`\`yaml
- name: analyze_sentiment
  type: ${RunAgentStepTypeId}
  with:
    message: "Analyze the sentiment of this customer feedback: {{ feedback }}"
    schema:
      type: object
      properties:
        sentiment:
          type: string
          enum: [positive, negative, neutral]
          description: Overall sentiment classification
        confidence:
          type: number
          description: Confidence score between 0 and 1
        key_phrases:
          type: array
          items:
            type: string
          description: Important phrases that influenced the sentiment
      required:
        - sentiment
        - confidence
\`\`\``,
    ],
  },
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  configSchema: ConfigSchema,
};
