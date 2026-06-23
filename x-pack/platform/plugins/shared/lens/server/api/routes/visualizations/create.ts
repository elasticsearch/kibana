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
import type { LensCreateIn, LensSavedObject } from '../../../content_management';
import type { RegisterAPIRouteFn } from '../../types';
import type { LensCreateResponseBody } from './types';
import { getLensRequestConfig, getLensResponseItem } from './utils';
import { lensCreateRequestBodySchema, lensCreateResponseBodySchema } from './schema';

export const registerLensVisualizationsCreateAPIRoute: RegisterAPIRouteFn = (
  router,
  { contentManagement, builder, usageCounter }
) => {
  const createRoute = router.post({
    path: LENS_VIS_API_PATH,
    access: LENS_API_ACCESS,
    summary: 'Create visualization',
    description: [
      'Creates a Lens visualization and saves it to the library.',
      '',
      'ES|QL visualizations cannot be created through this endpoint.',
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

  createRoute.addVersion(
    {
      version: LENS_API_VERSION,
      options: {
        oasOperationObject: async () =>
          (await import('./oas_examples')).createLensVisualizationOASOperationObject,
      },
      validate: {
        request: {
          body: lensCreateRequestBodySchema,
        },
        response: {
          201: {
            body: () => lensCreateResponseBodySchema,
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
        const client = contentManagement.contentClient
          .getForRequest({ request: req, requestHandlerContext: ctx })
          .for<LensSavedObject>(LENS_CONTENT_TYPE);

        try {
          const { references, ...data } = getLensRequestConfig(builder, req.body);
          const options: LensCreateIn['options'] = { references };
          const { result } = await client.create(data, options);
          const responseItem = getLensResponseItem(builder, result.item);

          return res.created<LensCreateResponseBody>({
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
