/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type {
  ElasticsearchClient,
  KibanaRequest,
  SavedObjectsClientContract,
} from '@kbn/core/server';
import type { DataViewsServerPluginStart } from '@kbn/data-views-plugin/server';
import { loggerMock } from '@kbn/logging-mocks';
import { ExecutionDataViewsBootstrap } from './execution_data_views_bootstrap';
import { WORKFLOWS_EXECUTIONS_INDEX, WORKFLOWS_STEP_EXECUTIONS_INDEX } from '../common';

const flushPromises = async (): Promise<void> => {
  await new Promise<void>((resolve) => setImmediate(resolve));
};

describe('ExecutionDataViewsBootstrap', () => {
  const savedObjectsClient = {} as SavedObjectsClientContract;
  const esClient = {} as ElasticsearchClient;
  const request = {} as KibanaRequest;

  const createDataViewsPlugin = (dataViewsService: {
    get: jest.Mock;
    create: jest.Mock;
    createSavedObject: jest.Mock;
  }) =>
    ({
      dataViewsServiceFactory: jest.fn().mockResolvedValue(dataViewsService),
    } as unknown as DataViewsServerPluginStart);

  it('creates two managed data views for the space', async () => {
    const dataViewsService = {
      get: jest.fn().mockRejectedValue(new Error('Saved object [index-pattern/id] not found')),
      create: jest.fn().mockImplementation(async (spec) => spec),
      createSavedObject: jest.fn().mockResolvedValue(undefined),
    };
    const bootstrap = new ExecutionDataViewsBootstrap(
      createDataViewsPlugin(dataViewsService),
      loggerMock.create()
    );

    bootstrap.ensureForSpaceFireAndForget('marketing', savedObjectsClient, esClient, request);
    await flushPromises();

    expect(dataViewsService.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        id: 'workflows-executions-managed-marketing',
        title: WORKFLOWS_EXECUTIONS_INDEX,
        timeFieldName: 'startedAt',
        allowNoIndex: true,
        managed: true,
        namespaces: ['marketing'],
      }),
      true
    );
    expect(dataViewsService.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        id: 'workflows-step-executions-managed-marketing',
        title: WORKFLOWS_STEP_EXECUTIONS_INDEX,
        managed: true,
        namespaces: ['marketing'],
      }),
      true
    );
    expect(dataViewsService.createSavedObject).toHaveBeenCalledTimes(2);
  });

  it('deduplicates concurrent requests for one space', async () => {
    const dataViewsService = {
      get: jest.fn().mockResolvedValue({ id: 'existing' }),
      create: jest.fn(),
      createSavedObject: jest.fn(),
    };
    const dataViewsPlugin = createDataViewsPlugin(dataViewsService);
    const bootstrap = new ExecutionDataViewsBootstrap(dataViewsPlugin, loggerMock.create());

    bootstrap.ensureForSpaceFireAndForget('marketing', savedObjectsClient, esClient, request);
    bootstrap.ensureForSpaceFireAndForget('marketing', savedObjectsClient, esClient, request);
    await flushPromises();

    expect(dataViewsPlugin.dataViewsServiceFactory).toHaveBeenCalledTimes(1);
  });

  it('accepts a duplicate error only when the expected ID exists', async () => {
    const duplicateError = Object.assign(new Error('duplicate data view'), {
      name: 'DuplicateDataViewError',
    });
    const dataViewsService = {
      get: jest
        .fn()
        .mockRejectedValueOnce(new Error('Saved object not found'))
        .mockResolvedValue({ id: 'workflows-executions-managed-marketing' }),
      create: jest.fn().mockImplementation(async (spec) => spec),
      createSavedObject: jest.fn().mockRejectedValue(duplicateError),
    };
    const dataViewsPlugin = createDataViewsPlugin(dataViewsService);
    const logger = loggerMock.create();
    const bootstrap = new ExecutionDataViewsBootstrap(dataViewsPlugin, logger);

    bootstrap.ensureForSpaceFireAndForget('marketing', savedObjectsClient, esClient, request);
    await flushPromises();
    bootstrap.ensureForSpaceFireAndForget('marketing', savedObjectsClient, esClient, request);
    await flushPromises();

    expect(dataViewsPlugin.dataViewsServiceFactory).toHaveBeenCalledTimes(1);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('does not cache a duplicate name with a different ID', async () => {
    const duplicateError = Object.assign(new Error('duplicate data view'), {
      name: 'DuplicateDataViewError',
    });
    const dataViewsService = {
      get: jest.fn().mockRejectedValue(new Error('Saved object not found')),
      create: jest.fn().mockImplementation(async (spec) => spec),
      createSavedObject: jest.fn().mockRejectedValue(duplicateError),
    };
    const dataViewsPlugin = createDataViewsPlugin(dataViewsService);
    const logger = loggerMock.create();
    const bootstrap = new ExecutionDataViewsBootstrap(dataViewsPlugin, logger);

    bootstrap.ensureForSpaceFireAndForget('marketing', savedObjectsClient, esClient, request);
    await flushPromises();
    bootstrap.ensureForSpaceFireAndForget('marketing', savedObjectsClient, esClient, request);
    await flushPromises();

    expect(dataViewsPlugin.dataViewsServiceFactory).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('duplicate data view'));
  });

  it('does not cache a failed bootstrap', async () => {
    const dataViewsService = {
      get: jest
        .fn()
        .mockRejectedValueOnce(new Error('unavailable'))
        .mockResolvedValue({ id: 'existing' }),
      create: jest.fn(),
      createSavedObject: jest.fn(),
    };
    const dataViewsPlugin = createDataViewsPlugin(dataViewsService);
    const logger = loggerMock.create();
    const bootstrap = new ExecutionDataViewsBootstrap(dataViewsPlugin, logger);

    bootstrap.ensureForSpaceFireAndForget('marketing', savedObjectsClient, esClient, request);
    await flushPromises();
    bootstrap.ensureForSpaceFireAndForget('marketing', savedObjectsClient, esClient, request);
    await flushPromises();

    expect(dataViewsPlugin.dataViewsServiceFactory).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('unavailable'));
  });
});
