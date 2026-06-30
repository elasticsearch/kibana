/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RequestHandler } from '@kbn/core/server';
import type { TypeOf } from '@kbn/config-schema';
import { errorHandler } from '../error_handler';
import { stringify } from '../../utils/stringify';
import { ActionStatusRequestSchema } from '../../../../common/api/endpoint';
import { ACTION_STATUS_ROUTE } from '../../../../common/endpoint/constants';
import type {
  SecuritySolutionPluginRouter,
  SecuritySolutionRequestHandlerContext,
} from '../../../types';
import type { EndpointAppContext } from '../../types';
import { getPendingActionsSummary } from '../../services';
import { withEndpointAuthz } from '../with_endpoint_authz';
import { hasConnectedRemoteClusters } from '../../utils/ccs_utils';

/**
 * Registers routes for checking status of actions
 */
export function registerActionStatusRoutes(
  router: SecuritySolutionPluginRouter,
  endpointContext: EndpointAppContext
) {
  // Summary of action status for a given list of endpoints
  router.versioned
    .get({
      access: 'public',
      path: ACTION_STATUS_ROUTE,
      security: {
        authz: {
          requiredPrivileges: ['securitySolution'],
        },
      },
    })
    .addVersion(
      {
        version: '2023-10-31',
        validate: {
          request: ActionStatusRequestSchema,
        },
      },
      withEndpointAuthz(
        { all: ['canReadSecuritySolution'] },
        endpointContext.logFactory.get('hostIsolationStatus'),
        actionStatusRequestHandler(endpointContext)
      )
    );
}

export const actionStatusRequestHandler = function (
  endpointContext: EndpointAppContext
): RequestHandler<
  unknown,
  TypeOf<typeof ActionStatusRequestSchema.query>,
  unknown,
  SecuritySolutionRequestHandlerContext
> {
  const logger = endpointContext.logFactory.get('actionStatusApi');

  return async (context, req, res) => {
    logger.debug(() => `Retrieving action status for: ${stringify(req.query.agent_ids)}`);

    try {
      const spaceId = (await context.securitySolution).getSpaceId();
      const agentIDs: string[] = Array.isArray(req.query.agent_ids)
        ? [...new Set(req.query.agent_ids)]
        : [req.query.agent_ids];
      const esClient = (await context.core).elasticsearch.client.asInternalUser;
      const ccsEnabled = await hasConnectedRemoteClusters(
        esClient,
        endpointContext.service.experimentalFeatures.defendRemoteOutputCcs
      );

      await endpointContext.service
        .getInternalFleetServices(spaceId)
        .ensureInCurrentSpace({ agentIds: agentIDs });

      const response = await getPendingActionsSummary(
        endpointContext.service,
        spaceId,
        agentIDs,
        ccsEnabled
      );

      return res.ok({
        body: {
          data: response,
        },
      });
    } catch (error) {
      return errorHandler(logger, res, error);
    }
  };
};
