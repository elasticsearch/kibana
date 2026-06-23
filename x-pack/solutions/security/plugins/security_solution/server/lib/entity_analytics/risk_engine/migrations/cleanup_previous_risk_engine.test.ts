/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { cleanupLegacyRiskEngine } from './cleanup_previous_risk_engine';
import { coreMock, loggingSystemMock, savedObjectsClientMock } from '@kbn/core/server/mocks';
import { elasticsearchServiceMock } from '@kbn/core-elasticsearch-server-mocks';
import { getLatestTransformId } from '../../utils/transforms';

const mockStopTransform = jest.fn();
const mockDeleteTransform = jest.fn();
const mockRemoveRiskScoringTask = jest.fn();

jest.mock('../../utils/transforms', () => ({
  ...jest.requireActual('../../utils/transforms'),
  stopTransform: (...args: unknown[]) => mockStopTransform(...args),
  deleteTransform: (...args: unknown[]) => mockDeleteTransform(...args),
}));

jest.mock('../../risk_score/tasks/risk_scoring_task', () => ({
  ...jest.requireActual('../../risk_score/tasks/risk_scoring_task'),
  removeRiskScoringTask: (...args: unknown[]) => mockRemoveRiskScoringTask(...args),
}));

describe('cleanupLegacyRiskEngine', () => {
  const logger = loggingSystemMock.createLogger();
  const coreStart = coreMock.createStart();
  const soClient = savedObjectsClientMock.create();
  const esClient = elasticsearchServiceMock.createElasticsearchClient();
  const taskManager = { remove: jest.fn() };

  const mockSavedObjectsResponseDefaults = {
    total: 0,
    page: 1,
    per_page: 10,
    saved_objects: [],
  };

  const getStartServicesMock = jest.fn();

  const buildSavedObject = (namespace: string) => ({
    namespaces: [namespace],
    attributes: {},
    id: 'id',
    type: 'type',
    references: [],
    score: 1,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockStopTransform.mockResolvedValue(undefined);
    mockDeleteTransform.mockResolvedValue(undefined);
    mockRemoveRiskScoringTask.mockResolvedValue(undefined);
    getStartServicesMock.mockResolvedValue([
      {
        ...coreStart,
        savedObjects: {
          createInternalRepository: jest.fn().mockReturnValue(soClient),
        },
        elasticsearch: { client: { asInternalUser: esClient } },
      },
      { taskManager },
    ]);
  });

  it('stops and deletes the latest transform and removes the risk scoring task per namespace', async () => {
    soClient.find.mockResolvedValue({
      ...mockSavedObjectsResponseDefaults,
      saved_objects: [buildSavedObject('default'), buildSavedObject('space-a')],
    });

    await cleanupLegacyRiskEngine({
      logger,
      getStartServices: getStartServicesMock,
      auditLogger: undefined,
      kibanaVersion: '9.0.0',
      hasEncryptionKey: true,
    });

    expect(mockStopTransform).toHaveBeenCalledTimes(2);
    expect(mockDeleteTransform).toHaveBeenCalledTimes(2);
    expect(mockRemoveRiskScoringTask).toHaveBeenCalledTimes(2);

    expect(mockStopTransform).toHaveBeenCalledWith({
      esClient,
      logger,
      transformId: getLatestTransformId('default'),
    });
    expect(mockStopTransform).toHaveBeenCalledWith({
      esClient,
      logger,
      transformId: getLatestTransformId('space-a'),
    });

    expect(mockDeleteTransform).toHaveBeenCalledWith({
      esClient,
      logger,
      transformId: getLatestTransformId('default'),
    });
    expect(mockDeleteTransform).toHaveBeenCalledWith({
      esClient,
      logger,
      transformId: getLatestTransformId('space-a'),
    });

    expect(mockRemoveRiskScoringTask).toHaveBeenCalledWith({
      logger,
      namespace: 'default',
      taskManager,
    });
    expect(mockRemoveRiskScoringTask).toHaveBeenCalledWith({
      logger,
      namespace: 'space-a',
      taskManager,
    });
  });

  it('does nothing when no risk engine configurations exist', async () => {
    soClient.find.mockResolvedValue(mockSavedObjectsResponseDefaults);

    await cleanupLegacyRiskEngine({
      logger,
      getStartServices: getStartServicesMock,
      auditLogger: undefined,
      kibanaVersion: '9.0.0',
      hasEncryptionKey: true,
    });

    expect(mockStopTransform).not.toHaveBeenCalled();
    expect(mockDeleteTransform).not.toHaveBeenCalled();
    expect(mockRemoveRiskScoringTask).not.toHaveBeenCalled();
  });

  it('logs a warning and skips cleanup when Task Manager is unavailable', async () => {
    getStartServicesMock.mockResolvedValue([
      {
        ...coreStart,
        savedObjects: {
          createInternalRepository: jest.fn().mockReturnValue(soClient),
        },
        elasticsearch: { client: { asInternalUser: esClient } },
      },
      { taskManager: undefined },
    ]);
    soClient.find.mockResolvedValue({
      ...mockSavedObjectsResponseDefaults,
      saved_objects: [buildSavedObject('default')],
    });

    await cleanupLegacyRiskEngine({
      logger,
      getStartServices: getStartServicesMock,
      auditLogger: undefined,
      kibanaVersion: '9.0.0',
      hasEncryptionKey: true,
    });

    expect(logger.warn).toHaveBeenCalledWith(
      'Task Manager is unavailable; skipping legacy risk engine cleanup (transform + task removal).'
    );
    expect(soClient.find).not.toHaveBeenCalled();
    expect(mockStopTransform).not.toHaveBeenCalled();
    expect(mockDeleteTransform).not.toHaveBeenCalled();
    expect(mockRemoveRiskScoringTask).not.toHaveBeenCalled();
  });

  it('continues when stopTransform fails and still deletes the transform and removes the task', async () => {
    mockStopTransform.mockRejectedValueOnce(new Error('stop failed'));
    soClient.find.mockResolvedValue({
      ...mockSavedObjectsResponseDefaults,
      saved_objects: [buildSavedObject('default')],
    });

    await cleanupLegacyRiskEngine({
      logger,
      getStartServices: getStartServicesMock,
      auditLogger: undefined,
      kibanaVersion: '9.0.0',
      hasEncryptionKey: true,
    });

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to stop legacy latest transform')
    );
    expect(mockDeleteTransform).toHaveBeenCalledTimes(1);
    expect(mockRemoveRiskScoringTask).toHaveBeenCalledTimes(1);
  });

  it('processes the next namespace when one namespace hits a failure during task removal', async () => {
    mockRemoveRiskScoringTask
      .mockRejectedValueOnce(new Error('remove failed'))
      .mockResolvedValueOnce(undefined);
    soClient.find.mockResolvedValue({
      ...mockSavedObjectsResponseDefaults,
      saved_objects: [buildSavedObject('default'), buildSavedObject('space-b')],
    });

    await cleanupLegacyRiskEngine({
      logger,
      getStartServices: getStartServicesMock,
      auditLogger: undefined,
      kibanaVersion: '9.0.0',
      hasEncryptionKey: true,
    });

    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('remove failed'));
    expect(mockRemoveRiskScoringTask).toHaveBeenCalledTimes(2);
    expect(mockStopTransform).toHaveBeenCalledTimes(2);
  });
});
