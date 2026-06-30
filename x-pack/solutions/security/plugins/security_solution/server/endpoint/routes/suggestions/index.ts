/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Observable } from 'rxjs';
import { firstValueFrom } from 'rxjs';
import type { RequestHandler } from '@kbn/core/server';
import { getRequestAbortedSignal } from '@kbn/data-plugin/server';
import type { ConfigSchema } from '@kbn/kql/server/config';
import { termsEnumSuggestions } from '@kbn/kql/server/autocomplete/terms_enum';
import { termsAggSuggestions } from '@kbn/kql/server/autocomplete/terms_agg';
import type { QueryDslQueryContainer } from '@elastic/elasticsearch/lib/api/types';
import { PACKAGE_POLICY_SAVED_OBJECT_TYPE } from '@kbn/fleet-plugin/common';
import type {
  EndpointSuggestionsParams,
  EndpointSuggestionsBody,
} from '../../../../common/api/endpoint';
import { EndpointSuggestionsSchema } from '../../../../common/api/endpoint';
import type {
  SecuritySolutionPluginRouter,
  SecuritySolutionRequestHandlerContext,
} from '../../../types';
import type { EndpointAppContext } from '../../types';
import {
  eventsIndexPattern,
  DEVICE_EVENTS_INDEX_PATTERN,
  SUGGESTIONS_INTERNAL_ROUTE,
  METADATA_UNITED_INDEX,
  alertsIndexPattern,
} from '../../../../common/endpoint/constants';
import { withEndpointAuthz } from '../with_endpoint_authz';
import { errorHandler } from '../error_handler';
import { buildIndexNameWithNamespace } from '../../../../common/endpoint/utils/index_name_utilities';
import { buildBaseEndpointMetadataFilter } from '../../../../common/endpoint/utils/endpoint_metadata_filter';
import { hasConnectedRemoteClusters, prefixIndexPatternsWithCcs } from '../../utils/ccs_utils';

export function registerEndpointSuggestionsRoutes(
  router: SecuritySolutionPluginRouter,
  config$: Observable<ConfigSchema>,
  endpointContext: EndpointAppContext
) {
  router.versioned
    .post({
      access: 'internal',
      path: SUGGESTIONS_INTERNAL_ROUTE,
      security: {
        authz: {
          requiredPrivileges: ['securitySolution'],
        },
      },
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: EndpointSuggestionsSchema,
        },
      },
      withEndpointAuthz(
        {
          any: [
            'canWriteEventFilters',
            'canWriteTrustedApplications',
            'canWriteTrustedDevices',
            'canWriteEndpointExceptions',
          ],
        },
        endpointContext.logFactory.get('endpointSuggestions'),
        getEndpointSuggestionsRequestHandler(config$, endpointContext)
      )
    );
}

const INDEX_PATTERNS: Record<EndpointSuggestionsParams['suggestion_type'], string> = {
  endpointExceptions: alertsIndexPattern,
  endpoints: METADATA_UNITED_INDEX,
  eventFilters: eventsIndexPattern,
  trustedApps: eventsIndexPattern,
  trustedDevices: DEVICE_EVENTS_INDEX_PATTERN,
};

export const getEndpointSuggestionsRequestHandler = (
  config$: Observable<ConfigSchema>,
  endpointContext: EndpointAppContext
): RequestHandler<
  EndpointSuggestionsParams,
  never,
  EndpointSuggestionsBody,
  SecuritySolutionRequestHandlerContext
