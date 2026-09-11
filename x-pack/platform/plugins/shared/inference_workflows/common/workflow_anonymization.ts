/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import { MessageRole, type AnonymizationEntityClass, type Message } from '@kbn/inference-common';
import { StepCategory } from '@kbn/workflows';
import type {
  CommonStepDefinition,
  CommonTriggerDefinition,
} from '@kbn/workflows-extensions/common';
import { z } from '@kbn/zod/v4';

export const INFERENCE_AROUND_COMPLETION_TRIGGER_ID = 'inference.aroundCompletion';
export const AI_PII_STEP_ID = 'ai.pii';
export const CALL_SITE_PROCEED_STEP_ID = 'call_site.proceed';
export const TRANSFORM_PII_RESTORE_STEP_ID = 'transform.pii_restore';

const textContentSchema = z.object({ type: z.literal('text'), text: z.string() }).strict();
const imageContentSchema = z
  .object({
    type: z.literal('image'),
    // Images are opaque to PII traversal. Preserve additional source metadata so valid message
    // extensions do not become runtime failures before anonymization sees the textual content.
    source: z.object({ data: z.string(), mimeType: z.string() }).passthrough(),
  })
  .passthrough();

const userMessageSchema = z
  .object({
    role: z.literal(MessageRole.User),
    content: z.union([z.string(), z.array(z.union([textContentSchema, imageContentSchema]))]),
  })
  .strict();

const toolCallSchema = z
  .object({
    toolCallId: z.string(),
    function: z
      .object({
        name: z.string(),
        arguments: z.record(z.string(), z.unknown()),
      })
      .strict(),
  })
  .strict();

const assistantMessageSchema = z
  .object({
    role: z.literal(MessageRole.Assistant),
    content: z.string().nullable(),
    refusal: z.string().nullable().optional(),
    toolCalls: z.array(toolCallSchema).optional(),
  })
  .strict();

