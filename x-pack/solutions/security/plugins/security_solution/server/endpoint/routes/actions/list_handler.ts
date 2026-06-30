/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RequestHandler } from '@kbn/core/server';
import type { EndpointActionListRequestQuery } from '../../../../common/api/endpoint';
import { ENDPOINT_ACTIONS_INDEX } from '../../../../common/endpoint/constants';
import { getActionList, getActionListByStatus } from '../../services';
import type { SecuritySolutionRequestHandlerContext } from '../../../types';
import type { EndpointAppContext } from '../../types';
import { errorHandler } from '../error_handler';
import type {
  ResponseActionAgentType,
  ResponseActionsApiCommandNames,
  ResponseActionStatus,
} from '../../../../common/endpoint/service/response_actions/constants';
import { doesLogsEndpointActionsIndexExist } from '../../utils';
import { hasConnectedRemoteClusters } from '../../utils/ccs_utils';

const formatRequestParams = <
  T extends string | ResponseActionsApiCommandNames | ResponseActionAgentType
>(
  value: T | T[] | undefined
): T[] | undefined => (typeof value === 'string' ? [value] : value);

const formatStatusValues = (
  value: ResponseActionStatus | ResponseActionStatus[]
): ResponseActionStatus[] => (typeof value === 'string' ? [value] : value);

export const actionListHandler = (
  endpointContext: EndpointAppContext
): RequestHandler<
  unknown,
  EndpointActionListRequestQuery,
  unknown,
  SecuritySolutionRequestHandlerContext
> => {
  const logger = endpointContext.logFactory.get('endpoint_action_list');

  return async (context, req, res) => {
    const {
      query: {
        agentIds: elasticAgentIds,
        agentTypes: _agentTypes,
        page,
        pageSize,
        startDate,
        endDate,
        userIds,
        commands,
        statuses,
        withOutputs,
        types,
      },
    } = req;
    const esClient = (await context.core).elasticsearch.client.asInternalUser;
    const activeSpaceId = (await context.securitySolution).getSpaceId();

    try {
      const ccsEnabled = await hasConnectedRemoteClusters(
        esClient,
        endpointContext.service.experimentalFeatures.defendRemoteOutputCcs
      );
      const indexExists = await doesLogsEndpointActionsIndexExist({
        esClient,
        logger,
        indexName: ENDPOINT_ACTIONS_INDEX,
      });

      if (!indexExists) {
        return res.notFound({ body: 'index_not_found_exception' });
      }

      // verify feature flag for sentinel_one `agentType`
      const agentTypes = formatRequestParams(_agentTypes);
      const requestParams: Parameters<typeof getActionList>[0] = {
        agentTypes,
        withOutputs: formatRequestParams(withOutputs),
        types: formatRequestParams(types),
        commands: formatRequestParams(commands),
        elasticAgentIds: formatRequestParams(elasticAgentIds),
        userIds: formatRequestParams(userIds),
        page,
        pageSize,
        startDate,
        endDate,

        spaceId: activeSpaceId,
        endpointService: endpointContext.service,
        ccsEnabled,
      };
      // wrapper method to branch logic for
      // normal paged search via page, size
      // vs full search for status filters
      const getActionsLog = () => {
        if (statuses?.length) {
          return getActionListByStatus({
            ...requestParams,
            statuses: formatStatusValues(statuses),
          });
        }
        return getActionList(requestParams);
      };

      const body = await getActionsLog();
      return res.ok({
        body,
      });
    } catch (error) {
      return errorHandler(logger, res, error);
    }
  };
};
