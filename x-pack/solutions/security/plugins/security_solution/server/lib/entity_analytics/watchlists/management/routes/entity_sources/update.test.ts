/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggerMock } from '@kbn/logging-mocks';
import { WATCHLISTS_DATA_SOURCE_URL } from '../../../../../../../common/constants';
import {
  serverMock,
  requestContextMock,
  requestMock,
} from '../../../../../detection_engine/routes/__mocks__';

jest.mock('../../../entity_sources/infra/entity_source_client');

const { mockUpdateEntitySource } = jest.requireMock(
  '../../../entity_sources/infra/entity_source_client'
) as {
  mockUpdateEntitySource: jest.Mock;
};

const mockGetStartServices = jest.fn();

import { updateEntitySourceRoute } from './update';

const WATCHLIST_ID = 'wl-1';
const SOURCE_ID = 'src-1';
const DATA_SOURCE_URL = WATCHLISTS_DATA_SOURCE_URL.replace('{watchlist_id}', WATCHLIST_ID);

describe('PUT entity source route - updateEntitySourceRoute', () => {
  let server: ReturnType<typeof serverMock.create>;
  let context: ReturnType<typeof requestContextMock.convertContext>;
  let logger: ReturnType<typeof loggerMock.create>;

  beforeEach(() => {
    server = serverMock.create();
    logger = loggerMock.create();
    const { context: ctx } = requestContextMock.createTools();
    context = requestContextMock.convertContext(ctx);

    mockUpdateEntitySource.mockReset();

    const mockSecurity = { authc: { apiKeys: { invalidateAsInternalUser: jest.fn() } } };
    mockGetStartServices.mockResolvedValue([{ security: mockSecurity }]);

    updateEntitySourceRoute(server.router, logger, mockGetStartServices, true);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const buildRequest = (body: object, id = SOURCE_ID) =>
    requestMock.create({
      method: 'put',
      path: `${DATA_SOURCE_URL}/${id}`,
      params: { watchlist_id: WATCHLIST_ID, id },
      body,
    });

  it('updates an entity source', async () => {
    const updateBody = { name: 'updated-name' };
    const updateResult = { id: SOURCE_ID, type: 'store', name: 'updated-name' };
    mockUpdateEntitySource.mockResolvedValue(updateResult);

    const response = await server.inject(buildRequest(updateBody), context);

    expect(response.status).toEqual(200);
    expect(response.body).toEqual(updateResult);
    expect(mockUpdateEntitySource).toHaveBeenCalledWith(
      { ...updateBody, id: SOURCE_ID },
      expect.anything()
    );
  });

  it('fails when client.update fails', async () => {
    const ERROR_MESSAGE = 'update failed';
    mockUpdateEntitySource.mockRejectedValue(new Error(ERROR_MESSAGE));

    const response = await server.inject(buildRequest({ name: 'x' }), context);

    expect(response.status).toEqual(500);
    expect(response.body).toEqual(expect.objectContaining({ message: ERROR_MESSAGE }));
  });
});
