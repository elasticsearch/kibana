/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { kibanaResponseFactory } from '@kbn/core/server';
import { coreMock, httpServerMock, httpServiceMock } from '@kbn/core/server/mocks';
import { loggingSystemMock } from '@kbn/core-logging-server-mocks';
import {
  API_BASE_PATH,
  QUERY_ACTIVITY_MIN_RUNNING_TIME_DEFAULT_MS,
  QUERY_ACTIVITY_MIN_RUNNING_TIME_SETTING,
} from '../../common/constants';
import { registerSearchRoute } from './search';

describe(`GET ${API_BASE_PATH}/search`, () => {
  const setup = () => {
    const router = httpServiceMock.createRouter();
    const logger = loggingSystemMock.createLogger();

    registerSearchRoute({ router, logger });

    const [[_config, handler]] = router.get.mock.calls;
    const coreContext = coreMock.createRequestHandlerContext();
    coreContext.uiSettings.client.get.mockImplementation(async (key: string) => {
      if (key === QUERY_ACTIVITY_MIN_RUNNING_TIME_SETTING) {
        return QUERY_ACTIVITY_MIN_RUNNING_TIME_DEFAULT_MS;
      }
    });
    const context = coreMock.createCustomRequestHandlerContext({ core: coreContext });
    const esClient = coreContext.elasticsearch.client.asInternalUser;
    const asCurrentUser = coreContext.elasticsearch.client.asCurrentUser as any;
    jest.spyOn(asCurrentUser, 'security', 'get').mockReturnValue({
      hasPrivileges: jest.fn().mockResolvedValue({ cluster: { monitor: true } }),
    });

    return { handler, context, esClient, logger };
  };

  const createRequest = () =>
    httpServerMock.createKibanaRequest({
      method: 'get',
      path: `${API_BASE_PATH}/search`,
    });

  it('returns lightweight query summaries without fetching task details', async () => {
    const { handler, context, esClient } = setup();

    esClient.tasks.list.mockResolvedValueOnce({
      tasks: [
        {
          node: 'node1',
          id: 1,
          type: 'transport',
          action: 'indices:data/read/search',
          start_time_in_millis: 1_000_000,
          running_time_in_nanos: QUERY_ACTIVITY_MIN_RUNNING_TIME_DEFAULT_MS * 1_000_000 + 1,
          cancellable: true,
          cancelled: false,
          headers: { 'X-Opaque-Id': 'req1;kibana:application:discover:new' },
        },
      ],
    } as any);

    const response = await handler(context, createRequest(), kibanaResponseFactory);

    expect(esClient.tasks.list).toHaveBeenCalledWith({
      detailed: false,
      group_by: 'none',
      actions: [
        'indices:data/read/search',
        'indices:data/read/esql',
        'indices:data/read/esql[a]',
        'indices:data/read/eql',
        'indices:data/read/eql[a]',
        'indices:data/read/sql',
        'indices:data/read/sql[a]',
        'indices:data/read/msearch',
        'indices:data/read/async_search/submit',
      ],
      filter_path: [
        'tasks.node',
        'tasks.id',
        'tasks.action',
        'tasks.parent_task_id',
        'tasks.start_time_in_millis',
        'tasks.running_time_in_nanos',
        'tasks.cancellable',
        'tasks.cancelled',
        'tasks.headers',
      ],
    });
    expect(esClient.tasks.get).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    expect(response.payload).toEqual({
      queries: [
        {
          taskId: 'node1:1',
          queryType: 'DSL',
          source: 'Discover',
          startTime: 1_000_000,
          runningTimeMs: QUERY_ACTIVITY_MIN_RUNNING_TIME_DEFAULT_MS,
          cancellable: true,
          cancelled: false,
        },
      ],
    });
  });

  it('omits non-cancellable template wrapper tasks hidden by the original detailed list', async () => {
    const { handler, context, esClient } = setup();
    const runningTime = QUERY_ACTIVITY_MIN_RUNNING_TIME_DEFAULT_MS * 1_000_000 + 1;
    esClient.tasks.list.mockResolvedValueOnce({
      tasks: [
        {
          node: 'node1',
          id: 1,
          action: 'indices:data/read/search/template',
          start_time_in_millis: 1_000_000,
          running_time_in_nanos: runningTime,
          cancellable: false,
          headers: {},
        },
        {
          node: 'node1',
          id: 2,
          action: 'indices:data/read/msearch/template',
          start_time_in_millis: 1_000_000,
          running_time_in_nanos: runningTime,
          cancellable: false,
          headers: {},
        },
      ],
    } as any);

    const response = await handler(context, createRequest(), kibanaResponseFactory);

    expect(response.status).toBe(200);
    expect(response.payload).toEqual({ queries: [] });
  });

  it('returns an error response when ES tasks.list throws', async () => {
    const { handler, context, esClient, logger } = setup();
    const error: any = new Error('ES unavailable');
    error.statusCode = 503;
    esClient.tasks.list.mockRejectedValueOnce(error);

    const response = await handler(context, createRequest(), kibanaResponseFactory);

    expect(response.status).toBe(503);
    expect(response.payload).toEqual({ message: 'Failed to fetch query activity' });
    expect(logger.error).toHaveBeenCalled();
  });
});
