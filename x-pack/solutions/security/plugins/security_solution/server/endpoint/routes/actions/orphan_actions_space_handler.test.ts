/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { HttpApiTestSetupMock } from '../../mocks';
import { createHttpApiTestSetupMock } from '../../mocks';
import type { UpdateOrphanActionsSpaceBody } from './orphan_actions_space_handler';
import {
  registerOrphanActionsSpaceRoute,
  UpdateOrphanActionsSpaceSchema,
} from './orphan_actions_space_handler';
import { ORPHAN_ACTIONS_SPACE_ROUTE } from '../../../../common/endpoint/constants';
import type { RequestHandler, SavedObjectsClientContract } from '@kbn/core/server';
import type { DeeplyMockedKeys } from '@kbn/utility-types-jest';
import type { ReferenceDataClientInterface } from '../../lib/reference_data';
import { REF_DATA_KEY_INITIAL_VALUE, REF_DATA_KEYS } from '../../lib/reference_data';
import type { ExperimentalFeatures } from '../../../../common';

describe('Orphan response action APIs', () => {
  let endpointServiceMock: HttpApiTestSetupMock['endpointAppContextMock']['service'];
  let apiTestSetup: HttpApiTestSetupMock<never, never, UpdateOrphanActionsSpaceBody | never>;
  let httpRequestMock: ReturnType<
    HttpApiTestSetupMock<never, never, UpdateOrphanActionsSpaceBody>['createRequestMock']
  >;
  let httpHandlerContextMock: HttpApiTestSetupMock<
    never,
    never,
    UpdateOrphanActionsSpaceBody | never
  >['httpHandlerContextMock'];
  let httpResponseMock: HttpApiTestSetupMock<
    never,
    never,
    UpdateOrphanActionsSpaceBody
  >['httpResponseMock'];

  beforeEach(async () => {
    apiTestSetup = createHttpApiTestSetupMock<never, never, UpdateOrphanActionsSpaceBody | never>();
    ({ httpHandlerContextMock, httpResponseMock } = apiTestSetup);
    endpointServiceMock = apiTestSetup.endpointAppContextMock.service;

    registerOrphanActionsSpaceRoute(
      apiTestSetup.routerMock,
      apiTestSetup.endpointAppContextMock.service
    );

    const refDataClient =
      endpointServiceMock.getReferenceDataClient() as DeeplyMockedKeys<ReferenceDataClientInterface>;
    refDataClient.get.mockResolvedValue(
      await REF_DATA_KEY_INITIAL_VALUE[REF_DATA_KEYS.orphanResponseActionsSpace](
        {} as SavedObjectsClientContract,
        {} as ExperimentalFeatures
      )
    );
  });

  describe('GET: read orphan response actions space', () => {
    let readHandler: RequestHandler;

    beforeEach(() => {
      httpRequestMock = apiTestSetup.createRequestMock();

      readHandler = apiTestSetup.getRegisteredVersionedRoute(
        'get',
        ORPHAN_ACTIONS_SPACE_ROUTE,
        '1'
      ).routeHandler;
    });

    it('should require `canReadAdminData` privilege', async () => {
      (await endpointServiceMock.getEndpointAuthz(httpRequestMock)).canReadAdminData = false;

      await readHandler(httpHandlerContextMock, httpRequestMock, httpResponseMock);

      expect(httpResponseMock.forbidden).toHaveBeenCalledWith({
        body: expect.objectContaining({ message: 'Endpoint authorization failure' }),
      });
    });

    it('should return expected response', async () => {
      await readHandler(httpHandlerContextMock, httpRequestMock, httpResponseMock);

      expect(httpResponseMock.ok).toHaveBeenCalledWith({
        body: { data: { spaceId: '' } },
      });
    });
  });

  describe('POST: update orphan response actions space', () => {
    let writeHandler: RequestHandler;

    beforeEach(() => {
      httpRequestMock = apiTestSetup.createRequestMock();

      writeHandler = apiTestSetup.getRegisteredVersionedRoute(
        'post',
        ORPHAN_ACTIONS_SPACE_ROUTE,
        '1'
      ).routeHandler;

      httpRequestMock.body = { spaceId: 'foo' };
    });

    it('should require `canWriteAdminData` privilege', async () => {
      (await endpointServiceMock.getEndpointAuthz(httpRequestMock)).canWriteAdminData = false;

      await writeHandler(httpHandlerContextMock, httpRequestMock, httpResponseMock);

      expect(httpResponseMock.forbidden).toHaveBeenCalledWith({
        body: expect.objectContaining({ message: 'Endpoint authorization failure' }),
      });
    });

    it('should update space id to reference data and return expected response', async () => {
      await writeHandler(httpHandlerContextMock, httpRequestMock, httpResponseMock);

      expect(httpResponseMock.ok).toHaveBeenCalledWith({
        body: { data: { spaceId: 'foo' } },
      });
    });
  });

  describe('POST body schema', () => {
    it('should accept a valid `spaceId`', () => {
      expect(() => UpdateOrphanActionsSpaceSchema.body.validate({ spaceId: 'foo' })).not.toThrow();
    });

    it('should accept a `spaceId` of the max allowed length', () => {
      expect(() =>
        UpdateOrphanActionsSpaceSchema.body.validate({ spaceId: 'a'.repeat(1024) })
      ).not.toThrow();
    });

    it('should error if `spaceId` is longer than 1024 characters', () => {
      expect(() =>
        UpdateOrphanActionsSpaceSchema.body.validate({ spaceId: 'a'.repeat(1025) })
      ).toThrow(/\[spaceId]:/);
    });
  });
});
