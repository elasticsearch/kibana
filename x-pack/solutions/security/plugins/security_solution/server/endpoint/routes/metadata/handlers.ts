/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { TypeOf } from '@kbn/config-schema';
import type { Logger, RequestHandler } from '@kbn/core/server';
import { FLEET_ENDPOINT_PACKAGE } from '@kbn/fleet-plugin/common';

import { stringify } from '../../utils/stringify';
import type {
  MetadataListResponse,
  EndpointSortableField,
} from '../../../../common/endpoint/types';
import { errorHandler } from '../error_handler';
import type { SecuritySolutionRequestHandlerContext } from '../../../types';
import { hasConnectedRemoteClusters } from '../../utils/ccs_utils';

import type { EndpointAppContext } from '../../types';
import type {
  GetMetadataListRequestQuery,
  GetMetadataRequestSchema,
} from '../../../../common/api/endpoint';
import {
  ENDPOINT_DEFAULT_PAGE,
  ENDPOINT_DEFAULT_PAGE_SIZE,
  ENDPOINT_DEFAULT_SORT_DIRECTION,
  ENDPOINT_DEFAULT_SORT_FIELD,
  METADATA_TRANSFORMS_PATTERN,
  METADATA_TRANSFORMS_PATTERN_V2,
} from '../../../../common/endpoint/constants';
import { isEndpointPackageV2 } from '../../../../common/endpoint/utils/package_v2';

export const getLogger = (endpointAppContext: EndpointAppContext): Logger => {
  return endpointAppContext.logFactory.get('metadata');
};

export function getMetadataListRequestHandler(
  endpointAppContext: EndpointAppContext,
  logger: Logger
): RequestHandler<
  unknown,
  GetMetadataListRequestQuery,
  unknown,
  SecuritySolutionRequestHandlerContext
> {
  return async (context, request, response) => {
    logger.debug(() => `endpoint host metadata list request:\n${stringify(request.query)}`);

    const spaceId = (await context.securitySolution).getSpaceId();
    const endpointMetadataService = endpointAppContext.service.getEndpointMetadataService(spaceId);
    const esClient = (await context.core).elasticsearch.client.asInternalUser;
    const ccsEnabled = await hasConnectedRemoteClusters(
      esClient,
      endpointAppContext.service.experimentalFeatures.defendRemoteOutputCcs
    );

    try {
      const { data, total } = await endpointMetadataService.getHostMetadataList(
        request.query,
        ccsEnabled
      );

      const body: MetadataListResponse = {
        data,
        total,
        page: request.query.page || ENDPOINT_DEFAULT_PAGE,
        pageSize: request.query.pageSize || ENDPOINT_DEFAULT_PAGE_SIZE,
        sortField:
          (request.query.sortField as EndpointSortableField) || ENDPOINT_DEFAULT_SORT_FIELD,
        sortDirection: request.query.sortDirection || ENDPOINT_DEFAULT_SORT_DIRECTION,
      };

      return response.ok({ body });
    } catch (error) {
      return errorHandler(logger, response, error);
    }
  };
}

export const getMetadataRequestHandler = function (
  endpointAppContext: EndpointAppContext,
  logger: Logger
): RequestHandler<
  TypeOf<typeof GetMetadataRequestSchema.params>,
  unknown,
  unknown,
  SecuritySolutionRequestHandlerContext
> {
  return async (context, request, response) => {
    const spaceId = (await context.securitySolution).getSpaceId();
    const endpointMetadataService = endpointAppContext.service.getEndpointMetadataService(spaceId);
    const esClient = (await context.core).elasticsearch.client.asInternalUser;
    const ccsEnabled = await hasConnectedRemoteClusters(
      esClient,
      endpointAppContext.service.experimentalFeatures.defendRemoteOutputCcs
    );

    try {
      return response.ok({
        body: await endpointMetadataService.getEnrichedHostMetadata(request.params.id, ccsEnabled),
      });
    } catch (error) {
      return errorHandler(logger, response, error);
    }
  };
};

export function getMetadataTransformStatsHandler(
  endpointAppContext: EndpointAppContext,
  logger: Logger
): RequestHandler<unknown, unknown, unknown, SecuritySolutionRequestHandlerContext> {
  return async (context, _, response) => {
    const esClient = (await context.core).elasticsearch.client.asInternalUser;
    const packageClient = endpointAppContext.service.getInternalFleetServices().packages;
    const installation = await packageClient.getInstallation(FLEET_ENDPOINT_PACKAGE);
    const transformName =
      installation?.version && !isEndpointPackageV2(installation.version)
        ? METADATA_TRANSFORMS_PATTERN
        : METADATA_TRANSFORMS_PATTERN_V2;

    try {
      const transformStats = await esClient.transform.getTransformStats({
        transform_id: transformName,
        allow_no_match: true,
      });
      return response.ok({
        body: transformStats,
      });
    } catch (error) {
      return errorHandler(logger, response, error);
    }
  };
}
