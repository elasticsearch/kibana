/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { z } from '@kbn/zod/v4';
import { StateGraph, Annotation } from '@langchain/langgraph';
import type { ScopedModel, ToolEventEmitter } from '@kbn/agent-builder-server';
import type { Logger } from '@kbn/logging';
import { type IScopedClusterClient } from '@kbn/core-elasticsearch-server';
import type { SupportedChartType } from '@kbn/agent-builder-common/tools/tool_result';
import { generateEsql } from '@kbn/agent-builder-genai-utils';
import { extractTextFromMessage } from '../utils/extract_text_from_message';
import { chartTypeRegistry } from './chart_type_registry';
import type { VisualizationConfig } from './chart_type_registry';
import {
  GENERATE_ESQL_NODE,
  GENERATE_CONFIG_NODE,
  VALIDATE_CONFIG_NODE,
  GENERATE_TIME_RANGE_NODE,
  MAX_RETRY_ATTEMPTS,
  type Action,
  type GenerateEsqlAction,
  type GenerateConfigAction,
  type ValidateConfigAction,
  type GenerateTimeRangeAction,
  isGenerateConfigAction,
  isValidateConfigAction,
} from './actions_lens';
import { createGenerateConfigPrompt, esqlAdditionalInstructions } from './prompts';

// Regex to extract JSON from markdown code blocks
const INLINE_JSON_REGEX = /```(?:json)?\s*([\s\S]*?)\s*```/gm;

const validateConfigForChartType = (
  chartType: SupportedChartType,
  config: unknown
): VisualizationConfig => chartTypeRegistry[chartType].schema.validate(config);

interface EsqlDataSourceCarrier {
  data_source?: { type?: string; query?: string };
}

/**
 * Returns the objects that carry a `data_source` for this config shape:
 * XY-ESQL configs keep one `data_source` per layer; every other ESQL chart
 * (metric, gauge, tagcloud, ...) carries it on the config itself. Used both to
 * read existing queries (edits) and to inject the validated query (generation).
 */
const getEsqlDataSourceCarriers = (config: unknown): EsqlDataSourceCarrier[] => {
  if (!config || typeof config !== 'object') return [];
  const { layers } = config as { layers?: unknown };
  return Array.isArray(layers)
    ? (layers as EsqlDataSourceCarrier[])
    : [config as EsqlDataSourceCarrier];
};

/**
 * Helper to extract ESQL queries from a visualization config.
 * Handles both single-dataset configs (metric, gauge, tagcloud) and layers-based configs (XY).
 * For XY charts with multiple layers, returns all unique ESQL queries.
 */
function getExistingEsqlQueries(config: VisualizationConfig | null): string[] {
  if (!config) return [];

  const queries: string[] = [];
  for (const carrier of getEsqlDataSourceCarriers(config)) {
    const dataSource = carrier.data_source;
    if (dataSource?.type === 'esql' && dataSource.query && !queries.includes(dataSource.query)) {
      queries.push(dataSource.query);
    }
  }

  return queries;
}

const VisualizationStateAnnotation = Annotation.Root({
  // inputs
  nlQuery: Annotation<string>(),
  index: Annotation<string | undefined>(),
  chartType: Annotation<SupportedChartType>(),
  schema: Annotation<object>(),
  existingConfig: Annotation<string | undefined>(),
  parsedExistingConfig: Annotation<VisualizationConfig | null>(),
  // internal
  esqlQuery: Annotation<string>(),
  currentAttempt: Annotation<number>({ reducer: (_, newValue) => newValue, default: () => 0 }),
  actions: Annotation<Action[]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),
  // outputs
  validatedConfig: Annotation<VisualizationConfig | null>(),
  timeRange: Annotation<{ from: string; to: string } | null>(),
  error: Annotation<string | null>(),
});

type VisualizationState = typeof VisualizationStateAnnotation.State;