const toolMessageSchema = z
  .object({
    role: z.literal(MessageRole.Tool),
    name: z.string(),
    toolCallId: z.string(),
    response: z.union([z.string(), z.record(z.string(), z.unknown())]),
    data: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

const inferredWorkflowChatMessageSchema = z.discriminatedUnion('role', [
  userMessageSchema,
  assistantMessageSchema,
  toolMessageSchema,
]) satisfies z.ZodType<Message>;

// Consumers need the stable Message output contract rather than the narrower inferred shape of
// passthrough image branches. The definition above remains compile-time checked without a cast.
export const workflowChatMessageSchema: z.ZodType<Message> = inferredWorkflowChatMessageSchema;

export const tokenMapEntrySchema = z
  .object({
    original: z.string(),
    entityClass: z.string(),
  })
  .strict();

export const tokenMapSchema = z.record(z.string(), tokenMapEntrySchema);

const ANONYMIZATION_ENTITY_CLASSES = {
  PER: 'PER',
  ORG: 'ORG',
  LOC: 'LOC',
  MISC: 'MISC',
  HOST_NAME: 'HOST_NAME',
  USER_NAME: 'USER_NAME',
  IP: 'IP',
  URL: 'URL',
  EMAIL: 'EMAIL',
  CLOUD_ACCOUNT: 'CLOUD_ACCOUNT',
  ENTITY_NAME: 'ENTITY_NAME',
  RESOURCE_NAME: 'RESOURCE_NAME',
  RESOURCE_ID: 'RESOURCE_ID',
} as const satisfies Record<AnonymizationEntityClass, AnonymizationEntityClass>;

const regexRuleSchema = z
  .object({
    type: z.literal('RegExp'),
    enabled: z.boolean(),
    pattern: z.string(),
    entityClass: z.enum(ANONYMIZATION_ENTITY_CLASSES),
  })
  .strict();

const nerRuleSchema = z
  .object({
    type: z.literal('NER'),
    enabled: z.boolean(),
    modelId: z.string().optional(),
    timeoutSeconds: z.number().positive().optional(),
    allowedEntityClasses: z.array(z.enum(['PER', 'ORG', 'LOC', 'MISC'])).optional(),
  })
  .strict();

export const anonymizationRuleSchema = z.discriminatedUnion('type', [
  regexRuleSchema,
  nerRuleSchema,
]);

export const aroundCompletionEventSchema = z
  .object({
    system: z.string().optional(),
    messages: z.array(workflowChatMessageSchema),
    sessionId: z.string().optional(),
    agentId: z.string().optional(),
  })
  .strict();

export const aiPiiInputSchema = z
  .object({
    system: z.string().optional(),
    messages: z.array(workflowChatMessageSchema),
    rules: z.array(anonymizationRuleSchema),
  })
  .strict();

export const anonymizedCompletionSchema = z
  .object({
    system: z.string().optional(),
    messages: z.array(workflowChatMessageSchema),
    tokenMap: tokenMapSchema,
  })
  .strict();

export const callSiteProceedInputSchema = z
  .object({
    system: z.string().optional(),
    messages: z.array(workflowChatMessageSchema),
    tokenMap: tokenMapSchema.optional(),
    restoreStreamingContent: z.boolean().optional(),
    restoreToolCallArguments: z.boolean().optional(),
    dryRun: z.boolean().optional(),
  })
  .strict();
export const callSiteProceedOutputSchema = z.object({ rawContent: z.string() }).strict();

export const piiRestoreInputSchema = z
  .object({ rawContent: z.string(), tokenMap: tokenMapSchema })
  .strict();
export const piiRestoreOutputSchema = z.object({ content: z.string() }).strict();

const emptyConfigSchema = z.object({}).strict();

export const aroundCompletionTriggerDefinition: CommonTriggerDefinition<
  typeof aroundCompletionEventSchema
> = {
  id: INFERENCE_AROUND_COMPLETION_TRIGGER_ID,
  eventSchema: aroundCompletionEventSchema,
  title: i18n.translate('xpack.inferenceWorkflows.aroundCompletionTrigger.title', {
    defaultMessage: 'Around inference completion',
  }),
  description: i18n.translate('xpack.inferenceWorkflows.aroundCompletionTrigger.description', {
    defaultMessage: 'Runs a workflow around an inference completion call.',
  }),
  stability: 'tech_preview',
};

export const aiPiiCommonDefinition: CommonStepDefinition<
  typeof aiPiiInputSchema,
  typeof anonymizedCompletionSchema,
  typeof emptyConfigSchema
> = {
  id: AI_PII_STEP_ID,
  category: StepCategory.Ai,
  label: i18n.translate('xpack.inferenceWorkflows.aiPiiStep.label', {
    defaultMessage: 'Protect PII',
  }),
  description: i18n.translate('xpack.inferenceWorkflows.aiPiiStep.description', {
    defaultMessage: 'Detects and replaces sensitive values for the current inference call.',
  }),
  inputSchema: aiPiiInputSchema,
  outputSchema: anonymizedCompletionSchema,
  configSchema: emptyConfigSchema,
  stability: 'tech_preview',
};

export const callSiteProceedCommonDefinition: CommonStepDefinition<
  typeof callSiteProceedInputSchema,
  typeof callSiteProceedOutputSchema,
  typeof emptyConfigSchema
> = {
  id: CALL_SITE_PROCEED_STEP_ID,
  category: StepCategory.Ai,
  label: i18n.translate('xpack.inferenceWorkflows.callSiteProceedStep.label', {
    defaultMessage: 'Call inference model',
  }),
  description: i18n.translate('xpack.inferenceWorkflows.callSiteProceedStep.description', {
    defaultMessage: 'Calls the inference model once with workflow-transformed input.',
  }),
  inputSchema: callSiteProceedInputSchema,
  outputSchema: callSiteProceedOutputSchema,
  configSchema: emptyConfigSchema,
  stability: 'tech_preview',
};

export const piiRestoreCommonDefinition: CommonStepDefinition<
  typeof piiRestoreInputSchema,
  typeof piiRestoreOutputSchema,
  typeof emptyConfigSchema
> = {
  id: TRANSFORM_PII_RESTORE_STEP_ID,
  category: StepCategory.Ai,
  label: i18n.translate('xpack.inferenceWorkflows.piiRestoreStep.label', {
    defaultMessage: 'Restore PII',
  }),
  description: i18n.translate('xpack.inferenceWorkflows.piiRestoreStep.description', {
    defaultMessage: 'Restores protected values in the final inference response.',
  }),
  inputSchema: piiRestoreInputSchema,
  outputSchema: piiRestoreOutputSchema,
  configSchema: emptyConfigSchema,
  stability: 'tech_preview',
};

export type TokenMap = z.infer<typeof tokenMapSchema>;
export type AiPiiInput = z.infer<typeof aiPiiInputSchema>;
export type AnonymizedCompletion = z.infer<typeof anonymizedCompletionSchema>;
