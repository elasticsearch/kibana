/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { transformError } from '@kbn/securitysolution-es-utils';
import { EXCEPTION_LIST_URL } from '@kbn/securitysolution-list-constants';
import { buildRouteValidationWithZod } from '@kbn/zod-helpers/v4';
import { ExportExceptionListRequestQuery } from '@kbn/securitysolution-exceptions-common/api';
import { EXCEPTIONS_API_READ } from '@kbn/security-solution-features/constants';

import type { ListsPluginRouter } from '../types';

import { buildSiemResponse, getExceptionListClient } from './utils';

export const exportExceptionListRoute = (router: ListsPluginRouter): void => {
  router.versioned
    .post({
      access: 'public',
      path: `${EXCEPTION_LIST_URL}/_export`,
      security: {
        authz: {
          requiredPrivileges: [EXCEPTIONS_API_READ],
        },
      },
    })
    .addVersion(
      {
        validate: {
          request: {
            query: buildRouteValidationWithZod(ExportExceptionListRequestQuery),
          },
        },
        version: '2023-10-31',
      },
      async (context, request, response) => {
        const siemResponse = buildSiemResponse(response);

        try {
          const {
            id,
            list_id: listId,
            namespace_type: namespaceType,
            include_expired_exceptions: includeExpiredExceptionsString,
          } = request.query;
          const exceptionListsClient = await getExceptionListClient(context);

          // Defaults to including expired exceptions if query param is not present
          const includeExpiredExceptions =
            includeExpiredExceptionsString !== undefined
              ? includeExpiredExceptionsString === 'true'
              : true;
          const exportContent = await exceptionListsClient.exportExceptionListAndItems({
            id,
            includeExpiredExceptions,
            listId,
            namespaceType,
          });

          if (exportContent == null) {
            return siemResponse.error({
              body: `exception list with list_id: ${listId} or id: ${id} does not exist`,
              statusCode: 400,
            });
          }

          return response.ok({
            body: `${exportContent.exportData}${JSON.stringify(exportContent.exportDetails)}\n`,
            headers: {
              'Content-Disposition': `attachment; filename="${listId}"`,
              'Content-Type': 'application/ndjson',
            },
          });
        } catch (err) {
          const error = transformError(err);
          return siemResponse.error({
            body: error.message,
            statusCode: error.statusCode,
          });
        }
      }
    );
};
