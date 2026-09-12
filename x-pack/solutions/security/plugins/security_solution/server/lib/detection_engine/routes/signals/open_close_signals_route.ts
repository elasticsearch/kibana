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
import { DETECTION_ENGINE_SIGNALS_STATUS_URL } from '../../../../../common/constants';
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
import {
  buildRuntimeMappingsFromFieldTypes,
  mergeBulkCloseRuntimeMappings,
  MAX_RUNTIME_FIELDS_PER_REQUEST,
} from './bulk_close_runtime_mappings';
import type { SecuritySolutionEventBus } from '../../../../events/event_bus';
import {
  prefetchAllPreviousStatusesByIds,
  prefetchPreviousStatusesByQuery,
  collectStatusTransitions,
  type FoundHit,
  type PreviousStatus,
} from '../common/operations/prefetch_previous_statuses';
import { emitAlertStatusChangedWithCap } from '../../../../workflows/triggers/emit_status_changed';

export const setSignalsStatusRoute = (
  router: SecuritySolutionPluginRouter,
  logger: Logger,
  sender: ITelemetryEventsSender,
  eventBus?: SecuritySolutionEventBus
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
        const alertsIndex = siemClient.getAlertsIndex();
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
            const signalIds = request.body.signal_ids;
            let changingIds: string[] = [];
            let changingStatuses: PreviousStatus[] = [];
            if (eventBus) {
              try {
                // Fetch all IDs in chunks so requests larger than MAX_ALERTS_PER_TRIGGER
                // don't silently suppress the trigger when the first chunk is all no-ops.
                const { hits } = await prefetchAllPreviousStatusesByIds(
                  esClient,
                  alertsIndex,
                  signalIds
                );
                ({ ids: changingIds, previousStatuses: changingStatuses } =
                  collectStatusTransitions(hits, status));
              } catch (err) {
                logger.warn(
                  `Failed to pre-fetch previous alert statuses for workflow trigger: ${err}`
                );
              }
            }

            // Use common operation for "by IDs" case
            const body = await updateAlertsWorkflowStatus({
              context,
              index: alertsIndex,
              ids: signalIds,
              status,
              reason,
            });

            if (eventBus) {
              emitAlertStatusChangedWithCap(
                eventBus,
                request,
                status,
                changingIds,
                changingStatuses,
                logger
              );
            }

            return response.ok({ body });
          } else {
            const {
              conflicts,
              query: rawQuery,
              runtime_fields: runtimeFields,
              runtime_mappings: passthroughRuntimeMappings,
            } = request.body;

            // The schema documents `maxProperties: 100` on both runtime_fields
            // and runtime_mappings, but the generated Zod schema doesn't carry
            // that constraint — enforce the combined count here so one request
            // can't schedule unbounded runtime-script work on the
            // `_update_by_query`. Use the union of keys (a Set) rather than
            // summing the two counts so a key present in both params is counted
            // once — the merge step lets passthrough win on collision, so the
            // effective number of runtime mappings sent to ES is the union size.
            const runtimeFieldUnion = new Set([
              ...Object.keys(runtimeFields ?? {}),
              ...Object.keys(passthroughRuntimeMappings ?? {}),
            ]);
            if (runtimeFieldUnion.size > MAX_RUNTIME_FIELDS_PER_REQUEST) {
              return siemResponse.error({
                statusCode: 400,
                body: `runtime_fields and runtime_mappings combined are limited to ${MAX_RUNTIME_FIELDS_PER_REQUEST} entries per request, received ${runtimeFieldUnion.size} unique field names`,
              });
            }

            // The schema validates `query` only as an open object (the route
            // is intentionally permissive about DSL shape); narrow it to the
            // ES DSL type once at the boundary so internal helpers stay
            // strictly typed against `QueryDslQueryContainer`.
            const query = rawQuery as estypes.QueryDslQueryContainer;

            // Merge the two runtime-field inputs:
            //   runtime_fields: name → type map; server synthesises a _source reader per entry.
            //     Used by the exceptions flyout when closing by a rule-source runtime field.
            //   runtime_mappings: full mapping (type + script + format) forwarded verbatim.
            //     Used by the alerts table when closing with a data-view runtime field, so the
            //     caller's Painless script is preserved and ES evaluates it at query time rather
            //     than falling back to a _source read.
            // Passthrough entries win on key collision (they carry real semantics).
            const runtimeMappings = mergeBulkCloseRuntimeMappings(
              buildRuntimeMappingsFromFieldTypes(runtimeFields),
              passthroughRuntimeMappings
            );

            let prefetchedHits: FoundHit[] = [];
            let truncated = false;
            if (eventBus) {
              try {
                ({ hits: prefetchedHits, truncated } = await prefetchPreviousStatusesByQuery(
                  esClient,
                  alertsIndex,
                  query,
                  runtimeMappings,
                  status
                ));
              } catch (err) {
                logger.warn(`Failed to pre-fetch alert IDs for workflow trigger: ${err}`);
              }
            }

            const body = await updateSignalsStatusByQuery(
              status,
              query,
              { conflicts: conflicts ?? 'abort' },
              alertsIndex,
              esClient,
              user,
              reason,
              runtimeMappings
            );

            // Post-filter: excludeStatus pre-filters modern docs at ES level, but legacy
            // docs (signal.status only) and status-less docs may still appear. Drop both
            // the remaining no-ops and the status-less docs the update script never
            // mutates; docs with an unrecognized non-null status are kept since they do
            // transition. No cap is applied here — the by-query prefetch already returns
            // at most MAX_ALERTS_PER_TRIGGER hits, and `truncated` reports the overflow.
            const { ids: changingIds, previousStatuses: changingStatuses } =
              collectStatusTransitions(prefetchedHits, status);
            if (changingIds.length > 0 || truncated) {
              void eventBus?.emitAlertStatusChanged(request, {
                alertIds: changingIds,
                status,
                previousStatuses: changingStatuses,
                truncated,
              });
            }

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
  index: string,
  esClient: ElasticsearchClient,
  user: AuthenticatedUser | null,
  reason?: string,
  runtimeMappings?: estypes.MappingRuntimeFields
) => {
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
