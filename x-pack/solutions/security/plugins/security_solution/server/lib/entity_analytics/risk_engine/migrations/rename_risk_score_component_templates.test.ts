/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renameRiskScoreComponentTemplate } from './rename_risk_score_component_templates';
import {
  loggingSystemMock,
  savedObjectsClientMock as mockSavedObjectsClient,
  elasticsearchServiceMock,
} from '@kbn/core/server/mocks';
import { auditLoggerMock } from '@kbn/security-plugin/server/audit/mocks';

const mockCreateComponentTemplate = jest.fn();
const mockCreateIndexTemplate = jest.fn();

jest.mock('../../risk_score/risk_score_data_client', () => ({
  RiskScoreDataClient: jest.fn().mockImplementation(() => ({
    createOrUpdateRiskScoreComponentTemplate: () => mockCreateComponentTemplate(),
    createOrUpdateRiskScoreIndexTemplate: () => mockCreateIndexTemplate(),
  })),
}));

jest.mock('../../risk_score/tasks/helpers', () => ({
  buildScopedInternalSavedObjectsClientUnsafe: () => mockSavedObjectsClient.create(),
}));

const buildSavedObjectResponse = (namespaces = ['default']) => ({
  page: 1,
  per_page: 20,
  total: namespaces.length,
  saved_objects: namespaces.map((namespace) => ({
    namespaces: [namespace],
    attributes: {},
    id: 'id',
    type: 'type',
    references: [],
    score: 1,
  })),
});