> => {
  return async (context, request, response) => {
    const logger = endpointContext.logFactory.get('suggestions');
    const isTrustedAppsAdvancedModeFFEnabled =
      endpointContext.experimentalFeatures.trustedAppsAdvancedMode;
    const isEndpointExceptionsUnderManagementFFEnabled =
      endpointContext.experimentalFeatures.endpointExceptionsMovedUnderManagement;
    const { field: fieldName, query, filters, fieldMeta } = request.body;
    let index = '';
    try {
      const config = await firstValueFrom(config$);
      const { savedObjects, elasticsearch } = await context.core;
      const ccsEnabled = await hasConnectedRemoteClusters(
        elasticsearch.client.asInternalUser,
        endpointContext.experimentalFeatures.defendRemoteOutputCcs
      );
      const securitySolutionContext = await context.securitySolution;
      const spaceId = securitySolutionContext.getSpaceId();
      let fullFilters: QueryDslQueryContainer[] = filters
        ? [...(filters as QueryDslQueryContainer[])]
        : [];
      let suggestionMethod: typeof termsEnumSuggestions | typeof termsAggSuggestions =
        termsEnumSuggestions;

      const suggestionType = request.params.suggestion_type;

      if (
        suggestionType === 'eventFilters' ||
        (isTrustedAppsAdvancedModeFFEnabled && suggestionType === 'trustedApps') ||
        suggestionType === 'trustedDevices' ||
        (isEndpointExceptionsUnderManagementFFEnabled && suggestionType === 'endpointExceptions')
      ) {
        const baseIndexPattern = INDEX_PATTERNS[suggestionType];

        logger.debug('Using space-aware index pattern');

        const integrationNamespaces = await endpointContext.service
          .getInternalFleetServices(spaceId)
          .getIntegrationNamespaces(['endpoint']);

        const namespaces = integrationNamespaces.endpoint;
        if (!namespaces || !namespaces.length) {
          logger.error('Failed to retrieve current space index patterns');
          return response.badRequest({
            body: 'Failed to retrieve current space index patterns',
          });
        }

        const indexPattern = prefixIndexPatternsWithCcs(
          namespaces
            .map((namespace) =>
              buildIndexNameWithNamespace(baseIndexPattern, namespace, { preserveWildcard: true })
            )
            .join(','),
          ccsEnabled
        );

        if (indexPattern) {
          logger.debug(`Index pattern to be used: ${indexPattern}`);
          index = indexPattern;
        } else {
          logger.error('Failed to retrieve current space index patterns');
          return response.badRequest({
            body: 'Failed to retrieve current space index patterns',
          });
        }
      } else if (suggestionType === 'endpoints') {
        suggestionMethod = termsAggSuggestions;
        index = prefixIndexPatternsWithCcs(INDEX_PATTERNS[suggestionType], ccsEnabled);

        const agentPolicyIds: string[] = [];
        const fleetService = securitySolutionContext.getInternalFleetServices();
        const endpointPackagePolicies = await fleetService.packagePolicy.fetchAllItems(
          savedObjects.client,
          {
            kuery: `${PACKAGE_POLICY_SAVED_OBJECT_TYPE}.package.name:endpoint`,
            spaceIds: [spaceId],
          }
        );
        for await (const batch of endpointPackagePolicies) {
          const batchAgentPolicyIds = batch.flatMap((policy) => policy.policy_ids);
          agentPolicyIds.push(...batchAgentPolicyIds);
        }

        const baseFilters = buildBaseEndpointMetadataFilter(agentPolicyIds);
        fullFilters = [...fullFilters, baseFilters];
      } else {
        return response.badRequest({
          body: `Invalid suggestion_type: ${suggestionType}`,
        });
      }

      // Avoid adding endpoint alerts log access to kibana_system role by using current user,
      // as the index may contain user data.
      // https://docs.elastic.dev/kibana-dev-docs/key-concepts/security-kibana-system-user
      const elasticsearchClient =
        suggestionType === 'endpointExceptions'
          ? elasticsearch.client.asCurrentUser
          : elasticsearch.client.asInternalUser;

      const abortSignal = getRequestAbortedSignal(request.events.aborted$);
      const body = await suggestionMethod(
        config,
        savedObjects.client,
        elasticsearchClient,
        index,
        fieldName,
        query,
        fullFilters,
        fieldMeta,
        abortSignal
      );
      return response.ok({ body });
    } catch (error) {
      return errorHandler(logger, response, error);
    }
  };
};
