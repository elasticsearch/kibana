/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IKibanaResponse } from '@kbn/core-http-server';
import type { KibanaRequest, KibanaResponseFactory } from '@kbn/core/server';
import { buildStrictRouteValidationWithZod } from '../utils/build_strict_route_validation';
import { API_VERSIONS, ENTITY_STORE_ROUTES } from '../../../../common';
import { DEFAULT_ENTITY_STORE_PERMISSIONS } from '../../constants';
import { ENTITY_STORE_STATUS } from '../../../domain/constants';
import type { EntityStorePluginRouter } from '../../../types';
import { wrapMiddlewares } from '../../middleware';
import { enforceEntityStorePrivileges } from '../utils/check_entity_store_privileges';
import type { AssetManagerClient } from '../../../domain/asset_manager';
import { initMaintainersBodySchema } from './utils/validator';

export function registerInitMaintainers(router: EntityStorePluginRouter) {
  router.versioned
    .post({
      path: ENTITY_STORE_ROUTES.internal.ENTITY_MAINTAINERS_INIT,
      access: 'internal',
      summary: 'Initialize entity maintainers',
      description:
        'Initialize all registered entity maintainer tasks. Requires the Entity Store to be installed and the user to have sufficient privileges.',
      security: {
        authz: DEFAULT_ENTITY_STORE_PERMISSIONS,
      },
      enableQueryVersion: true,
    })
    .addVersion(
      {
        version: API_VERSIONS.internal.v2,
        validate: {
          request: {
            body: buildStrictRouteValidationWithZod(initMaintainersBodySchema),
          },
        },
      },
      wrapMiddlewares(async (ctx, req, res): Promise<IKibanaResponse> => {
        const entityStoreCtx = await ctx.entityStore;
        const { logger, assetManagerClient, entityMaintainersClient } = entityStoreCtx;

        logger.debug('Entity maintainers init API called');

        const validationError = await validateInitMaintainersRequest(assetManagerClient, req, res);
        if (validationError) {
          return validationError;
        }

        await entityMaintainersClient.init(req, { autoStart: req.body?.autoStart });

        return res.ok({ body: { ok: true } });
      })
    );
}

/**
 * Validates that the request can proceed with entity maintainers init:
 * 1. User has required privileges (cluster, index, saved object).
 * 2. Entity store is installed (init is only valid when entity store exists).
 * Returns an error response if validation fails, or null if validation passes.
 */
async function validateInitMaintainersRequest(
  assetManagerClient: AssetManagerClient,
  req: KibanaRequest,
  res: KibanaResponseFactory
): Promise<IKibanaResponse | null> {
  const forbidden = await enforceEntityStorePrivileges(assetManagerClient, req, res);
  if (forbidden) return forbidden;

  const { status } = await assetManagerClient.getStatus(false);
  if (status === ENTITY_STORE_STATUS.NOT_INSTALLED) {
    return res.badRequest({
      body: {
        message:
          'Entity store is not installed. Install the entity store first, then initialize entity maintainers.',
      },
    });
  }

  return null;
}
