/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core/server';
import type { UserProfileServiceStart } from '@kbn/core-user-profile-server';
import type { DeeplyMockedApi } from '@kbn/core-elasticsearch-client-server-mocks';
import { httpServerMock } from '@kbn/core-http-server-mocks';
import type { PublicMethodsOf } from '@kbn/utility-types';
import { createAlertActionEventPublisher } from '../events/alert_action_event_publisher/alert_action_event_publisher.mock';
import type { AlertActionEventPublisher } from '../events/alert_action_event_publisher/alert_action_event_publisher';
import { createQueryService } from '../services/query_service/query_service.mock';
import { createStorageService } from '../services/storage_service/storage_service.mock';
import { createUserService } from '../services/user_service/user_service.mock';
import { AlertActionsClient } from './alert_actions_client';

export function createAlertActionsClient(): {
  alertActionsClient: AlertActionsClient;
  queryServiceEsClient: DeeplyMockedApi<ElasticsearchClient>;
  storageServiceEsClient: jest.Mocked<ElasticsearchClient>;
  userProfileService: jest.Mocked<UserProfileServiceStart>;
  alertActionEventPublisher: AlertActionEventPublisher;
} {
  const { queryService, mockEsClient: queryServiceEsClient } = createQueryService();
  const { storageService, mockEsClient: storageServiceEsClient } = createStorageService();
  const { userService, userProfileService } = createUserService();
  const { publisher: alertActionEventPublisher } = createAlertActionEventPublisher();
  const request = httpServerMock.createKibanaRequest();

  userProfileService.getCurrentProfileId.mockResolvedValue('test-uid');

  const alertActionsClient = new AlertActionsClient(
    queryService,
    storageService,
    userService,
    request,
    'default',
    alertActionEventPublisher
  );

  return {
    alertActionsClient,
    queryServiceEsClient,
    storageServiceEsClient,
    userProfileService,
    alertActionEventPublisher,
  };
}

export function createAlertActionsClientMock(): jest.Mocked<PublicMethodsOf<AlertActionsClient>> {
  return {
    createSeriesAction: jest.fn(),
    createEpisodeAction: jest.fn(),
    createBulkSeriesActions: jest.fn(),
    createBulkEpisodeActions: jest.fn(),
  };
}
