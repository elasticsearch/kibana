/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { coreMock } from '@kbn/core/server/mocks';
import { httpServerMock } from '@kbn/core-http-server-mocks';
import { loggingSystemMock } from '@kbn/core-logging-server-mocks';
import { CasesClientFactory } from './factory';
import { createCasesClientFactoryMockArgs } from './mocks';
import { createCasesClient } from './client';
import type { FakeRawRequest } from '@kbn/core-http-server';
import { kibanaRequestFactory } from '@kbn/core-http-server-utils';

jest.mock('./client');

describe('CasesClientFactory', () => {
  const coreStart = coreMock.createStart();
  const request = httpServerMock.createKibanaRequest();

  const rawRequest: FakeRawRequest = {
    headers: {},
  };

  const fakeRequest = kibanaRequestFactory(rawRequest);
  const createCasesClientMocked = createCasesClient as jest.Mock;
  const logger = loggingSystemMock.createLogger();
  const args = createCasesClientFactoryMockArgs();
  let casesClientFactory: CasesClientFactory;

  args.featuresPluginStart.getKibanaFeatures.mockReturnValue([]);

  beforeEach(() => {
    casesClientFactory = new CasesClientFactory(logger);
    casesClientFactory.initialize(args);
    jest.clearAllMocks();
  });

  it('propagates the client source to the cases client', async () => {
    const scopedClusterClient = coreStart.elasticsearch.client.asScoped(request).asCurrentUser;

    await casesClientFactory.create({
      request,
      savedObjectsService: coreStart.savedObjects,
      scopedClusterClient,
      clientSource: 'workflow',
    });

    expect(createCasesClientMocked).toHaveBeenCalledWith(
      expect.objectContaining({ clientSource: 'workflow' })
    );
  });

  it('creates a workflow run context with a client and request-scoped operations', async () => {
    const casesClient = {};
    createCasesClientMocked.mockReturnValue(casesClient);
    const scopedClusterClient = coreStart.elasticsearch.client.asScoped(request).asCurrentUser;

    const context = await casesClientFactory.createWorkflowRunContext({
      request,
      savedObjectsService: coreStart.savedObjects,
      scopedClusterClient,
      clientSource: 'rest_api',
    });

    expect(context.casesClient).toBe(casesClient);
    expect(context.workflowOperations).toEqual({
      ensureAuthorizedToRunWorkflow: expect.any(Function),
      preflightWorkflowExecution: expect.any(Function),
      recordWorkflowExecution: expect.any(Function),
    });
  });

  describe('user info', () => {
    it('constructs the user info from user profiles', async () => {
      const scopedClusterClient = coreStart.elasticsearch.client.asScoped(request).asCurrentUser;
      args.securityPluginStart.userProfiles.getCurrent.mockResolvedValueOnce({
        // @ts-expect-error: not all fields are needed
        user: { username: 'my_user', full_name: 'My user', email: 'elastic@elastic.co' },
      });

      await casesClientFactory.create({
        request,
        savedObjectsService: coreStart.savedObjects,
        scopedClusterClient,
        clientSource: 'rest_api',
      });

      expect(args.securityPluginStart.userProfiles.getCurrent).toHaveBeenCalled();
      expect(args.securityServiceStart.authc.getCurrentUser).not.toHaveBeenCalled();
      expect(createCasesClientMocked.mock.calls[0][0].user).toEqual({
        username: 'my_user',
        full_name: 'My user',
        email: 'elastic@elastic.co',
      });
    });

    it('constructs the user info from the authc service if the user profile is not available', async () => {
      const scopedClusterClient = coreStart.elasticsearch.client.asScoped(request).asCurrentUser;
      // @ts-expect-error: not all fields are needed
      args.securityServiceStart.authc.getCurrentUser.mockReturnValueOnce({
        username: 'my_user_2',
        full_name: 'My user 2',
        email: 'elastic2@elastic.co',
      });

      await casesClientFactory.create({
        request,
        savedObjectsService: coreStart.savedObjects,
        scopedClusterClient,
        clientSource: 'rest_api',
      });

      expect(args.securityPluginStart.userProfiles.getCurrent).toHaveBeenCalled();
      expect(args.securityServiceStart.authc.getCurrentUser).toHaveBeenCalled();
      expect(createCasesClientMocked.mock.calls[0][0].user).toEqual({
        username: 'my_user_2',
        full_name: 'My user 2',
        email: 'elastic2@elastic.co',
      });
    });

    it('constructs the user info from fake requests correctly', async () => {
      const scopedClusterClient =
        coreStart.elasticsearch.client.asScoped(fakeRequest).asCurrentUser;

      await casesClientFactory.create({
        request: fakeRequest,
        savedObjectsService: coreStart.savedObjects,
        scopedClusterClient,
        clientSource: 'rest_api',
      });

      expect(args.securityPluginStart.userProfiles.getCurrent).toHaveBeenCalled();
      expect(args.securityServiceStart.authc.getCurrentUser).toHaveBeenCalled();
      expect(createCasesClientMocked.mock.calls[0][0].user).toEqual({
        username: 'elastic/kibana',
        full_name: null,
        email: null,
      });
    });

    it('return null for all user fields if it cannot find the user info', async () => {
      const scopedClusterClient = coreStart.elasticsearch.client.asScoped(request).asCurrentUser;

      await casesClientFactory.create({
        request,
        savedObjectsService: coreStart.savedObjects,
        scopedClusterClient,
        clientSource: 'rest_api',
      });

      expect(args.securityPluginStart.userProfiles.getCurrent).toHaveBeenCalled();
      expect(args.securityServiceStart.authc.getCurrentUser).toHaveBeenCalled();
      expect(createCasesClientMocked.mock.calls[0][0].user).toEqual({
        username: null,
        full_name: null,
        email: null,
      });
    });
  });
});
