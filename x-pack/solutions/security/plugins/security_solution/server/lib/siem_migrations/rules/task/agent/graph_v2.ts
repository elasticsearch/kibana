/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { END, START, StateGraph } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { AIMessage } from '@langchain/core/messages';
import { getCreateSemanticQueryNode } from './nodes/create_semantic_query';
import { migrateRuleConfigSchema, migrateRuleState } from './state';
import { getTranslateRuleGraph } from './sub_graphs/translate_rule';
import { getMatchPrebuiltRuleGraph } from './sub_graphs/match_prebuilt_rule';
import type {
  GraphNode,
  MigrateRuleConfig,
  MigrateRuleGraphParams,
  MigrateRuleState,
} from './types';
import { getSourceRuleToNaturalLanguageNode } from './nodes/source_rule_to_natural_language/source_rule_to_natural_language';

/**
 * v2 agent (behind the `ruleMigrationGraphv2` experimental feature): pre-built rule matching runs
 * through the dedicated `matchPrebuiltRule` subgraph (security-team#18589) instead of the v1
 * one-shot node. The subgraph is a single model-driven node: the model itself decides when to
 * search (via a bound `searchPrebuiltRules` tool) and crafts its own pre-built-rule-specific
 * query, so it does not consume the parent's `semantic_query`.
 */
export function getRuleMigrationAgentV2({
  model,
  esqlKnowledgeBase,
  ruleMigrationsRetriever,
  logger,
  telemetryClient,
  tools,
}: MigrateRuleGraphParams) {
  const matchPrebuiltRuleSubGraph = getMatchPrebuiltRuleGraph({
    model,
    searchPrebuiltRulesTool: tools.searchPrebuiltRules,
    telemetryClient,
  });

  const matchPrebuiltRuleNode: GraphNode = async (state) => {
    const result = await matchPrebuiltRuleSubGraph.invoke({
      original_rule: state.original_rule,
      nl_query: state.nl_query, // splunk has no nl_query
    });

    return {
      ...(result.elastic_rule?.prebuilt_rule_id ? { elastic_rule: result.elastic_rule } : {}),
      ...(result.translation_result ? { translation_result: result.translation_result } : {}),
      ...(result.comments?.length ? { comments: result.comments } : {}),
    };
  };

  const resolveDepsTools = [tools.getRulesByName, tools.getResourceByType];
  const resolveDepsToolNode = new ToolNode(resolveDepsTools);

  const translationSubGraph = getTranslateRuleGraph({
    model,
    esqlKnowledgeBase,
    ruleMigrationsRetriever,
    telemetryClient,
    logger,
  });
  const sourceRuleToNaturalLanguageNode = getSourceRuleToNaturalLanguageNode({
    model: model.bindTools(resolveDepsTools),
  });
  // Retained for the translation subgraph's integration retrieval (until security-team#18587);
  // the pre-built match subgraph generates its own queries and does not use this node's output.
  const createSemanticQueryNode = getCreateSemanticQueryNode({ model });

  const siemMigrationAgentGraph = new StateGraph(migrateRuleState, migrateRuleConfigSchema)
    // Nodes
    .addNode('sourceRuleToNaturalLanguage', sourceRuleToNaturalLanguageNode)
    .addNode('createSemanticQuery', createSemanticQueryNode)
    .addNode('resolveDepsTools', resolveDepsToolNode)
    .addNode('matchPrebuiltRule', matchPrebuiltRuleNode)
    .addNode('translationSubGraph', translationSubGraph)
    // Edges
    .addConditionalEdges(START, vendorNeedsInterpretation, {
      to_natural_language: 'sourceRuleToNaturalLanguage',
      not_to_natural_language: 'createSemanticQuery',
    })
    .addConditionalEdges('sourceRuleToNaturalLanguage', toolRouter, {
      hasToolCalls: 'resolveDepsTools',
      noToolCalls: 'createSemanticQuery',
    })
    .addEdge('resolveDepsTools', 'sourceRuleToNaturalLanguage')
    .addConditionalEdges('createSemanticQuery', skipPrebuiltRuleConditional, [
      'matchPrebuiltRule',
      'translationSubGraph',
    ])
    .addConditionalEdges('matchPrebuiltRule', matchedPrebuiltRuleConditional, [
      'translationSubGraph',
      END,
    ])
    .addEdge('translationSubGraph', END);

  const graph = siemMigrationAgentGraph.compile();
  graph.name = 'Rule Migration Graph V2'; // Customizes the name displayed in LangSmith
  return graph;
}

function vendorNeedsInterpretation(state: MigrateRuleState): string {
  const { vendor } = state.original_rule;
  return vendor === 'qradar' || vendor === 'microsoft-sentinel'
    ? 'to_natural_language'
    : 'not_to_natural_language';
}

const skipPrebuiltRuleConditional = (_state: MigrateRuleState, config: MigrateRuleConfig) => {
  if (config.configurable?.skipPrebuiltRulesMatching) {
    return 'translationSubGraph';
  }
  return 'matchPrebuiltRule';
};

const matchedPrebuiltRuleConditional = (state: MigrateRuleState) => {
  if (state.elastic_rule?.prebuilt_rule_id) {
    return END;
  }
  return 'translationSubGraph';
};

export function toolRouter(state: MigrateRuleState): string {
  const messages = state.messages;
  const lastMessage = messages.at(-1);
  return AIMessage.isInstance(lastMessage) && lastMessage?.tool_calls?.length
    ? 'hasToolCalls'
    : 'noToolCalls';
}
