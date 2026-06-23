/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { boomify, isBoom } from '@hapi/boom';

import { telemetryHandler } from '@kbn/as-code-shared-telemetry';
import { LENS_CONTENT_TYPE } from '@kbn/lens-common/content_management/constants';
import {
  LENS_VIS_API_PATH,
  LENS_API_VERSION,
  LENS_API_ACCESS,
  LENS_API_TAG,
} from '../../../../common/constants';
import type { LensSavedObject } from '../../../content_management';
import type { RegisterAPIRouteFn } from '../../../types';
import { lensDeleteRequestParamsSchema } from './schema';

export const registerLensVisualizationsDeleteAPIRoute: RegisterAPIRouteFn = (
  router,
  { contentManagement, usageCounter }
) => {
  const deleteRoute = router.delete({
    path: `${LENS_VIS_API_PATH}/{id}`,
    access: LENS_API_ACCESS,
    summary: 'Delete visualization',
    description:
      'Permanently deletes a Lens visualization. If the visualization is referenced by a dashboard panel, the panel shows an error after deletion.',
    options: {
      tags: [LENS_API_TAG],
      availability: {
        stability: 'experimental',
        since: '9.4.0',
      },
    },
    security: {
      authz: {
        enabled: false,
        reason: 'Relies on Content Client for authorization',
      },
    },
  });

  deleteRoute.addVersion(
    {
      version: LENS_API_VERSION,
      options: {
        oasOperationObject: async () =>
          (await import('./oas_examples')).deleteLensVisualizationOASOperationObject,
      },
      validate: {
        request: {
          params: lensDeleteRequestParamsSchema,
        },
        response: {
          204: {
            description: 'No Content',
          },
          400: {
            description: 'Malformed request',
          },
          401: {
            description: 'Unauthorized',
          },
          403: {
            description: 'Forbidden',
          },
          404: {
            description: 'Resource not found',
          },
          500: {
            description: 'Internal Server Error',
          },
        },
      },
    },
    async (ctx, req, res) =>
      telemetryHandler(req, usageCounter, async () => {
        const client = contentManagement.contentClient
          .getForRequest({ request: req, requestHandlerContext: ctx })
          .for<LensSavedObject>(LENS_CONTENT_TYPE);

        try {
          const { result } = await client.delete(req.params.id);

          if (!result.success) {
            throw new Error(`Failed to delete Lens visualization with id [${req.params.id}].`);
          }

          return res.noContent();
        } catch (error) {
          if (isBoom(error)) {
            if (error.output.statusCode === 404) {
              return res.notFound({
                body: {
                  message: `A visualization with id [${req.params.id}] was not found.`,
                },
              });
            }
            if (error.output.statusCode === 403) {
              return res.forbidden();
            }
          }

          return boomify(error); // forward unknown error
        }
      })
  );
};
