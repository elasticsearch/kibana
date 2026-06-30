/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { StateGraph, Annotation } from '@langchain/langgraph';
import type { TimeRange } from '@kbn/agent-builder-common';
import type { BaseMessage } from '@langchain/core/messages';
import { ToolMessage } from '@langchain/core/messages';
import { messagesStateReducer } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import type { ModelProvider, ToolEventEmitter, ToolHandlerResult } from '@kbn/agent-builder-server';
import { createErrorResult } from '@kbn/agent-builder-server';
import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import { createToolCallMessage, extractTextContent, generateFakeToolCallId } from '../../langchain';
import { gatherResourceDescriptors } from '../index_explorer';
import { listSearchSources } from '../steps/list_search_sources';
import {
  createNaturalLanguageSearchTool,
  createNoMatchingResourceTool,
  createRelevanceSearchTool,
  naturalLanguageSearchToolName,
  NO_MATCHING_RESOURCE_ERROR,
} from './inner_tools';
import type { TopSnippetsConfig } from '../steps/extract_snippets';
import { getSearchDispatcherPrompt } from './prompts';
import { isIndexPattern } from './target_patterns';
import { progressMessages } from './i18n';

const StateAnnotation = Annotation.Root({
  // inputs
  nlQuery: Annotation<string>(),
  targetPattern: Annotation<string | undefined>(),
  rowLimit: Annotation<number | undefined>(),
  customInstructions: Annotation<string | undefined>(),
  /** When true, pattern targets (e.g. logs-*) search all matching indices. When false, a single index is chosen via index explorer. */
  allowPatternTarget: Annotation<boolean>(),
  timeRange: Annotation<TimeRange>(),
  // inner
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),
  // outputs
  error: Annotation<string>(),
  results: Annotation<ToolHandlerResult[]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),
});

export type StateType = typeof StateAnnotation.State;

const isPatternTargetEnabled = (state: StateType): state is StateType & { targetPattern: string } =>
  Boolean(
    state.allowPatternTarget &&
      state.targetPattern &&
      isIndexPattern(state.targetPattern) &&
      state.targetPattern !== '*'
  );

export const createSearchToolGraph = async ({
  modelProvider,
  esClient,
  logger,
  events,
  topSnippetsConfig,
  includeDatasets = false,
}: {
  modelProvider: ModelProvider;
  esClient: ElasticsearchClient;
  logger: Logger;
  events: ToolEventEmitter;
  topSnippetsConfig?: TopSnippetsConfig;
  includeDatasets?: boolean;
}) => {
  const defaultModel = await modelProvider.getDefaultModel();

  const getTools = (state: StateType) => {
    const relevanceTool = createRelevanceSearchTool({
      model: defaultModel,
      esClient,
      events,
      logger,
      topSnippetsConfig,
    });
    const nlSearchTool = createNaturalLanguageSearchTool({
      modelProvider,
      esClient,
      events,
      logger,
      rowLimit: state.rowLimit,
      customInstructions: state.customInstructions,
      timeRange: state.timeRange,
      includeDatasets,
    });
    const noMatchTool = createNoMatchingResourceTool();
    return [relevanceTool, nlSearchTool, noMatchTool];
  };

  const selectAndDispatch = async (state: StateType) => {
    events?.reportProgress(progressMessages.dispatchingSearch());

    if (isPatternTargetEnabled(state)) {
      const sources = await listSearchSources({
        pattern: state.targetPattern,
        excludeIndicesRepresentedAsDatastream: true,
        excludeIndicesRepresentedAsAlias: false,
        includeDatasets,
        esClient,
      });
      const matchedResourceCount =
        sources.indices.length +
        sources.aliases.length +
        sources.data_streams.length +
        sources.datasets.length;

      if (matchedResourceCount === 0) {
        return { error: `No resources found for pattern "${state.targetPattern}"` };
      }

      return {
        messages: [
          createToolCallMessage({
            toolCallId: generateFakeToolCallId(),
            toolName: naturalLanguageSearchToolName,
            args: {
              query: state.nlQuery,
              index: state.targetPattern,
            },
          }),
        ],
      };
    }

    const resources = await gatherResourceDescriptors({
      indexPattern: state.targetPattern ?? '*',
      includeDatasets,
      esClient,
    });

    if (resources.length === 0) {
      return { error: NO_MATCHING_RESOURCE_ERROR };
    }

    const tools = getTools(state);
    const searchModel = defaultModel.chatModel.bindTools(tools, { tool_choice: 'any' }).withConfig({
      tags: ['agent-builder-search-tool'],
    });

    const response = await searchModel.invoke(
      getSearchDispatcherPrompt({
        nlQuery: state.nlQuery,
        resources,
        customInstructions: state.customInstructions,
      })
    );

    return { messages: [response] };
  };

  const routeAfterDispatch = (state: StateType) => {
    if (state.error) {
      return '__end__';
    }
    return 'execute_tool';
  };

  const executeTool = async (state: StateType) => {
    const tools = getTools(state);
    const toolNode = new ToolNode<typeof StateAnnotation.State.messages>(tools);

    const toolNodeResult = await toolNode.invoke(state.messages);
    const toolResults = extractToolResults(toolNodeResult[toolNodeResult.length - 1]);

    return {
      messages: [...toolNodeResult],
      results: [...toolResults],
    };
  };

  const graph = new StateGraph(StateAnnotation)
    .addNode('select_and_dispatch', selectAndDispatch)
    .addNode('execute_tool', executeTool)
    .addEdge('__start__', 'select_and_dispatch')
    .addConditionalEdges('select_and_dispatch', routeAfterDispatch, {
      execute_tool: 'execute_tool',
      __end__: '__end__',
    })
    .addEdge('execute_tool', '__end__')
    .compile();

  return graph;
};

const extractToolResults = (message: BaseMessage): ToolHandlerResult[] => {
  if (!ToolMessage.isInstance(message)) {
    throw new Error(`Trying to extract tool results for non-tool result`);
  }
  if (message.artifact) {
    if (!Array.isArray(message.artifact.results)) {
      throw new Error(
        `Artifact is not a structured tool artifact. Received artifact=${JSON.stringify(
          message.artifact
        )}`
      );
    }
    return message.artifact.results as ToolHandlerResult[];
  } else {
    const content = extractTextContent(message);
    if (content.startsWith('Error:')) {
      return [createErrorResult(content)];
    } else {
      throw new Error(`No artifact attached to tool message. Content was ${message.content}`);
    }
  }
};
