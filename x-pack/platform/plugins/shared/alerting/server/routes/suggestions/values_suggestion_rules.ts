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
import type { UsageCounter } from '@kbn/usage-collection-plugin/server';
import { getKbnServerError, reportServerError } from '@kbn/kibana-utils-plugin/server';
import { ALERTING_CASES_SAVED_OBJECT_INDEX } from '@kbn/core-saved-objects-server/src/saved_objects_index_pattern';
import type { estypes } from '@elastic/elasticsearch';

import { verifyAccessAndContext } from '../lib';
import type { ILicenseState } from '../../lib';
import type { AlertingRequestHandlerContext } from '../../types';
import type { AlertingAuthorizationFilterOpts } from '../../authorization';
import { AlertingAuthorizationEntity, AlertingAuthorizationFilterType } from '../../authorization';
import { RuleAuditAction, ruleAuditEvent } from '../../rules_client/common/audit_events';
import { DEFAULT_ALERTING_ROUTE_SECURITY } from '../constants';
import { MAX_SUGGESTION_TEXT_LENGTH } from '../../../common/constants';

const alertingAuthorizationFilterOpts: AlertingAuthorizationFilterOpts = {
  type: AlertingAuthorizationFilterType.ESDSL,
  fieldNames: { ruleTypeId: 'alert.alertTypeId', consumer: 'alert.consumer' },
};

export const RulesSuggestionsSchema = {
  body: schema.object({
    field: schema.string({ maxLength: MAX_SUGGESTION_TEXT_LENGTH }),
    query: schema.string({ maxLength: MAX_SUGGESTION_TEXT_LENGTH }),
    filters: schema.maybe(schema.any()),
    fieldMeta: schema.maybe(schema.any()),
  }),
};

export function registerRulesValueSuggestionsRoute(
  router: IRouter<AlertingRequestHandlerContext>,
  licenseState: ILicenseState,
  config$: Observable<ConfigSchema>,
  usageCounter?: UsageCounter
) {
  router.post(
    {
      path: '/internal/rules/suggestions/values',
      security: DEFAULT_ALERTING_ROUTE_SECURITY,
      options: { access: 'internal' },
      validate: RulesSuggestionsSchema,
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
        try {
          authorizationTuple = await rulesClient.getAuthorization().getFindAuthorizationFilter({
            authorizationEntity: AlertingAuthorizationEntity.Rule,
            filterOpts: alertingAuthorizationFilterOpts,
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

        const { filter: authorizationFilter } = authorizationTuple;
        const filters = [
          ...(authorizationFilter != null ? [authorizationFilter] : []),
          { term: { namespaces: rulesClient.getSpaceId() } },
        ] as estypes.QueryDslQueryContainer[];
        const index = ALERTING_CASES_SAVED_OBJECT_INDEX;
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
