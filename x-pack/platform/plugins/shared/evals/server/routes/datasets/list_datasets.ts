/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  API_VERSIONS,
  EVALS_DATASETS_URL,
  GetEvaluationDatasetsRequestQuery,
  INTERNAL_API_ACCESS,
} from '@kbn/evals-common';
import { buildRouteValidationWithZod } from '@kbn/zod-helpers/v4';
import { EVALS_API_PRIVILEGES } from '../../../common';
import {
  ENCRYPTION_NOT_CONFIGURED_MESSAGE,
  forwardToRemoteKibana,
  getDestinationFromRequest,
  RemoteDecryptionError,
} from '../../remote_kibana/forward_to_remote_kibana';
import type { RouteDependencies } from '../register_routes';

export const registerListDatasetsRoute = ({
  router,
  logger,
  canEncrypt,
  getEncryptedSavedObjectsStart,
}: RouteDependencies) => {
  router.versioned
    .get({
      path: EVALS_DATASETS_URL,
      access: INTERNAL_API_ACCESS,
      security: {
        authz: { requiredPrivileges: [EVALS_API_PRIVILEGES.read] },
      },
      summary: 'List evaluation datasets',
    })
    .addVersion(
      {
        version: API_VERSIONS.internal.v1,
        validate: {
          request: {
            query: buildRouteValidationWithZod(GetEvaluationDatasetsRequestQuery),
          },
        },
      },
      async (context, request, response) => {
        try {
          const destination = getDestinationFromRequest(request);
          if (destination && destination !== 'local') {
            if (!canEncrypt) {
              return response.customError({
                statusCode: 501,
                body: { message: ENCRYPTION_NOT_CONFIGURED_MESSAGE },
              });
            }
            const encryptedSavedObjects = await getEncryptedSavedObjectsStart();
            const forwarded = await forwardToRemoteKibana({
              encryptedSavedObjects,
              remoteId: destination,
              request,
              method: 'GET',
            });

            if (forwarded.statusCode === 200) {
              return response.ok({ body: forwarded.body });
            }
            if (forwarded.statusCode === 404) {
              return response.notFound({ body: forwarded.body as any });
            }

            return response.customError({
              statusCode: forwarded.statusCode,
              body: forwarded.body as any,
            });
          }

          const {
            page,
            per_page: perPage,
            search,
            sort_field: sortField,
            sort_order: sortOrder,
          } = request.query;
          const evalsContext = await context.evals;
          const datasetClient = evalsContext.datasetService.getClient();
          const datasets = await datasetClient.list({
            page,
            perPage,
            search,
            sortField,
            sortOrder,
          });

          return response.ok({
            body: datasets,
          });
        } catch (error) {
          if (error instanceof RemoteDecryptionError) {
            logger.error(`Remote decryption failed: ${error.message}`);
            return response.customError({
              statusCode: 400,
              body: { message: error.message },
            });
          }
          logger.error(`Failed to list evaluation datasets: ${error}`);
          return response.customError({
            statusCode: 500,
            body: { message: 'Failed to list evaluation datasets' },
          });
        }
      }
    );
};