describe('renameRiskScoreComponentTemplate', () => {
  const mockGetStartServices = jest.fn();
  const mockAuditLogger = auditLoggerMock.create();
  const mockLogger = loggingSystemMock.createLogger();
  const mockEsClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
  const mockSoClient = mockSavedObjectsClient.create();

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateComponentTemplate.mockReset();
    mockCreateIndexTemplate.mockReset();
    mockGetStartServices.mockResolvedValue([
      {
        savedObjects: {
          createInternalRepository: jest.fn().mockReturnValue(mockSoClient),
        },
        elasticsearch: {
          client: {
            asInternalUser: mockEsClient,
          },
        },
      },
    ]);
  });

  it('should not proceed if old component template does not exist', async () => {
    mockEsClient.cluster.existsComponentTemplate.mockResolvedValue(false);

    await renameRiskScoreComponentTemplate({
      auditLogger: mockAuditLogger,
      logger: mockLogger,
      getStartServices: mockGetStartServices,
      kibanaVersion: '8.0.0',
      hasEncryptionKey: true,
    });

    expect(mockEsClient.cluster.existsComponentTemplate).toHaveBeenCalledWith({
      name: '.risk-score-mappings',
    });
    expect(mockEsClient.cluster.deleteComponentTemplate).not.toHaveBeenCalled();
  });

  it('should proceed with migration if old component template exists', async () => {
    mockEsClient.cluster.existsComponentTemplate.mockResolvedValue(true);
    mockSoClient.find.mockResolvedValue(buildSavedObjectResponse(['default']));

    await renameRiskScoreComponentTemplate({
      auditLogger: mockAuditLogger,
      logger: mockLogger,
      getStartServices: mockGetStartServices,
      kibanaVersion: '8.0.0',
      hasEncryptionKey: true,
    });

    expect(mockEsClient.cluster.existsComponentTemplate).toHaveBeenCalledWith({
      name: '.risk-score-mappings',
    });
    expect(mockEsClient.cluster.deleteComponentTemplate).toHaveBeenCalledWith(
      { name: '.risk-score-mappings' },
      { ignore: [404] }
    );
  });

  it('should log an error if a saved object has no namespace', async () => {
    const savedObj = buildSavedObjectResponse([]);
    mockEsClient.cluster.existsComponentTemplate.mockResolvedValue(true);
    mockSoClient.find.mockResolvedValue({
      ...savedObj,
      saved_objects: [
        {
          ...savedObj.saved_objects[0],
          namespaces: [],
        },
      ],
    });

    await renameRiskScoreComponentTemplate({
      auditLogger: mockAuditLogger,
      logger: mockLogger,
      getStartServices: mockGetStartServices,
      kibanaVersion: '8.0.0',
      hasEncryptionKey: true,
    });

    expect(mockLogger.error).toHaveBeenCalledWith(
      'Unexpected saved object. Risk Score saved objects must have a namespace'
    );
  });

  it('should throw an error if any promise is rejected', async () => {
    mockEsClient.cluster.existsComponentTemplate.mockResolvedValue(true);
    mockSoClient.find.mockResolvedValue(buildSavedObjectResponse(['default']));
    mockCreateComponentTemplate.mockRejectedValue(new Error('Test error'));

    await expect(
      renameRiskScoreComponentTemplate({
        auditLogger: mockAuditLogger,
        logger: mockLogger,
        getStartServices: mockGetStartServices,
        kibanaVersion: '8.0.0',
        hasEncryptionKey: true,
      })
    ).rejects.toThrow('Risk Score component template migration failed with errors: \nTest error');
    expect(mockEsClient.cluster.deleteComponentTemplate).not.toHaveBeenCalled();
  });

  it('should throw an error with concatenated error messages when more than one error happens', async () => {
    mockEsClient.cluster.existsComponentTemplate.mockResolvedValue(true);
    mockSoClient.find.mockResolvedValue(buildSavedObjectResponse(['space-1', 'space-2']));

    mockCreateComponentTemplate
      .mockRejectedValueOnce(new Error('Test error 1'))
      .mockRejectedValueOnce(new Error('Test error 2'));

    await expect(
      renameRiskScoreComponentTemplate({
        auditLogger: mockAuditLogger,
        logger: mockLogger,
        getStartServices: mockGetStartServices,
        kibanaVersion: '8.0.0',
        hasEncryptionKey: true,
      })
    ).rejects.toThrow(
      'Risk Score component template migration failed with errors: \nTest error 1\nTest error 2'
    );
  });

  it('should handle errors when creating/updating index template', async () => {
    mockEsClient.cluster.existsComponentTemplate.mockResolvedValue(true);
    mockSoClient.find.mockResolvedValue(buildSavedObjectResponse(['default']));

    mockCreateIndexTemplate.mockRejectedValue(new Error('Index template error'));

    await expect(
      renameRiskScoreComponentTemplate({
        auditLogger: mockAuditLogger,
        logger: mockLogger,
        getStartServices: mockGetStartServices,
        kibanaVersion: '8.0.0',
        hasEncryptionKey: true,
      })
    ).rejects.toThrow(
      'Risk Score component template migration failed with errors: \nIndex template error'
    );
  });

  it('should log info when migration starts for a namespace', async () => {
    mockEsClient.cluster.existsComponentTemplate.mockResolvedValue(true);
    mockSoClient.find.mockResolvedValue(buildSavedObjectResponse(['default']));

    await renameRiskScoreComponentTemplate({
      auditLogger: mockAuditLogger,
      logger: mockLogger,
      getStartServices: mockGetStartServices,
      kibanaVersion: '8.0.0',
      hasEncryptionKey: true,
    });

    expect(mockLogger.info).toHaveBeenCalledWith(
      'Starting Risk Score component template migration on namespace default'
    );
  });

  it('should log debug when migration completes for a namespace', async () => {
    mockEsClient.cluster.existsComponentTemplate.mockResolvedValue(true);
    mockSoClient.find.mockResolvedValue(buildSavedObjectResponse(['default']));

    await renameRiskScoreComponentTemplate({
      auditLogger: mockAuditLogger,
      logger: mockLogger,
      getStartServices: mockGetStartServices,
      kibanaVersion: '8.0.0',
      hasEncryptionKey: true,
    });

    expect(mockLogger.debug).toHaveBeenCalledWith(
      'Risk score component template migration ran on namespace default'
    );
  });

  it('should delete the old component template if all migrations succeed', async () => {
    mockEsClient.cluster.existsComponentTemplate.mockResolvedValue(true);
    mockSoClient.find.mockResolvedValue(buildSavedObjectResponse(['default']));

    await renameRiskScoreComponentTemplate({
      auditLogger: mockAuditLogger,
      logger: mockLogger,
      getStartServices: mockGetStartServices,
      kibanaVersion: '8.0.0',
      hasEncryptionKey: true,
    });

    expect(mockEsClient.cluster.deleteComponentTemplate).toHaveBeenCalledWith(
      { name: '.risk-score-mappings' },
      { ignore: [404] }
    );
  });
});
