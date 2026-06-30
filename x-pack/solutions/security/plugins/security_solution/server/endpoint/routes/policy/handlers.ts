/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RequestHandler } from '@kbn/core/server';
import type { TypeOf } from '@kbn/config-schema';
import type { SecuritySolutionRequestHandlerContext } from '../../../types';
import type { EndpointAppContextService } from '../../endpoint_app_context_services';
import { errorHandler } from '../error_handler';
import type { GetPolicyResponseSchema } from '../../../../common/api/endpoint';
import { getPolicyResponseByAgentId } from './service';
import { NotFoundError } from '../../errors';
import { hasConnectedRemoteClusters } from '../../utils/ccs_utils';

export const getHostPolicyResponseHandler = function (
  endpointAppContextServices: EndpointAppContextService
): RequestHandler<
  never,
  TypeOf<typeof GetPolicyResponseSchema.query>,
  never,
  SecuritySolutionRequestHandlerContext
> {
  const logger = endpointAppContextServices.createLogger('endpointPolicyResponse');

  return async (context, request, response) => {
    const spaceId = (await context.securitySolution).getSpaceId();
    const esClient = (await context.core).elasticsearch.client.asInternalUser;
    const fleetServices = endpointAppContextServices.getInternalFleetServices(spaceId);
    const ccsEnabled = await hasConnectedRemoteClusters(
      esClient,
      endpointAppContextServices.experimentalFeatures.defendRemoteOutputCcs
    );

    try {
      const agentId = request.query.agentId;
      const doc = await getPolicyResponseByAgentId(agentId, esClient, fleetServices, ccsEnabled);

      if (doc) {
        return response.ok({ body: doc });
      }

      logger.debug(`Agent id [${agentId}] has no policy response documents indexed yet`);

      throw new NotFoundError(`Policy response for endpoint id [${agentId}] not found`);
    } catch (err) {
      return errorHandler(logger, response, err);
    }
  };
};