export const createVisualizationGraph = (
  model: ScopedModel,
  logger: Logger,
  events: ToolEventEmitter,
  esClient: IScopedClusterClient,
  includeTimeRange = true,
  additionalChartConfigInstructions?: string
) => {
  // Node: Generate ES|QL query
  const generateESQLNode = async (state: VisualizationState) => {
    logger.debug('Generating ES|QL query for visualization');

    let action: GenerateEsqlAction;
    try {
      const existingQueries = getExistingEsqlQueries(state.parsedExistingConfig);

      let nlQueryWithContext = state.nlQuery;
      if (existingQueries.length > 0) {
        if (existingQueries.length === 1) {
          nlQueryWithContext = `Existing esql query to modify: "${existingQueries[0]}"\n\nUser query: ${state.nlQuery}`;
        } else {
          const queriesContext = existingQueries.map((q, i) => `Layer ${i + 1}: "${q}"`).join('\n');
          nlQueryWithContext = `Existing esql queries from multiple layers:\n${queriesContext}\n\nUser query: ${state.nlQuery}`;
        }
      }

      const generateEsqlResponse = await generateEsql({
        nlQuery: nlQueryWithContext,
        index: state.index,
        model,
        events,
        logger,
        esClient: esClient.asCurrentUser,
        additionalInstructions: esqlAdditionalInstructions,
      });

      if (!generateEsqlResponse.query) {
        action = {
          type: 'generate_esql',
          success: false,
          error: 'No queries generated',
        };
      } else {
        const esqlQuery = generateEsqlResponse.query;
        logger.debug(`Generated ES|QL query: ${esqlQuery}`);
        action = {
          type: 'generate_esql',
          success: true,
          query: esqlQuery,
        };
      }
    } catch (error) {
      logger.error(`Failed to generate ES|QL query: ${error.message}`);
      action = {
        type: 'generate_esql',
        success: false,
        error: error.message,
      };
    }

    return {
      actions: [action],
    };
  };

  // Node: Generate configuration
  const generateConfigNode = async (state: VisualizationState) => {
    const attempt = state.currentAttempt + 1;
    logger.debug(
      `Generating visualization configuration (attempt ${attempt}/${MAX_RETRY_ATTEMPTS})`
    );

    // Extract ES|QL query from previous actions
    const lastGenerateEsqlAction = state.actions
      .filter((action): action is GenerateEsqlAction => action.type === 'generate_esql')
      .filter((action) => action.success && action.query)
      .pop();
    const esqlQuery = lastGenerateEsqlAction?.query || state.esqlQuery;

    // Build context from previous actions for retry attempts
    const previousActionContext = state.actions
      .filter((action) => isGenerateConfigAction(action) || isValidateConfigAction(action))
      .map((action) => {
        if (isGenerateConfigAction(action)) {
          return `Previous generation attempt ${action.attempt}: ${
            action.success ? 'SUCCESS' : `FAILED - ${action.error}`
          }`;
        }
        if (isValidateConfigAction(action)) {
          return `Validation attempt ${action.attempt}: ${
            action.success ? 'SUCCESS' : `FAILED - ${action.error}`
          }`;
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');

    const additionalContext = previousActionContext
      ? `Previous attempts:\n${previousActionContext}\n\nPlease fix the issues mentioned above.`
      : undefined;

    const prompt = createGenerateConfigPrompt({
      nlQuery: state.nlQuery,
      esqlQuery,
      chartType: state.chartType,
      schema: state.schema,
      existingConfig: state.existingConfig,
      additionalChartConfigInstructions,
      additionalContext,
    });

    let action: GenerateConfigAction;
    try {
      // Invoke model without schema validation
      const response = await model.chatModel.invoke(prompt);
      const responseText = extractTextFromMessage(response);

      // Try to extract JSON from markdown code blocks
      const jsonMatches = Array.from(responseText.matchAll(INLINE_JSON_REGEX));
      let configResponse: any;

      if (jsonMatches.length > 0) {
        const jsonText = jsonMatches[0][1].trim();
        configResponse = JSON.parse(jsonText);
      } else {
        configResponse = JSON.parse(responseText);
      }

      // Verify it's a valid object
      if (!configResponse || typeof configResponse !== 'object') {
        throw new Error('Response is not a valid JSON object');
      }

      // Pin the validated ES|QL query before config validation. ES|QL generation owns the query;
      // config generation only binds columns from it.
      if (esqlQuery) {
        for (const carrier of getEsqlDataSourceCarriers(configResponse)) {
          carrier.data_source = { type: 'esql', query: esqlQuery };
        }
      }

      action = {
        type: 'generate_config',
        success: true,
        config: configResponse,
        attempt,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn(
        `Config generation failed (attempt ${attempt}/${MAX_RETRY_ATTEMPTS}): ${errorMessage}`
      );
      logger.debug(`Full error details: ${JSON.stringify(error, null, 2)}`);

      action = {
        type: 'generate_config',
        success: false,
        attempt,
        error: errorMessage,
      };
    }

    return {
      currentAttempt: attempt,
      actions: [action],
    };
  };

  // Node: Validate configuration
  const validateConfigNode = async (state: VisualizationState) => {
    const attempt = state.currentAttempt;
    logger.debug(`Validating configuration (attempt ${attempt}/${MAX_RETRY_ATTEMPTS})`);

    // Get the last generate_config action
    const lastGenerateAction = [...state.actions].reverse().find(isGenerateConfigAction);

    if (!lastGenerateAction || !lastGenerateAction.config) {
      const action: ValidateConfigAction = {
        type: 'validate_config',
        success: false,
        attempt,
        error: 'No configuration found to validate',
      };
      return {
        actions: [action],
      };
    }

    let action: ValidateConfigAction;
    try {
      const config = lastGenerateAction.config;

      // Check if the generation itself failed
      if ('error' in config && typeof config.error === 'string') {
        logger.warn(`Configuration generation reported error: ${config.error}`);
        action = {
          type: 'validate_config',
          success: false,
          attempt,
          error: config.error,
        };
      } else {
        // Validate configuration based on chart type
        const validatedConfig = validateConfigForChartType(state.chartType, config);

        logger.debug('Configuration validated successfully');
        action = {
          type: 'validate_config',
          success: true,
          config: validatedConfig,
          attempt,
        };
      }
    } catch (error) {
      const errorMessage = error.message;
      logger.warn(`Configuration validation failed: ${errorMessage}`);

      action = {
        type: 'validate_config',
        success: false,
        attempt,
        error: errorMessage,
      };
    }

    return {
      actions: [action],
    };
  };

  // Node: Generate time range - ask the LLM to determine the appropriate time range
  const generateTimeRangeNode = async (state: VisualizationState) => {
    logger.debug('Generating time range for visualization');

    const lastGenerateEsqlAction = [...state.actions]
      .reverse()
      .find((action): action is GenerateEsqlAction => action.type === 'generate_esql');
    const esqlQuery = lastGenerateEsqlAction?.query || state.esqlQuery;

    let action: GenerateTimeRangeAction;
    try {
      const timeRangeModel = model.chatModel.withStructuredOutput(
        z.object({
          from: z
            .string()
            .describe(
              'Start of the time range in Elasticsearch date math format (e.g., "now-24h", "now-7d", "now-1M")'
            ),
          to: z
            .string()
            .describe('End of the time range in Elasticsearch date math format (e.g., "now")'),
        }),
        { name: 'determine_time_range' }
      );

      const result = await timeRangeModel.invoke([
        [
          'system',
          `You are an expert at determining appropriate time ranges for Elasticsearch visualizations.
Given a user's natural language query and the ES|QL query that was generated, determine the most appropriate time range for the visualization.

Use Elasticsearch date math expressions for both "from" and "to" values:
- "now-15m" for last 15 minutes
- "now-1h" for last hour
- "now-24h" for last 24 hours
- "now-7d" for last 7 days
- "now-30d" for last 30 days
- "now-1y" for last year
- "now" for the current time

The "to" value should almost always be "now" unless the user specifies a specific end time.
Choose a "from" value that best matches the intent of the query. If unsure, default to "now-24h".`,
        ],
        [
          'human',
          `User query: ${state.nlQuery}

ES|QL query: ${esqlQuery}

What is the most appropriate time range for this visualization?`,
        ],
      ]);

      logger.debug(`Generated time range: ${result.from} to ${result.to}`);
      action = {
        type: 'generate_time_range',
        success: true,
        timeRange: { from: result.from, to: result.to },
      };
    } catch (error) {
      logger.warn(`Failed to generate time range, defaulting to now-24h: ${error.message}`);
      action = {
        type: 'generate_time_range',
        success: false,
        timeRange: { from: 'now-24h', to: 'now' },
        error: error.message,
      };
    }

    return {
      actions: [action],
    };
  };

  // Node: Finalize - extract outputs from actions
  const finalizeNode = async (state: VisualizationState) => {
    const lastValidateAction = [...state.actions].reverse().find(isValidateConfigAction);
    const lastGenerateEsqlAction = [...state.actions]
      .reverse()
      .find((action): action is GenerateEsqlAction => action.type === 'generate_esql');
    const lastTimeRangeAction = [...state.actions]
      .reverse()
      .find((action): action is GenerateTimeRangeAction => action.type === 'generate_time_range');

    return {
      validatedConfig: lastValidateAction?.success ? lastValidateAction.config : null,
      error: lastValidateAction?.success ? null : lastValidateAction?.error || null,
      esqlQuery: lastGenerateEsqlAction?.query || state.esqlQuery,
      timeRange: lastTimeRangeAction?.timeRange ?? null,
    };
  };

  // Router: Check if we should retry or end after validation
  const shouldRetryRouter = (state: VisualizationState): string => {
    const lastValidateAction = [...state.actions].reverse().find(isValidateConfigAction);

    // Success case - optionally generate a time range before finalizing
    if (lastValidateAction?.success) {
      if (includeTimeRange) {
        logger.debug('Configuration validated successfully, generating time range');
        return GENERATE_TIME_RANGE_NODE;
      }

      logger.debug('Configuration validated successfully, skipping time range generation');
      return 'finalize';
    }

    // Failure case - max attempts reached
    if (state.currentAttempt >= MAX_RETRY_ATTEMPTS) {
      logger.warn(`Max retry attempts (${MAX_RETRY_ATTEMPTS}) reached, finalizing`);
      return 'finalize';
    }

    // Retry case - loop back to generate with previous actions providing context
    logger.debug(
      `Retry ${state.currentAttempt}/${MAX_RETRY_ATTEMPTS}, generating again with action context`
    );
    return GENERATE_CONFIG_NODE;
  };

  // Router: Use an explicit ES|QL query when provided, otherwise generate one.
  // Existing config is still valuable because generateESQLNode includes the
  // prior query as context when regenerating edits.
  const shouldGenerateESQLRouter = (state: VisualizationState): string => {
    if (state.esqlQuery) {
      logger.debug('Using provided ES|QL query');
      return GENERATE_CONFIG_NODE;
    }

    logger.debug('No ES|QL query provided, generating ES|QL query');
    return GENERATE_ESQL_NODE;
  };

  // Build and compile the graph
  const graph = new StateGraph(VisualizationStateAnnotation)
    // Add nodes
    .addNode(GENERATE_ESQL_NODE, generateESQLNode)
    .addNode(GENERATE_CONFIG_NODE, generateConfigNode)
    .addNode(VALIDATE_CONFIG_NODE, validateConfigNode)
    .addNode(GENERATE_TIME_RANGE_NODE, generateTimeRangeNode)
    .addNode('finalize', finalizeNode)
    // Add edges
    .addConditionalEdges('__start__', shouldGenerateESQLRouter, {
      [GENERATE_CONFIG_NODE]: GENERATE_CONFIG_NODE,
      [GENERATE_ESQL_NODE]: GENERATE_ESQL_NODE,
    })
    .addEdge(GENERATE_ESQL_NODE, GENERATE_CONFIG_NODE)
    .addEdge(GENERATE_CONFIG_NODE, VALIDATE_CONFIG_NODE)
    .addConditionalEdges(VALIDATE_CONFIG_NODE, shouldRetryRouter, {
      [GENERATE_CONFIG_NODE]: GENERATE_CONFIG_NODE,
      [GENERATE_TIME_RANGE_NODE]: GENERATE_TIME_RANGE_NODE,
      finalize: 'finalize',
    })
    .addEdge(GENERATE_TIME_RANGE_NODE, 'finalize')
    .addEdge('finalize', '__end__')
    .compile();

  return graph;
};
