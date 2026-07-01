/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { END, START, StateGraph } from '@langchain/langgraph';
import { isEmpty } from 'lodash/fp';
import type { OriginalRule } from '../../../../../../../../common/siem_migrations/model/rule_migration.gen';
import { getEcsMappingNode } from './nodes/ecs_mapping';
import { getFixQueryErrorsNode } from './nodes/fix_query_errors';
import { getInlineQueryNode } from './nodes/inline_query';
import { getRetrieveIntegrationsNode } from './nodes/retrieve_integrations';
import { getTranslateRuleNode } from './nodes/translate_rule';
import { getTranslationResultNode } from './nodes/translation_result';
import { getValidationNode } from './nodes/validation';
import { translateRuleState } from './state';
import type { TranslateRuleGraphParams, TranslateRuleState } from './types';
import { migrateRuleConfigSchema } from '../../state';

export function getTranslateRuleGraph({
  model,
  esqlKnowledgeBase,
  ruleMigrationsRetriever,
  logger,
  telemetryClient,
}: TranslateRuleGraphParams) {
  const translateRuleNode = getTranslateRuleNode({
    esqlKnowledgeBase,
    logger,
  });
  const translationResultNode = getTranslationResultNode();
  const inlineQueryNode = getInlineQueryNode({ model, logger, telemetryClient });
  const validationNode = getValidationNode({ logger });
  const fixQueryErrorsNode = getFixQueryErrorsNode({ esqlKnowledgeBase, logger });
  const retrieveIntegrationsNode = getRetrieveIntegrationsNode({
    model,
    telemetryClient,
    ruleMigrationsRetriever,
  });
  const ecsMappingNode = getEcsMappingNode({ esqlKnowledgeBase, logger });

  const translateRuleGraph = new StateGraph(translateRuleState, migrateRuleConfigSchema)
    // Nodes
    .addNode('inlineQuery', inlineQueryNode)
    .addNode('retrieveIntegrations', retrieveIntegrationsNode)
    .addNode('translateRule', translateRuleNode)
    .addNode('validation', validationNode)
    .addNode('fixQueryErrors', fixQueryErrorsNode)
    .addNode('ecsMapping', ecsMappingNode)
    .addNode('translationResult', translationResultNode)
    // Edges
    .addEdge(START, 'inlineQuery')
    .addConditionalEdges('inlineQuery', translatableRouter, [
      'retrieveIntegrations',
      'translationResult',
    ])
    .addEdge('retrieveIntegrations', 'translateRule')
    .addEdge('translateRule', 'validation')
    .addEdge('fixQueryErrors', 'validation')
    .addEdge('ecsMapping', 'validation')
    .addConditionalEdges('validation', validationRouter, [
      'fixQueryErrors',
      'ecsMapping',
      'translationResult',
    ])
    .addEdge('translationResult', END);

  const graph = translateRuleGraph.compile();
  graph.name = 'Translate Rule Graph';
  return graph;
}

const translatableRouter = (state: TranslateRuleState) => {
  if (state.original_rule.vendor === 'splunk' && !state.inline_query) {
    return 'translationResult';
  }
  if (
    (state.original_rule.vendor === 'qradar' ||
      state.original_rule.vendor === 'microsoft-sentinel') &&
    !state.nl_query
  ) {
    return 'translationResult';
  }
  return 'retrieveIntegrations';
};

const validationRouter = (state: TranslateRuleState) => {
  if (state.validation_errors.retries_left > 0 && !isEmpty(state.validation_errors?.esql_errors)) {
    return 'fixQueryErrors';
  }
  if (
    state.original_rule.vendor === 'qradar' ||
    state.original_rule.vendor === 'microsoft-sentinel'
  ) {
    return 'translationResult';
  }

  if (!state.includes_ecs_mapping) {
    return 'ecsMapping';
  }

  return 'translationResult';
};

export function getVendorRouter(vendor: OriginalRule['vendor']) {
  return function qradarConditionalEdge(state: TranslateRuleState): string {
    if (state.original_rule.vendor === vendor) {
      return `is_${vendor}`;
    }
    return `is_not_${vendor}`;
  };
}
