/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IRouter, Logger } from '@kbn/core/server';
import { ApiPrivileges } from '@kbn/core-security-server';
import { schema } from '@kbn/config-schema';
import { PLUGIN_ID, ROUTE_VERSIONS } from '../../common/constants';
import { APIRoutes } from '../../common/types';
import { errorHandler } from '../utils/error_handler';
import { getRegionPolicy, putRegionPolicy, deleteRegionPolicy } from '../lib/region_policy';

export const defineRegionPolicyRoutes = ({
  logger,
  router,
}: {
  logger: Logger;
  router: IRouter;
}) => {
  router.versioned
    .get({
      access: 'internal',
      path: APIRoutes.REGION_POLICY,
      security: {
        authz: {
          requiredPrivileges: [ApiPrivileges.read(PLUGIN_ID)],
        },
      },
    })
    .addVersion(
      {
        version: ROUTE_VERSIONS.v1,
        security: {
          authz: {
            requiredPrivileges: [ApiPrivileges.read(PLUGIN_ID)],
          },
        },
        validate: {},
      },
      errorHandler(logger)(async (context, request, response) => {
        const {
          client: { asCurrentUser },
        } = (await context.core).elasticsearch;

        const policy = await getRegionPolicy(asCurrentUser);
        return response.ok({ body: policy, headers: { 'content-type': 'application/json' } });
      })
    );

  router.versioned
    .put({
      access: 'internal',
      path: APIRoutes.REGION_POLICY,
      security: {
        authz: {
          requiredPrivileges: [ApiPrivileges.manage(PLUGIN_ID)],
        },
      },
    })
    .addVersion(
      {
        version: ROUTE_VERSIONS.v1,
        security: {
          authz: {
            requiredPrivileges: [ApiPrivileges.manage(PLUGIN_ID)],
          },
        },
        validate: {
          request: {
            body: schema.object({
              allowed_regions: schema.maybe(
                schema.arrayOf(
                  schema.object({
                    csp: schema.string({ minLength: 1, maxLength: 64 }),
                    region: schema.string({ minLength: 1, maxLength: 128 }),
                  }),
                  { minSize: 1, maxSize: 100 }
                )
              ),
              allowed_geos: schema.maybe(
                schema.arrayOf(schema.string({ minLength: 1, maxLength: 64 }), {
                  minSize: 1,
                  maxSize: 50,
                })
              ),
              fallback_region: schema.maybe(
                schema.object({
                  csp: schema.string({ minLength: 1, maxLength: 64 }),
                  region: schema.string({ minLength: 1, maxLength: 128 }),
                })
              ),
            }),
          },
        },
      },
      errorHandler(logger)(async (context, request, response) => {
        const {
          client: { asCurrentUser },
        } = (await context.core).elasticsearch;

        const policy = await putRegionPolicy(asCurrentUser, request.body);
        return response.ok({ body: policy, headers: { 'content-type': 'application/json' } });
      })
    );

  router.versioned
    .delete({
      access: 'internal',
      path: APIRoutes.REGION_POLICY,
      security: {
        authz: {
          requiredPrivileges: [ApiPrivileges.manage(PLUGIN_ID)],
        },
      },
    })
    .addVersion(
      {
        version: ROUTE_VERSIONS.v1,
        security: {
          authz: {
            requiredPrivileges: [ApiPrivileges.manage(PLUGIN_ID)],
          },
        },
        validate: {},
      },
      errorHandler(logger)(async (context, request, response) => {
        const {
          client: { asCurrentUser },
        } = (await context.core).elasticsearch;

        await deleteRegionPolicy(asCurrentUser);
        return response.ok({ body: { acknowledged: true } });
      })
    );
};
