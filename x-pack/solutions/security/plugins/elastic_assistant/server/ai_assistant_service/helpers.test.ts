/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ensureProductDocumentationInstalled } from './helpers';
import { loggerMock } from '@kbn/logging-mocks';
import type { ElasticsearchClient } from '@kbn/core-elasticsearch-server';
import { defaultInferenceEndpoints } from '@kbn/inference-common';

const mockLogger = loggerMock.create();
const mockProductDocManager = {
  getStatus: jest.fn(),
  getStatuses: jest.fn(),
  install: jest.fn(),
  installSecurityLabs: jest.fn(),
  uninstall: jest.fn(),
  uninstallSecurityLabs: jest.fn(),
  update: jest.fn(),
  updateAll: jest.fn(),
  updateSecurityLabsAll: jest.fn().mockResolvedValue({ inferenceIds: [] }),
  getSecurityLabsStatus: jest.fn(),
};

const mockInferenceGet = jest.fn();
const mockEsClient = {
  inference: { get: mockInferenceGet },
} as unknown as ElasticsearchClient;

describe('helpers', () => {
  describe('ensureProductDocumentationInstalled', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      mockInferenceGet.mockReset();
    });

    it('should install product documentation if not installed', async () => {
      mockInferenceGet.mockResolvedValue({ endpoints: [] });
      mockProductDocManager.getStatus.mockResolvedValue({ status: 'uninstalled' });
      mockProductDocManager.install.mockResolvedValue(null);

      await ensureProductDocumentationInstalled({
        esClient: mockEsClient,
        productDocManager: mockProductDocManager,
        setIsProductDocumentationInProgress: jest.fn(),
        logger: mockLogger,
      });

      expect(mockProductDocManager.getStatus).toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Installing product documentation for AIAssistantService'
      );
      expect(mockProductDocManager.install).toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenNthCalledWith(
        2,
        'Successfully installed product documentation for AIAssistantService'
      );
    });

    it('should not install product documentation if already installed', async () => {
      mockInferenceGet.mockResolvedValue({ endpoints: [] });
      mockProductDocManager.getStatus.mockResolvedValue({ status: 'installed' });

      await ensureProductDocumentationInstalled({
        esClient: mockEsClient,
        productDocManager: mockProductDocManager,
        setIsProductDocumentationInProgress: jest.fn(),
        logger: mockLogger,
      });

      expect(mockProductDocManager.getStatus).toHaveBeenCalled();
      expect(mockProductDocManager.install).not.toHaveBeenCalled();
      expect(mockLogger.debug).not.toHaveBeenCalledWith(
        'Installing product documentation for AIAssistantService'
      );
    });

    it('should log a warning if install fails', async () => {
      mockInferenceGet.mockResolvedValue({ endpoints: [] });
      mockProductDocManager.getStatus.mockResolvedValue({ status: 'not_installed' });
      mockProductDocManager.install.mockRejectedValue(new Error('Install failed'));

      await ensureProductDocumentationInstalled({
        esClient: mockEsClient,
        productDocManager: mockProductDocManager,
        setIsProductDocumentationInProgress: jest.fn(),
        logger: mockLogger,
      });

      expect(mockProductDocManager.getStatus).toHaveBeenCalled();
      expect(mockProductDocManager.install).toHaveBeenCalled();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to install product documentation for AIAssistantService: Install failed'
      );
    });

    it('should log a warning if getStatus fails', async () => {
      mockInferenceGet.mockResolvedValue({ endpoints: [] });
      mockProductDocManager.getStatus.mockRejectedValue(new Error('Status check failed'));

      await ensureProductDocumentationInstalled({
        esClient: mockEsClient,
        productDocManager: mockProductDocManager,
        setIsProductDocumentationInProgress: jest.fn(),
        logger: mockLogger,
      });

      expect(mockProductDocManager.getStatus).toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to get status of product documentation installation for AIAssistantService: Status check failed'
      );
      expect(mockProductDocManager.install).not.toHaveBeenCalled();
    });

    it('resolves the Jina inference id when a Jina endpoint is present', async () => {
      mockInferenceGet.mockResolvedValue({
        endpoints: [{ inference_id: defaultInferenceEndpoints.JINAv5 }],
      });
      mockProductDocManager.getStatus.mockResolvedValue({ status: 'installed' });

      await ensureProductDocumentationInstalled({
        esClient: mockEsClient,
        productDocManager: mockProductDocManager,
        setIsProductDocumentationInProgress: jest.fn(),
        logger: mockLogger,
      });

      expect(mockProductDocManager.getStatus).toHaveBeenCalledWith({
        inferenceId: defaultInferenceEndpoints.JINAv5,
      });
    });

    it('falls back to ELSER when only the ML-node ELSER endpoint is present', async () => {
      mockInferenceGet.mockResolvedValue({
        endpoints: [{ inference_id: defaultInferenceEndpoints.ELSER }],
      });
      mockProductDocManager.getStatus.mockResolvedValue({ status: 'installed' });

      await ensureProductDocumentationInstalled({
        esClient: mockEsClient,
        productDocManager: mockProductDocManager,
        setIsProductDocumentationInProgress: jest.fn(),
        logger: mockLogger,
      });

      expect(mockProductDocManager.getStatus).toHaveBeenCalledWith({
        inferenceId: defaultInferenceEndpoints.ELSER,
      });
    });

    it('falls back to ELSER when resolving the inference id throws', async () => {
      mockInferenceGet.mockRejectedValue(new Error('inference.get failed'));
      mockProductDocManager.getStatus.mockResolvedValue({ status: 'installed' });

      await ensureProductDocumentationInstalled({
        esClient: mockEsClient,
        productDocManager: mockProductDocManager,
        setIsProductDocumentationInProgress: jest.fn(),
        logger: mockLogger,
      });

      expect(mockProductDocManager.getStatus).toHaveBeenCalledWith({
        inferenceId: defaultInferenceEndpoints.ELSER,
      });
    });
  });
});
