/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { MigrationComments } from '../../../../../../../../../../common/siem_migrations/model/common.gen';
import { getNLToESQLQuery } from '../../../../../../../common/task/agent/helpers/translate_nl_to_esql/translate_nl_to_esql';
import {
  getTranslateSplToEsql,
  TASK_DESCRIPTION,
  type GetTranslateSplToEsqlParams,
} from '../../../../../../../common/task/agent/helpers/translate_spl_to_esql';
import type { GraphNode } from '../../types';
import {
  getElasticRiskScoreFromOriginalRule,
  getElasticSeverityFromOriginalRule,
} from './severity';

export const getTranslateRuleNode = (params: GetTranslateSplToEsqlParams): GraphNode => {
  const nlToESQLQuery = getNLToESQLQuery(params);
  const translateSplToEsql = getTranslateSplToEsql(params);
  return async (state) => {
    const vendor = state.original_rule.vendor;

    const indexPatterns =
      state.integration?.data_streams?.map((dataStream) => dataStream.index_pattern).join(',') ||
      'logs-*';

    const knowledgeBase = state.integration?.knowledge_base ?? '';

    let esqlQuery: string | undefined;
    let comments: MigrationComments = [];

    if (vendor === 'qradar' || vendor === 'microsoft-sentinel') {
      params.logger.debug(
        `Translating rule "${state.original_rule.title}" using NL to ESQL for vendor: ${vendor}`
      );
      ({ esqlQuery, comments } = await nlToESQLQuery({
        query: state.nl_query,
        indexPattern: indexPatterns,
        knowledgeBase,
      }));
    } else {
      params.logger.debug(
        `Translating rule "${state.original_rule.title}" using SPL to ESQL for vendor: ${vendor}`
      );
      ({ esqlQuery, comments } = await translateSplToEsql({
        title: state.original_rule.title,
        taskDescription: TASK_DESCRIPTION.migrate_rule,
        description: state.original_rule.description,
        inlineQuery: state.inline_query,
        indexPattern: indexPatterns,
        knowledgeBase,
      }));
    }

    if (!esqlQuery) {
      return { comments };
    }

    return {
      elastic_rule: {
        query: esqlQuery,
        query_language: 'esql',
        risk_score: await getElasticRiskScoreFromOriginalRule(state.original_rule),
        severity: await getElasticSeverityFromOriginalRule(state.original_rule),
        ...(state.integration?.id && { integration_ids: [state.integration.id] }),
      },
      comments,
    };
  };
};
