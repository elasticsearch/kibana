/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { i18n } from '@kbn/i18n';
import { schema } from '@kbn/config-schema';
import type { IRouter } from '@kbn/core/server';
import type { UsageCounter } from '@kbn/usage-collection-plugin/server';
import { ALERTING_CASES_SAVED_OBJECT_INDEX } from '@kbn/core-saved-objects-server/src/saved_objects_index_pattern';
import { IndexPatternsFetcher } from '@kbn/data-views-plugin/server';

import { verifyAccessAndContext } from '../lib';
import type { ILicenseState } from '../../lib';
import type { AlertingRequestHandlerContext } from '../../types';
import { DEFAULT_ALERTING_ROUTE_SECURITY } from '../constants';
import { MAX_ARRAY_FIELDS, MAX_SUGGESTION_TEXT_LENGTH } from '../../../common/constants';

export function registerFieldsRoute(
  router: IRouter<AlertingRequestHandlerContext>,
  licenseState: ILicenseState,
  usageCounter?: UsageCounter
) {
  router.post(
    {
      path: '/internal/rules/saved_objects/fields',
      security: DEFAULT_ALERTING_ROUTE_SECURITY,
      options: { access: 'internal' },
      validate: {
        body: schema.nullable(
          schema.object({
            fields: schema.maybe(
              schema.oneOf([
                schema.string({ maxLength: MAX_SUGGESTION_TEXT_LENGTH }),
                schema.arrayOf(schema.string({ maxLength: MAX_SUGGESTION_TEXT_LENGTH }), {
                  maxSize: MAX_ARRAY_FIELDS,
                }),
              ])
            ),
          })
        ),
      },
    },
    router.handleLegacyErrors(
      verifyAccessAndContext(licenseState, async function (context, request, response) {
        const tmpFields = request.body?.fields ?? ['alert.*'];
        const requestedFields = Array.isArray(tmpFields) ? tmpFields : [tmpFields];
        const isAllFieldsValid = requestedFields.every((f) => f.startsWith('alert.'));
        if (!isAllFieldsValid) {
          return response.badRequest({
            body: new Error(
              i18n.translate('xpack.alerting.api.error.rules.fields', {
                defaultMessage: 'You can only request fields starting with "alert."',
              })
            ),
          });
        }
        const indices = [ALERTING_CASES_SAVED_OBJECT_INDEX];
        const { elasticsearch, uiSettings } = await context.core;

        const indexPatternsFetcherAsInternalUser = new IndexPatternsFetcher(
          elasticsearch.client.asInternalUser,
          { uiSettingsClient: uiSettings.client }
        );
        const { fields } = await indexPatternsFetcherAsInternalUser.getFieldsForWildcard({
          pattern: indices,
          fields: requestedFields,
          fieldCapsOptions: { allow_no_indices: true },
        });
        return response.ok({ body: fields });
      })
    )
  );
}
