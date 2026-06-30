/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RequestHandler } from '@kbn/core/server';
import type { TypeOf } from '@kbn/config-schema';
import { schema } from '@kbn/config-schema';
import type { OrphanResponseActionsMetadata } from '../../lib/reference_data';
import { REF_DATA_KEYS } from '../../lib/reference_data';
import { errorHandler } from '../error_handler';
import { ORPHAN_ACTIONS_SPACE_ROUTE } from '../../../../common/endpoint/constants';
import { withEndpointAuthz } from '../with_endpoint_authz';
import type { EndpointAppContextService } from '../../endpoint_app_context_services';
import type {
  SecuritySolutionPluginRouter,
  SecuritySolutionRequestHandlerContext,
} from '../../../types';

/**
 * GET API handler
 * @param endpointService
 */
export const getReadOrphanActionsSpaceHandler = (
  endpointService: EndpointAppContextService
): RequestHandler<unknown, unknown, unknown, SecuritySolutionRequestHandlerContext> => {
  const logger = endpointService.createLogger('ReadOrphanActionsSpaceHandler');

  return async (context, req, res) => {
    logger.debug(`Retrieving current orphan response actions space id`);

    try {
      const orphanSpaceRefData = await endpointService
        .getReferenceDataClient()
        .get<OrphanResponseActionsMetadata>(REF_DATA_KEYS.orphanResponseActionsSpace);

      return res.ok({
        body: {
          data: { spaceId: orphanSpaceRefData.metadata.spaceId },
        },
      });
    } catch (error) {
      return errorHandler(logger, res, error);
    }
  };
};

/**
 * Update handler
 * @param endpointService
 */
export const getUpdateOrphanActionsSpaceHandler = (
  endpointService: EndpointAppContextService
): RequestHandler<
  unknown,
  unknown,
  UpdateOrphanActionsSpaceBody,
  SecuritySolutionRequestHandlerContext
> => {
  const logger = endpointService.createLogger('UpdateOrphanActionsSpaceHandler');

  return async (context, req, res) => {
    logger.debug(`Updating orphan response actions space id`);

    try {
      const newSpaceIdValue = req.body.spaceId.trim();
      const refDataClient = endpointService.getReferenceDataClient();
      const updatedData = await refDataClient.get<OrphanResponseActionsMetadata>(
        REF_DATA_KEYS.orphanResponseActionsSpace
      );

      updatedData.metadata.spaceId = newSpaceIdValue;

      await refDataClient.update<OrphanResponseActionsMetadata>(
        REF_DATA_KEYS.orphanResponseActionsSpace,
        updatedData
      );

      return res.ok({
        body: {
          data: { spaceId: updatedData.metadata.spaceId },
        },
      });
    } catch (error) {
      return errorHandler(logger, res, error);
    }
  };
};

export const registerOrphanActionsSpaceRoute = (
  router: SecuritySolutionPluginRouter,
  endpointService: EndpointAppContextService
) => {
  const logger = endpointService.createLogger('OrphanActionsSpaceRoute');

  router.versioned
    .get({
      access: 'internal',
      path: ORPHAN_ACTIONS_SPACE_ROUTE,
      security: {
        authz: {
          requiredPrivileges: ['securitySolution'],
        },
      },
    })
    .addVersion(
      {
        version: '1',
        validate: false,
      },
      withEndpointAuthz(
        { any: ['canReadAdminData'] },
        logger,
        getReadOrphanActionsSpaceHandler(endpointService)
      )
    );

  router.versioned
    .post({
      access: 'internal',
      path: ORPHAN_ACTIONS_SPACE_ROUTE,
      security: {
        authz: {
          requiredPrivileges: ['securitySolution'],
        },
      },
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: UpdateOrphanActionsSpaceSchema,
        },
      },
      withEndpointAuthz(
        { any: ['canWriteAdminData'] },
        logger,
        getUpdateOrphanActionsSpaceHandler(endpointService)
      )
    );
};

export const UpdateOrphanActionsSpaceSchema = {
  body: schema.object({
    spaceId: schema.string({ minLength: 1, maxLength: 1024, defaultValue: '' }),
  }),
};

export type UpdateOrphanActionsSpaceBody = TypeOf<typeof UpdateOrphanActionsSpaceSchema.body>;
