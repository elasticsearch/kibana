/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IRouter } from '@kbn/core/server';
import unified from 'unified';
import markdown from 'remark-parse-no-trim';
import { some, filter } from 'lodash';
import deepEqual from 'fast-deep-equal';
import type { ECSMappingOrUndefined } from '@kbn/osquery-io-ts-types';
import type { ParsedTechnicalFields } from '@kbn/rule-registry-plugin/common';
import type { CreateLiveQueryRequestBodySchema } from '../../../common/api';
import { createLiveQueryRequestBodySchema } from '../../../common/api';
import { API_VERSIONS } from '../../../common/constants';
import { PARAMETER_NOT_FOUND } from '../../../common/translations/errors';
import { replaceParamsQuery } from '../../../common/utils/replace_params_query';
import { buildRouteValidation } from '../../utils/build_validation/route_validation';
import type { OsqueryAppContext } from '../../lib/osquery_app_context_services';
import type { StartPlugins } from '../../types';
import { createActionHandler } from '../../handlers';
import { parser as OsqueryParser } from './osquery_parser';
import { getUserInfo } from '../../lib/get_user_info';
import type { AuthorizeOsqueryResponseActionResult } from '../../lib/check_response_action_authz';
import {
  getOsqueryCapabilities,
  authorizeOsqueryResponseAction,
} from '../../lib/check_response_action_authz';
import { createLiveQueryResponseSchema } from './response_schemas';
import { toEcsMappingRecord } from '../../lib/resolve_query_reference';

export const createLiveQueryRoute = (router: IRouter, osqueryContext: OsqueryAppContext) => {
  router.versioned
    .post({
      access: 'public',
      path: '/api/osquery/live_queries',
      security: {
        authz: {
          enabled: false,
          reason:
            'Authorization depends on the request body; see isOsqueryResponseActionAuthorized.',
        },
      },
    })
    .addVersion(
      {
        version: API_VERSIONS.public.v1,
        validate: {
          request: {
            body: buildRouteValidation<
              typeof createLiveQueryRequestBodySchema,
              CreateLiveQueryRequestBodySchema
            >(createLiveQueryRequestBodySchema),
          },
          response: {
            200: {
              body: () => createLiveQueryResponseSchema,
            },
          },
        },
      },
      async (context, request, response) => {
        const [coreStartServices, startPlugins] = await osqueryContext.getStartServices();

        const logger = osqueryContext.logFactory.get('liveQuery');
        const space = await osqueryContext.service.getActiveSpace(request);
        const { writeLiveQueries, runSavedQueries } = await getOsqueryCapabilities(
          coreStartServices,
          request
        );

        const client = await osqueryContext.service
          .getRuleRegistryService()
          ?.getRacClientWithRequest(request);

        // Unreadable/missing alert on the deny path is 403, not 500.
        let alertData: (ParsedTechnicalFields & { _index: string }) | undefined;
        let alertError: unknown;
        try {
          alertData = request.body.alert_ids?.length
            ? ((await client?.get({ id: request.body.alert_ids[0] })) as ParsedTechnicalFields & {
                _index: string;
              })
            : undefined;
        } catch (error) {
          alertError = error;
        }

        // Resolving the reference reads saved objects, so a transient ES/SO failure must not
        // escape as an unhandled rejection on a request that only asked for an authz decision.
        let authorization: AuthorizeOsqueryResponseActionResult;
        try {
          authorization = await authorizeOsqueryResponseAction(
            coreStartServices,
            request,
            {
              saved_query_id: request.body.saved_query_id,
              pack_id: request.body.pack_id,
              query: request.body.query,
              queries: request.body.queries,
              ecs_mapping: request.body.ecs_mapping,
            },
            space?.id,
            alertData
          );
        } catch (error) {
          logger.error(`Failed to authorize osquery live query request: ${error.message}`, {
            error,
          });

          return response.customError({
            statusCode: 500,
            body: new Error('Error occurred while authorizing the live query request'),
          });
        }

        const { resolved } = authorization;
        const isInvalid = !authorization.authorized;

        if (isInvalid) {
          // Investigation-guide match requires runSavedQueries; it is not a grant of its own.
          if (!runSavedQueries || !request.body.alert_ids?.length || alertError) {
            return response.forbidden();
          }

          // Recovery only ever vouches for the singular `query`. A `queries[]` alongside it
          // would be dispatched unchecked by createDynamicQueries, so fail closed here.
          if (request.body.queries?.length) {
            return response.forbidden();
          }

          try {
            const justifyingAlert = alertData;
            const investigationGuide = justifyingAlert?.['kibana.alert.rule.note'];

            if (!justifyingAlert || !investigationGuide) {
              return response.forbidden();
            }

            const parsedAlertInvestigationGuide = unified()
              .use([[markdown, {}], OsqueryParser])
              .parse(investigationGuide);

            const osqueryQueries = filter(parsedAlertInvestigationGuide?.children as object, [
              'type',
              'osquery',
            ]);

            const requestQueryExistsInTheInvestigationGuide = some(
              osqueryQueries,
              (payload: {
                configuration: { query: string; ecs_mapping: ECSMappingOrUndefined };
              }) => {
                const { result: replacedConfigurationQuery } = replaceParamsQuery(
                  payload.configuration.query,
                  justifyingAlert
                );

                return (
                  replacedConfigurationQuery === request.body.query &&
                  deepEqual(
                    toEcsMappingRecord(payload.configuration.ecs_mapping),
                    toEcsMappingRecord(request.body.ecs_mapping)
                  )
                );
              }
            );

            if (!requestQueryExistsInTheInvestigationGuide) throw new Error();
          } catch (error) {
            return response.forbidden();
          }
        } else if (alertError) {
          throw alertError;
        }

        try {
          const securityStart = (startPlugins as StartPlugins).security;
          const currentUser = await getUserInfo({
            request,
            security: securityStart,
            logger,
          });
          const username = currentUser?.username ?? undefined;
          const userProfileUid = currentUser?.profile_uid ?? undefined;
          const { response: osqueryAction, fleetActionsCount } = await createActionHandler(
            osqueryContext,
            request.body,
            {
              metadata: { currentUser: username, userProfileUid },
              alertData,
              space,
              // Investigation-guide match keeps caller SQL; otherwise stored SO is dispatched.
              useStoredQuery: !isInvalid && !writeLiveQueries,
              storedQuery: !isInvalid && !writeLiveQueries ? resolved : undefined,
            }
          );
          if (!fleetActionsCount) {
            return response.badRequest({
              body: PARAMETER_NOT_FOUND,
            });
          }

          return response.ok({
            body: { data: osqueryAction },
          });
        } catch (error) {
          if (error.statusCode === 400) {
            return response.badRequest({ body: error });
          }

          return response.customError({
            statusCode: 500,
            body: new Error(`Error occurred while processing ${error}`),
          });
        }
      }
    );
};
