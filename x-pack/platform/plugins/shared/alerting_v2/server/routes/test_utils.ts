/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaResponseFactory } from '@kbn/core-http-server';
import type { Logger } from '@kbn/logging';
import { httpServerMock } from '@kbn/core-http-server-mocks';
import { loggerMock } from '@kbn/logging-mocks';
import {
  createSettingsService,
  type MockUiSettingsClient,
} from '../lib/services/settings_service/settings_service.mock';
import type { AlertingRouteContext } from './alerting_route_context';

interface RouteDependencyMocks {
  ctx: AlertingRouteContext;
  response: jest.Mocked<KibanaResponseFactory>;
  logger: jest.Mocked<Logger>;
  mockUiSettingsClient: MockUiSettingsClient;
}

export function createAlertingRouteContext(): {
  ctx: AlertingRouteContext;
  mockUiSettingsClient: MockUiSettingsClient;
} {
  const { settingsService, mockUiSettingsClient } = createSettingsService();
  mockUiSettingsClient.get.mockResolvedValue(true);

  const ctx: AlertingRouteContext = {
    response: httpServerMock.createResponseFactory(),
    logger: loggerMock.create(),
    settings: settingsService,
  };

  return { ctx, mockUiSettingsClient };
}

export function createRouteDependencies(): RouteDependencyMocks {
  const { ctx, mockUiSettingsClient } = createAlertingRouteContext();

  return {
    ctx,
    response: ctx.response as jest.Mocked<KibanaResponseFactory>,
    logger: ctx.logger as jest.Mocked<Logger>,
    mockUiSettingsClient,
  };
}
