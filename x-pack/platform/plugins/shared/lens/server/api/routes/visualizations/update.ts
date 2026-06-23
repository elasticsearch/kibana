/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { boomify, isBoom } from '@hapi/boom';

import { asCodeIdSchema } from '@kbn/as-code-shared-schemas';
import { telemetryHandler } from '@kbn/as-code-shared-telemetry';
import { isLensLegacyAttributes } from '@kbn/lens-embeddable-utils';
import { LENS_CONTENT_TYPE } from '@kbn/lens-common/content_management/constants';

import {
  LENS_VIS_API_PATH,
  LENS_API_VERSION,
  LENS_API_ACCESS,
  LENS_API_TAG,
} from '../../../../common/constants';
import type { LensUpdateIn, LensSavedObject } from '../../../content_management';

import type { RegisterAPIRouteFn } from '../../types';
import type { LensUpdateResponseBody } from './types';
import {
  lensUpdateRequestBodySchema,
  lensUpdateRequestParamsSchema,
  lensUpdateResponseBodySchema,
} from './schema';
import { getLensRequestConfig, getLensResponseItem } from './utils';

export const registerLensVisualizationsUpdateAPIRoute: RegisterAPIRouteFn = (
  router,
  { contentManagement, builder, usageCounter }
) => {
  const updateRoute = router.put({
    path: `${LENS_VIS_API_PATH}/{id}`,
    access: LENS_API_ACCESS,
    summary: 'Update visualization',
    description: [
      'Replaces the full configuration of an existing Lens visualization. Partial updates are not supported.',
      'To make incremental changes, retrieve the visualization first, modify the fields you need, then send the complete object back.',
      '',
      'If no visualization exists with the specified ID, a new one is created.',
      '',
      'ES|QL visualizations cannot be updated through this endpoint.',
    ].join('\n'),
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

  updateRoute.addVersion(
    {
      version: LENS_API_VERSION,
      options: {
        oasOperationObject: async () =>
          (await import('./oas_examples')).updateLensVisualizationOASOperationObject,
      },
      validate: {
        request: {
          params: lensUpdateRequestParamsSchema,
          body: lensUpdateRequestBodySchema,
        },
        response: {
          200: {
            body: () => lensUpdateResponseBodySchema,
            description: 'Ok',
          },
          201: {
            body: () => lensUpdateResponseBodySchema,
            description: 'Created',
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
          500: {
            description: 'Internal Server Error',
          },
        },
      },
    },
    async (ctx, req, res) =>
      telemetryHandler(req, usageCounter, async () => {
        const requestBodyData = req.body;
        if (isLensLegacyAttributes(requestBodyData) && !requestBodyData.visualizationType) {
          throw new Error('visualizationType is required');
        }

        // TODO fix IContentClient to type this client based on the actual
        const client = contentManagement.contentClient
          .getForRequest({ request: req, requestHandlerContext: ctx })
          .for<LensSavedObject>(LENS_CONTENT_TYPE);

        // Note: these types are to enforce loose param typings of client methods
        const { references, ...data } = getLensRequestConfig(builder, req.body);
        const options: LensUpdateIn['options'] = { references };

        let createdNew = false;
        try {
          await client.get(req.params.id);
        } catch (error) {
          if (isBoom(error) && error.output.statusCode === 404) {
            createdNew = true;
          }
        }

        if (createdNew) {
          try {
            asCodeIdSchema.validate(req.params.id);
          } catch (error) {
            return res.badRequest({ body: { message: error.message } });
          }
        }

        try {
          const { result } = await client.update(req.params.id, data, options);
          const responseItem = getLensResponseItem(builder, result.item);

          if (createdNew) {
            return res.created<LensUpdateResponseBody>({
              body: responseItem,
            });
          }

          return res.ok<LensUpdateResponseBody>({
            body: responseItem,
          });
        } catch (error) {
          if (isBoom(error) && error.output.statusCode === 403) {
            return res.forbidden();
          }

          return boomify(error); // forward unknown error
        }
      })
  );
};
