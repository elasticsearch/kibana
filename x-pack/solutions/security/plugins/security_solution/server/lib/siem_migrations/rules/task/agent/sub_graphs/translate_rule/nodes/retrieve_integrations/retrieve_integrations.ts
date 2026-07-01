/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { JsonOutputParser } from '@langchain/core/output_parsers';
import type { RuleMigrationsRetriever } from '../../../../../retrievers';
import type { RuleMigrationTelemetryClient } from '../../../../../rule_migrations_telemetry_client';
import {
  cleanMarkdown,
  generateAssistantComment,
} from '../../../../../../../common/task/util/comments';
import type { GraphNode } from '../../types';
import { MATCH_INTEGRATION_PROMPT } from './prompts';
import type { MigrateRuleGraphParams } from '../../../../types';

interface GetRetrieveIntegrationsNodeParams {
  model: MigrateRuleGraphParams['model'];
  telemetryClient: RuleMigrationTelemetryClient;
  ruleMigrationsRetriever: RuleMigrationsRetriever;
}

interface GetMatchedIntegrationResponse {
  id: string;
  summary: string;
}

export const getRetrieveIntegrationsNode = ({
  model,
  ruleMigrationsRetriever,
  telemetryClient,
}: GetRetrieveIntegrationsNodeParams): GraphNode => {
  return async (state) => {
    const query = state.semantic_query;
    const integrations = await ruleMigrationsRetriever.integrations.search(query);
    if (integrations.length === 0) {
      telemetryClient.reportIntegrationsMatch({
        preFilterIntegrations: [],
      });
      const comment = '## Integration Matching Summary\n\nNo related integration found.';
      return {
        comments: [generateAssistantComment(comment)],
      };
    }

    const outputParser = new JsonOutputParser();
    const mostRelevantIntegration = MATCH_INTEGRATION_PROMPT.pipe(model).pipe(outputParser);

    const integrationsInfo = integrations.map((integration) => ({
      id: integration.id,
      title: integration.title,
      description: integration.description,
    }));
    const ruleToMatch = {
      title: state.original_rule.title,
      description: `${state.original_rule.description} ${
        state.nl_query ? `\n Additional context: ${state.nl_query}` : ''
      }`,
    };

    /*
     * Takes the most relevant integration from the array of integration(s) returned by the semantic query, returns either the most relevant or none.
     */
    const integrationsJson = JSON.stringify(integrationsInfo, null, 2);
    const response = (await mostRelevantIntegration.invoke({
      integrations: integrationsJson,
      rule: JSON.stringify(ruleToMatch, null, 2),
    })) as GetMatchedIntegrationResponse;
    const comments = response.summary
      ? [generateAssistantComment(cleanMarkdown(response.summary))]
      : undefined;

    if (response.id) {
      const matchedIntegration = integrations.find((r) => r.id === response.id);
      telemetryClient.reportIntegrationsMatch({
        preFilterIntegrations: integrations,
        postFilterIntegration: matchedIntegration,
      });
      if (matchedIntegration) {
        return { integration: matchedIntegration, comments };
      }
    }
    return { comments };
  };
};
