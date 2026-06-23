/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { updateRiskScoreMappings } from './update_risk_score_mappings';
import { coreMock, loggingSystemMock, savedObjectsClientMock } from '@kbn/core/server/mocks';
import { elasticsearchServiceMock } from '@kbn/core-elasticsearch-server-mocks';
import { auditLoggerMock } from '@kbn/core-security-server-mocks';

const mockCreateOrUpdateComponentTemplate = jest.fn();
const mockCreateOrUpdateIndex = jest.fn();
const mockRolloverDataStream = jest.fn();

jest.mock('@kbn/alerting-plugin/server', () => ({
  createOrUpdateComponentTemplate: (...params: unknown[]) =>
    mockCreateOrUpdateComponentTemplate(...params),
  createOrUpdateIndexTemplate: jest.fn(),
}));

jest.mock('../../utils/create_or_update_index', () => ({
  createOrUpdateIndex: (...params: unknown[]) => mockCreateOrUpdateIndex(...params),
}));

jest.mock('../../utils/create_datastream', () => ({
  rolloverDataStream: (...params: unknown[]) => mockRolloverDataStream(...params),
}));

const mockGetDefaultRiskEngineConfiguration = jest.fn();
const mockUpdateSavedObjectAttribute = jest.fn();
jest.mock('../utils/saved_object_configuration', () => ({
  ...jest.requireActual('../utils/saved_object_configuration'),
  getDefaultRiskEngineConfiguration: () => mockGetDefaultRiskEngineConfiguration(),
  updateSavedObjectAttribute: (...params: unknown[]) => mockUpdateSavedObjectAttribute(...params),
}));

describe('updateRiskScoreMappings', () => {
  const logger = loggingSystemMock.createLogger();
  const mockAuditLogger = auditLoggerMock.create();
  const coreStart = coreMock.createStart();
  const soClient = savedObjectsClientMock.create();
  const esClient = elasticsearchServiceMock.createElasticsearchClient();

  const getStartServicesMock = jest.fn().mockReturnValue([
    {
      ...coreStart,
      savedObjects: {
        createInternalRepository: jest.fn().mockReturnValue(soClient),
        getScopedClient: jest.fn().mockReturnValue(soClient),
      },
      elasticsearch: { client: { asInternalUser: esClient } },
    },
  ]);
  const kibanaVersion = '8.0.0';

  const buildSavedObject = (attributes = {}) => ({
    namespaces: ['default'],
    attributes,
    id: 'id',
    type: 'type',
    references: [],
    score: 1,
  });

  const mockSavedObjectsResponseDefaults = {
    total: 1,
    page: 1,
    per_page: 10,
    saved_objects: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should update risk score mappings when versions are different', async () => {
    const mockSavedObjectsResponse = {
      ...mockSavedObjectsResponseDefaults,
      saved_objects: [buildSavedObject({ _meta: { mappingsVersion: '1.0.0' } })],
    };

    soClient.find.mockResolvedValue(mockSavedObjectsResponse);

    const newConfig = { _meta: { mappingsVersion: '2.0.0' } };
    mockGetDefaultRiskEngineConfiguration.mockResolvedValue(newConfig);

    await updateRiskScoreMappings({
      auditLogger: mockAuditLogger,
      logger,
      kibanaVersion,
      getStartServices: getStartServicesMock,
      hasEncryptionKey: true,
    });

    expect(mockCreateOrUpdateIndex).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({ index: 'risk-score.risk-score-latest-default' }),
      })
    );
    expect(mockCreateOrUpdateComponentTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        template: expect.objectContaining({ name: '.risk-score-mappings-default' }),
      })
    );
    expect(mockRolloverDataStream).toHaveBeenCalledWith(
      expect.objectContaining({ dataStreamName: 'risk-score.risk-score-default' })
    );
    expect(mockUpdateSavedObjectAttribute).toHaveBeenCalledWith(
      expect.objectContaining({ attributes: { _meta: { mappingsVersion: '2.0.0' } } })
    );
  });

  it('should not update risk score mappings when versions are the same', async () => {
    const savedObjectsResponse = {
      ...mockSavedObjectsResponseDefaults,
      saved_objects: [buildSavedObject({ _meta: { mappingsVersion: '2.0.0' } })],
    };
    soClient.find.mockResolvedValue(savedObjectsResponse);

    const newConfig = { _meta: { mappingsVersion: '2.0.0' } };
    mockGetDefaultRiskEngineConfiguration.mockResolvedValue(newConfig);

    await updateRiskScoreMappings({
      auditLogger: mockAuditLogger,
      logger,
      getStartServices: getStartServicesMock,
      kibanaVersion,
      hasEncryptionKey: true,
    });

    expect(mockCreateOrUpdateIndex).not.toHaveBeenCalled();
    expect(mockCreateOrUpdateComponentTemplate).not.toHaveBeenCalled();
    expect(mockRolloverDataStream).not.toHaveBeenCalled();
    expect(mockUpdateSavedObjectAttribute).not.toHaveBeenCalled();
  });

  it('should update risk score mappings for every space when versions are different', async () => {
    const mockSavedObjectsResponse = {
      ...mockSavedObjectsResponseDefaults,
      saved_objects: [
        buildSavedObject({ _meta: { mappingsVersion: '1.0.0' } }),
        buildSavedObject({ _meta: { mappingsVersion: '1.0.0' } }),
        buildSavedObject({ _meta: { mappingsVersion: '1.0.0' } }),
        buildSavedObject({ _meta: { mappingsVersion: '1.0.0' } }),
      ],
    };

    soClient.find.mockResolvedValue(mockSavedObjectsResponse);

    const newConfig = { _meta: { mappingsVersion: '2.0.0' } };
    mockGetDefaultRiskEngineConfiguration.mockResolvedValue(newConfig);

    await updateRiskScoreMappings({
      auditLogger: mockAuditLogger,
      logger,
      kibanaVersion,
      getStartServices: getStartServicesMock,
      hasEncryptionKey: true,
    });

    expect(mockCreateOrUpdateIndex).toHaveBeenCalledTimes(4);
    expect(mockCreateOrUpdateComponentTemplate).toHaveBeenCalledTimes(4);
    expect(mockRolloverDataStream).toHaveBeenCalledTimes(4);
    expect(mockUpdateSavedObjectAttribute).toHaveBeenCalledTimes(4);
  });
});
