/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  agentBuilderDefaultAgentId,
  isConversationCreatedEvent,
  isConversationUpdatedEvent,
  isRoundCompleteEvent,
  AgentExecutionMode,
} from '@kbn/agent-builder-common';
import { createServerStepDefinition } from '@kbn/workflows-extensions/server';
import { firstValueFrom, tap, toArray } from 'rxjs';
import type { ServiceManager } from '../services';
import {
  CONNECTOR_OR_INFERENCE_ID_CONFLICT_MESSAGE_WORKFLOW,
  resolveConnectorOrInferenceId,
} from '../../common/resolve_connector_or_inference_id';
import { runAgentStepCommonDefinition } from '../../common/step_types/run_agent_step';

/**
 * Server step definition for the "ai.agent" step.
 * This step executes an agentBuilder agent using the execution service.
 */
export const getRunAgentStepDefinition = (serviceManager: ServiceManager) => {
  return createServerStepDefinition({
    ...runAgentStepCommonDefinition,
    handler: async (context) => {
      // Accumulate token usage outside the try/catch so partial counts are
      // preserved even if the event stream errors mid-execution.
      const usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

      try {
        const { schema, message, conversation_id: conversationId, attachments } = context.input;

        const {
          'agent-id': agentId,
          'connector-id': connectorIdRaw,
          'inference-id': inferenceIdRaw,
          'create-conversation': createConversation,
          'plugin-id': pluginId,
          'aggregate-by': aggregateBy,
        } = context.config;

        context.logger.debug('ai.agent step started');
        const request = context.contextManager.getFakeRequest();
        if (!request) {
          throw new Error('No request available in workflow context');
        }

        const effectiveAgentId = (agentId as string | undefined) || agentBuilderDefaultAgentId;
        const effectiveConnectorId = resolveConnectorOrInferenceId(
          { connectorId: connectorIdRaw, inferenceId: inferenceIdRaw },
          CONNECTOR_OR_INFERENCE_ID_CONFLICT_MESSAGE_WORKFLOW
        );

        const storeConversation = createConversation || Boolean(conversationId);

        const executionService = serviceManager.internalStart?.execution;
        if (!executionService) {
          throw new Error('execution service is not available');
        }

        context.logger.debug('Executing ai.agent step', {
          agentId: effectiveAgentId,
        });

        const { events$ } = await executionService.executeAgent({
          mode: AgentExecutionMode.conversation,
          request,
          abortSignal: context.abortSignal,
          params: {
            agentId: effectiveAgentId,
            connectorId: effectiveConnectorId,
            conversationId,
            autoCreateConversationWithId: createConversation,
            storeConversation,
            structuredOutput: !!schema,
            outputSchema: schema,
            nextInput: {
              message,
              attachments,
            },
            ...(pluginId ? { telemetryMetadata: { pluginId, aggregateBy } } : {}),
          },
          // workflows already run as scheduled tasks
          useTaskManager: false,
        });

        const events = await firstValueFrom(
          events$.pipe(
            tap((event) => {
              if (isRoundCompleteEvent(event)) {
                const { model_usage: modelUsage } = event.data.round;
                if (modelUsage) {
                  usage.inputTokens += modelUsage.input_tokens;
                  usage.outputTokens += modelUsage.output_tokens;
                  usage.totalTokens += modelUsage.input_tokens + modelUsage.output_tokens;
                }
              }
            }),
            toArray()
          )
        );

        const roundEvent = events.find(isRoundCompleteEvent);
        if (!roundEvent) {
          throw new Error('No round_complete event received from execution service');
        }

        const round = roundEvent.data.round;
        const outputMessage = schema
          ? JSON.stringify(round.response.structured_output)
          : round.response.message;

        let outputConversationId: string | undefined;
        if (storeConversation) {
          const conversationEvent = events.find(
            (e) => isConversationCreatedEvent(e) || isConversationUpdatedEvent(e)
          );
          if (!conversationEvent) {
            throw new Error('No conversation_created / conversation_updated event received');
          }
          outputConversationId = conversationEvent.data.conversation_id;
        }

        return {
          output: {
            message: outputMessage,
            structured_output: round.response.structured_output,
            ...(outputConversationId && { conversation_id: outputConversationId }),
            metadata: { usage },
          },
        };
      } catch (error) {
        context.logger.error(
          'agentBuilder.runAgent step failed',
          error instanceof Error ? error : new Error(String(error))
        );
        return {
          output: { message: '', metadata: { usage } },
          error: error instanceof Error ? error : new Error(String(error)),
        };
      }
    },
  });
};
