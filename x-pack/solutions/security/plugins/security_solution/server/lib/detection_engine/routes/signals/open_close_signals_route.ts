/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { get } from 'lodash';
import { transformError } from '@kbn/securitysolution-es-utils';
import type { AuthenticatedUser, ElasticsearchClient, Logger } from '@kbn/core/server';
import type { estypes } from '@elastic/elasticsearch';
import { buildRouteValidationWithZod } from '@kbn/zod-helpers/v4';
import {
  ALERTS_API_ALL,
  ALERTS_API_UPDATE_DEPRECATED_PRIVILEGE,
} from '@kbn/security-solution-features/constants';
import { SetAlertsStatusRequestBody } from '../../../../../common/api/detection_engine/signals';
import type { SecuritySolutionPluginRouter } from '../../../../types';
import {
  DEFAULT_ALERTS_INDEX,
  DETECTION_ENGINE_SIGNALS_STATUS_URL,
} from '../../../../../common/constants';
import { buildSiemResponse } from '../utils';
import type { ITelemetryEventsSender } from '../../../telemetry/sender';
import { INSIGHTS_CHANNEL } from '../../../telemetry/constants';
import {
  createAlertStatusPayloads,
  getSessionIDfromKibanaRequest,
} from '../../../telemetry/insights';
import {
  getUpdateAlertsWorkflowStatusScript,
  updateAlertsWorkflowStatus,
} from '../common/operations/update_alerts_workflow_status';
import { validateClosingReason } from '../common/validators/validate_closing_reason';
import { buildRuntimeMappingsFromFieldTypes } from './bulk_close_runtime_mappings';

export const setSignalsStatusRoute = (
  router: SecuritySolutionPluginRouter,
  logger: Logger,
  sender: ITelemetryEventsSender
) => {
  router.versioned
    .post({
      path: DETECTION_ENGINE_SIGNALS_STATUS_URL,
      access: 'public',
      security: {
        authz: {
          requiredPrivileges: [
            { anyRequired: [ALERTS_API_ALL, ALERTS_API_UPDATE_DEPRECATED_PRIVILEGE] },
          ],
        },
      },
    })
    .addVersion(
      {
        version: '2023-10-31',
        validate: {
          request: {
            body: buildRouteValidationWithZod(SetAlertsStatusRequestBody),
          },
        },
      },
      async (context, request, response) => {
        const { status } = request.body;

        const core = await context.core;
        const securitySolution = await context.securitySolution;
        const esClient = core.elasticsearch.client.asCurrentUser;
        const siemClient = securitySolution?.getAppClient();
        const siemResponse = buildSiemResponse(response);
        const spaceId = securitySolution?.getSpaceId() ?? 'default';

        const closingReason = await validateClosingReason({
          core,
          status,
          reason: 'reason' in request.body ? request.body.reason : undefined,
        });
        if (!closingReason.valid) {
          return siemResponse.error({ statusCode: 400, body: closingReason.message });
        }
        const reason = closingReason.reason;

        if (!siemClient) {
          return siemResponse.error({ statusCode: 404 });
        }
        const user = core.security.authc.getCurrentUser();

        const clusterId = sender.getClusterID();
        const isTelemetryOptedIn = await sender.isTelemetryOptedIn();

        if (isTelemetryOptedIn && clusterId) {
          // Sometimes the ids are in the query not passed in the request?
          const toSendAlertIds =
            'signal_ids' in request.body
              ? request.body.signal_ids
              : (get(request.body.query, 'bool.filter.terms._id') as string[]);
          // Get Context for Insights Payloads
          const sessionId = getSessionIDfromKibanaRequest(clusterId, request);
          if (user?.username && toSendAlertIds && sessionId && status) {
            const insightsPayloads = createAlertStatusPayloads(
              clusterId,
              toSendAlertIds,
              sessionId,
              user.username,
              DETECTION_ENGINE_SIGNALS_STATUS_URL,
              status
            );
            logger.debug(() => `Sending Insights Payloads ${JSON.stringify(insightsPayloads)}`);
            await sender.sendOnDemand(INSIGHTS_CHANNEL, insightsPayloads);
          }
        }

        try {
          if ('signal_ids' in request.body) {
            // Use common operation for "by IDs" case
            const body = await updateAlertsWorkflowStatus({
              context,
              index: `${DEFAULT_ALERTS_INDEX}-${spaceId}`,
              ids: request.body.signal_ids,
              status,
              reason,
            });

            return response.ok({ body });
          } else {
            const { conflicts, query: rawQuery, runtime_fields: runtimeFields } = request.body;
            // The schema validates `query` only as an open object (the route
            // is intentionally permissive about DSL shape); narrow it to the
            // ES DSL type once at the boundary so internal helpers stay
            // strictly typed against `QueryDslQueryContainer`.
            const query = rawQuery as estypes.QueryDslQueryContainer;

            // Build runtime_mappings purely from the caller-supplied
            // `runtime_fields` map. For each entry, the server defines a
            // runtime field of the requested type whose script reads the
            // field's value out of the alert document's `_source` — which
            // is otherwise not directly queryable — and attaches the
            // result to the underlying `_update_by_query`.
            const runtimeMappings = buildRuntimeMappingsFromFieldTypes(runtimeFields);

            const body = await updateSignalsStatusByQuery(
              status,
              query,
              { conflicts: conflicts ?? 'abort' },
              spaceId,
              esClient,
              user,
              logger,
              reason,
              runtimeMappings
            );

            return response.ok({ body });
          }
        } catch (err) {
          // error while getting or updating signal with id: id in signal index .siem-signals
          const error = transformError(err);
          return siemResponse.error({
            body: error.message,
            statusCode: error.statusCode,
          });
        }
      }
    );
};

/**
 * Please avoid using `updateSignalsStatusByQuery` when possible, use the
 * common handler with "by IDs" instead.
 *
 * This method calls `updateByQuery` with `refresh: true` which is expensive on
 * serverless.
 *
 * When `runtimeMappings` are provided, they are attached to the `_update_by_query`
 * request alongside the filter. ES evaluates the runtime scripts in the
 * query's filter context against each candidate alert.
 *
 * `runtime_mappings` is a valid top-level field on the `_update_by_query`
 * request, but it isn't typed on
 * `UpdateByQueryRequest` in the JS client (yet). We widen the request type
 * inline rather than suppressing the type error.
 */
const updateSignalsStatusByQuery = async (
  status: SetAlertsStatusRequestBody['status'],
  query: estypes.QueryDslQueryContainer,
  options: { conflicts: 'abort' | 'proceed' },
  spaceId: string,
  esClient: ElasticsearchClient,
  user: AuthenticatedUser | null,
  logger: Logger,
  reason?: string,
  runtimeMappings?: estypes.MappingRuntimeFields
) => {
  const index = `${DEFAULT_ALERTS_INDEX}-${spaceId}`;
  const hasRuntimeMappings = runtimeMappings != null && Object.keys(runtimeMappings).length > 0;

  const request: estypes.UpdateByQueryRequest & {
    runtime_mappings?: estypes.MappingRuntimeFields;
  } = {
    index,
    conflicts: options.conflicts,
    refresh: true,
    script: getUpdateAlertsWorkflowStatusScript(status, user, reason),
    query: {
      bool: {
        filter: query,
      },
    },
    ignore_unavailable: true,
    ...(hasRuntimeMappings ? { runtime_mappings: runtimeMappings } : {}),
  };

  return esClient.updateByQuery(request);
};
