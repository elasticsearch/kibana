/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { httpServerMock } from '@kbn/core-http-server-mocks';
import type { PluginInitializerContext, SavedObjectsClientContract } from '@kbn/core/server';
import { taskManagerMock } from '@kbn/task-manager-plugin/server/mocks';
import type { PluginConfig } from '../../config';
import { createRulesSavedObjectService } from '../services/rules_saved_object_service/rules_saved_object_service.mock';
import { createUserService } from '../services/user_service/user_service.mock';
import { RulesClient } from './rules_client';

export function createRulesClient(): {
  rulesClient: RulesClient;
  mockSavedObjectsClient: jest.Mocked<SavedObjectsClientContract>;
} {
  const { rulesSavedObjectService, mockSavedObjectsClient } = createRulesSavedObjectService();
  const request = httpServerMock.createKibanaRequest();
  const taskManager = taskManagerMock.createStart();
  const { userService } = createUserService();

  const config = {
    enabled: true,
    invalidateApiKeysTask: { interval: '5m', removalDelay: '1h' },
    rules: { minimumScheduleInterval: '1m', maxScheduledPerMinute: 400 },
  } as PluginConfig;

  const pluginConfigAccessor = {
    get: () => config,
  } as unknown as PluginInitializerContext<PluginConfig>['config'];

  const rulesClient = new RulesClient(
    request,
    rulesSavedObjectService,
    taskManager,
    userService,
    'default',
    pluginConfigAccessor,
    rulesSavedObjectService
  );

  return { rulesClient, mockSavedObjectsClient };
}
