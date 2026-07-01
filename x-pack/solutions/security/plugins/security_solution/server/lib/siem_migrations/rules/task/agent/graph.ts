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
import { getMatchPrebuiltRuleNode } from './nodes/match_prebuilt_rule';
import { migrateRuleConfigSchema, migrateRuleState } from './state';
import { getTranslateRuleGraph } from './sub_graphs/translate_rule';
import type { MigrateRuleConfig, MigrateRuleGraphParams, MigrateRuleState } from './types';
import { getSourceRuleToNaturalLanguageNode } from './nodes/source_rule_to_natural_language/source_rule_to_natural_language';

export function getRuleMigrationAgent({
  model,
  esqlKnowledgeBase,
  ruleMigrationsRetriever,
  logger,
  telemetryClient,
  tools,
}: MigrateRuleGraphParams) {
  const matchPrebuiltRuleNode = getMatchPrebuiltRuleNode({
    model,
    logger,
    ruleMigrationsRetriever,
    telemetryClient,
  });

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
  graph.name = 'Rule Migration Graph'; // Customizes the name displayed in LangSmith
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
