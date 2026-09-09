/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { kibanaResponseFactory } from '@kbn/core/server';
import { coreMock, httpServerMock, httpServiceMock } from '@kbn/core/server/mocks';
import { loggingSystemMock } from '@kbn/core-logging-server-mocks';
import { API_BASE_PATH, QUERY_ACTIVITY_MIN_RUNNING_TIME_DEFAULT_MS } from '../../common/constants';
import { registerDetailsRoute } from './details';

describe(`GET ${API_BASE_PATH}/queries/{taskId}`, () => {
  const taskId = 'node1:1';

  const setup = () => {
    const router = httpServiceMock.createRouter();
    const logger = loggingSystemMock.createLogger();

    registerDetailsRoute({ router, logger });

    const [[_config, handler]] = router.get.mock.calls;
    const coreContext = coreMock.createRequestHandlerContext();
    const context = coreMock.createCustomRequestHandlerContext({ core: coreContext });
    const esClient = coreContext.elasticsearch.client.asInternalUser;
    const hasPrivileges = jest.fn().mockResolvedValue({ cluster: { monitor: true } });
    const asCurrentUser = coreContext.elasticsearch.client.asCurrentUser as any;
    jest.spyOn(asCurrentUser, 'security', 'get').mockReturnValue({ hasPrivileges });

    return { handler, context, esClient, hasPrivileges, logger };
  };

  const createRequest = () =>
    httpServerMock.createKibanaRequest({
      method: 'get',
      path: `${API_BASE_PATH}/queries/${taskId}`,
      params: { taskId },
    });

  it('returns details for one running query', async () => {
    const { handler, context, esClient } = setup();
    esClient.tasks.get.mockResolvedValueOnce({
      completed: false,
      task: {
        node: 'node1',
        id: 1,
        type: 'transport',
        action: 'indices:data/read/search',
        start_time_in_millis: 1_000_000,
        running_time_in_nanos: QUERY_ACTIVITY_MIN_RUNNING_TIME_DEFAULT_MS * 1_000_000 + 1,
        cancellable: true,
        cancelled: false,
        headers: { 'X-Opaque-Id': 'req1;kibana:application:discover:new' },
        description: 'indices[test], source[{"query":{"match_all":{}}}]',
      },
    } as any);

    const response = await handler(context, createRequest(), kibanaResponseFactory);

    expect(esClient.tasks.get).toHaveBeenCalledWith({
      task_id: taskId,
      wait_for_completion: false,
      filter_path: [
        'completed',
        'task.node',
        'task.id',
        'task.action',
        'task.description',
        'task.start_time_in_millis',
        'task.running_time_in_nanos',
        'task.cancellable',
        'task.cancelled',
        'task.headers',
        'task.parent_task_id',
      ],
    });
    expect(response.status).toBe(200);
    expect(response.payload).toEqual({
      query: expect.objectContaining({
        taskId,
        source: 'Discover',
        indices: 1,
        query: '{"query":{"match_all":{}}}',
      }),
    });
  });

  it.each([
    ['the task API returns 404', () => Promise.reject({ meta: { statusCode: 404 } })],
    [
      'the task completed',
      () =>
        Promise.resolve({
          completed: true,
          task: {},
        }),
    ],
  ])('returns not found when %s', async (_name, getResult) => {
    const { handler, context, esClient } = setup();
    esClient.tasks.get.mockReturnValueOnce(getResult() as any);

    const response = await handler(context, createRequest(), kibanaResponseFactory);

    expect(response.status).toBe(404);
    expect(response.payload).toEqual({
      message: 'Query not found or already completed',
      attributes: {
        code: 'QUERY_NOT_FOUND',
      },
    });
  });

  it('returns forbidden without the Elasticsearch monitor privilege', async () => {
    const { handler, context, esClient, hasPrivileges } = setup();
    hasPrivileges.mockResolvedValueOnce({ cluster: { monitor: false } });

    const response = await handler(context, createRequest(), kibanaResponseFactory);

    expect(response.status).toBe(403);
    expect(esClient.tasks.get).not.toHaveBeenCalled();
  });

  it('preserves non-404 Elasticsearch errors', async () => {
    const { handler, context, esClient, logger } = setup();
    esClient.tasks.get.mockRejectedValueOnce({ meta: { statusCode: 503 } });

    const response = await handler(context, createRequest(), kibanaResponseFactory);

    expect(response.status).toBe(503);
    expect(response.payload).toEqual({ message: 'Failed to fetch query details' });
    expect(logger.error).toHaveBeenCalled();
  });
});
