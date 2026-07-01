/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import {
  getInlineSplQuery,
  type GetInlineSplQueryParams,
  getSPLQueryKeywords,
  SPL_KEYWORDS,
} from '../../../../../../../common/task/agent/helpers/inline_spl_query';
import { OriginalRuleVendorEnum } from '../../../../../../../../../../common/siem_migrations/model/rule_migration.gen';
import type { GraphNode } from '../../types';
import type { RuleMigrationTelemetryClient } from '../../../../../rule_migrations_telemetry_client';

interface InlineQueryNodeParams extends GetInlineSplQueryParams {
  telemetryClient: RuleMigrationTelemetryClient;
}

export const getInlineQueryNode = (params: InlineQueryNodeParams): GraphNode => {
  const { telemetryClient, ...inlineParams } = params;
  const inlineSplQuery = getInlineSplQuery(inlineParams);
  return async (state) => {
    if (state.original_rule.vendor !== OriginalRuleVendorEnum.splunk) {
      // For non-Splunk vendors (QRadar, Sentinel), inline query substitution is not applicable.
      // The nl_query from the sourceRuleToNaturalLanguage node is used instead.
      return {
        inline_query: undefined,
      };
    }
    const { inlineQuery, isUnsupported, comments } = await inlineSplQuery({
      query: state.original_rule.query,
      resources: state.resources,
    });
    if (isUnsupported) {
      // Graph conditional edge detects undefined inline_query as unsupported query
      return { inline_query: undefined, comments };
    }
    const finalInlineQuery = inlineQuery ?? state.original_rule.query;
    if (finalInlineQuery) {
      telemetryClient.reportSourceQueryKeywords({
        type: 'rules',
        keywords: getSPLQueryKeywords(finalInlineQuery, SPL_KEYWORDS),
      });
    }
    return {
      inline_query: finalInlineQuery,
      comments,
    };
  };
};
