/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IRuleDataClient } from '@kbn/rule-registry-plugin/server';
import { buildRouteValidationWithZod } from '@kbn/zod-helpers/v4';
import { ALERT_ATTACK_DISCOVERY_ALERT_IDS } from '@kbn/elastic-assistant-common';
import {
  ALERTS_API_ALL,
  ALERTS_API_UPDATE_DEPRECATED_PRIVILEGE,
} from '@kbn/security-solution-features/constants';

import { SetAttacksStatusRequestBody } from '../../../../../common/api/detection_engine/attacks';
import { DETECTION_ENGINE_ATTACKS_STATUS_URL } from '../../../../../common/constants';
import type { SecuritySolutionPluginRouter } from '../../../../types';
import { updateAlertsWorkflowStatus } from '../common/operations/update_alerts_workflow_status';
import { searchAlerts } from '../common/operations/search_alerts';
import { validateClosingReason } from '../common/validators/validate_closing_reason';
import { getAttackAlertsIndex } from '../common/index_patterns/get_attack_alerts_index';
import { getUnifiedAlertsIndex } from '../common/index_patterns/get_unified_alerts_index';
import { withSiemErrorHandling } from '../with_siem_error_handling';
import { buildSiemResponse } from '../utils';

export const setAttacksStatusRoute = (
  router: SecuritySolutionPluginRouter,
  ruleDataClient: IRuleDataClient | null
) => {
  router.versioned
    .post({
      path: DETECTION_ENGINE_ATTACKS_STATUS_URL,
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
            body: buildRouteValidationWithZod(SetAttacksStatusRequestBody),
          },
        },
      },
      async (context, request, response) => {
        const core = await context.core;
        const { status, ids, update_related_alerts: updateRelatedAlerts } = request.body;
        const reason = 'reason' in request.body ? request.body.reason : undefined;

        const closingReason = await validateClosingReason({ core, status, reason });
        if (!closingReason.valid) {
          return buildSiemResponse(response).error({
            statusCode: 400,
            body: closingReason.message,
          });
        }

        // Attack indices scope the update by query, so unknown/non-attack ids are
        // filtered out naturally (they never match `terms: { _id }`).
        const attackIndex = await getAttackAlertsIndex({ context });

        if (!updateRelatedAlerts) {
          return withSiemErrorHandling(response, () =>
            updateAlertsWorkflowStatus({
              context,
              index: attackIndex,
              ids,
              status,
              reason: closingReason.reason,
            })
          );
        }

        return withSiemErrorHandling(response, async () => {
          // Pre-fetch the verified attack docs to read their related detection
          // alert ids; the attack index scope filters out unknown attack ids.
          const attackDocs = await searchAlerts({
            context,
            index: attackIndex,
            params: {
              query: { bool: { filter: { terms: { _id: ids } } } },
              _source: [ALERT_ATTACK_DISCOVERY_ALERT_IDS],
              size: ids.length,
            },
          });

          const verifiedAttackIds = attackDocs.hits.hits
            .map((hit) => hit._id)
            .filter((id): id is string => id != null);

          const relatedAlertIds = attackDocs.hits.hits.flatMap((hit) => {
            const source = hit._source as Record<string, unknown> | undefined;
            const alertIds = source?.[ALERT_ATTACK_DISCOVERY_ALERT_IDS];
            return Array.isArray(alertIds) ? (alertIds as string[]) : [];
          });

          const combinedIds = Array.from(new Set([...verifiedAttackIds, ...relatedAlertIds]));

          // Related detection alerts live outside the attack indices, so expand
          // the target to the unified index pattern for the cascade update.
          const index = await getUnifiedAlertsIndex({ context, ruleDataClient });

          return updateAlertsWorkflowStatus({
            context,
            index,
            ids: combinedIds,
            status,
            reason: closingReason.reason,
          });
        });
      }
    );
};
