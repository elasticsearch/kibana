/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import type { IRouter } from '@kbn/core/server';
import type { Observable } from 'rxjs';
import { firstValueFrom } from 'rxjs';
import { getRequestAbortedSignal } from '@kbn/data-plugin/server';
import { termsAggSuggestions } from '@kbn/kql/server/autocomplete/terms_agg';
import type { ConfigSchema } from '@kbn/kql/server/config';
import { getKbnServerError, reportServerError } from '@kbn/kibana-utils-plugin/server';
import type { estypes } from '@elastic/elasticsearch';
import { ALERT_RULE_CONSUMER, ALERT_RULE_TYPE_ID, SPACE_IDS } from '@kbn/rule-data-utils';

import { verifyAccessAndContext } from '../lib';
import { RuleAuditAction, ruleAuditEvent } from '../../rules_client/common/audit_events';
import type { AlertingAuthorizationFilterOpts, AuthorizedRuleTypes } from '../../authorization';
import { AlertingAuthorizationEntity, AlertingAuthorizationFilterType } from '../../authorization';
import type { AlertingRequestHandlerContext } from '../../types';
import type { GetAlertIndicesAlias, ILicenseState } from '../../lib';
import { DEFAULT_ALERTING_ROUTE_SECURITY } from '../constants';
import { MAX_SUGGESTION_TEXT_LENGTH } from '../../../common/constants';

const alertingAuthorizationFilterOpts: AlertingAuthorizationFilterOpts = {
  type: AlertingAuthorizationFilterType.ESDSL,
  fieldNames: { ruleTypeId: ALERT_RULE_TYPE_ID, consumer: ALERT_RULE_CONSUMER },
};

export const AlertsSuggestionsSchema = {
  body: schema.object({
    field: schema.string({ maxLength: MAX_SUGGESTION_TEXT_LENGTH }),
    query: schema.string({ maxLength: MAX_SUGGESTION_TEXT_LENGTH }),
    filters: schema.maybe(schema.any()),
    fieldMeta: schema.maybe(schema.any()),
  }),
};

export function registerAlertsValueSuggestionsRoute(
  router: IRouter<AlertingRequestHandlerContext>,
  licenseState: ILicenseState,
  config$: Observable<ConfigSchema>,
  getAlertIndicesAlias?: GetAlertIndicesAlias
) {
  router.post(
    {
      path: '/internal/alerts/suggestions/values',
      security: DEFAULT_ALERTING_ROUTE_SECURITY,
      options: { access: 'internal' },
      validate: AlertsSuggestionsSchema,
    },
    router.handleLegacyErrors(
      verifyAccessAndContext(licenseState, async function (context, request, response) {
        const config = await firstValueFrom(config$);
        const { field: fieldName, query, fieldMeta } = request.body;
        const abortSignal = getRequestAbortedSignal(request.events.aborted$);
        const { savedObjects, elasticsearch } = await context.core;

        const alertingContext = await context.alerting;
        const rulesClient = await alertingContext.getRulesClient();
        let authorizationTuple;
        let authorizedRuleType: AuthorizedRuleTypes = new Map();

        try {
          const authorization = rulesClient.getAuthorization();
          authorizationTuple = await authorization.getFindAuthorizationFilter({
            authorizationEntity: AlertingAuthorizationEntity.Alert,
            filterOpts: alertingAuthorizationFilterOpts,
          });

          authorizedRuleType = await authorization.getAllAuthorizedRuleTypesFindOperation({
            authorizationEntity: AlertingAuthorizationEntity.Alert,
          });
        } catch (error) {
          rulesClient.getAuditLogger()?.log(
            ruleAuditEvent({
              action: RuleAuditAction.FIND,
              error,
            })
          );

          throw error;
        }

        const spaceId = rulesClient.getSpaceId();
        const { filter: authorizationFilter } = authorizationTuple;
        const filters = [
          ...(authorizationFilter != null ? [authorizationFilter] : []),
          { term: { [SPACE_IDS]: spaceId } },
        ] as estypes.QueryDslQueryContainer[];

        const index = getAlertIndicesAlias!(
          Array.from(authorizedRuleType.keys()).map((id) => id),
          spaceId
        ).join(',');

        try {
          const body = await termsAggSuggestions(
            config,
            savedObjects.client,
            elasticsearch.client.asInternalUser,
            index,
            fieldName,
            query,
            filters,
            fieldMeta,
            abortSignal
          );
          return response.ok({ body });
        } catch (e) {
          const kbnErr = getKbnServerError(e);
          return reportServerError(response, kbnErr);
        }
      })
    )
  );
}
