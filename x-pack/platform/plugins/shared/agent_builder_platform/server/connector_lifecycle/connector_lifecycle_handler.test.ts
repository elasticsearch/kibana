/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggingSystemMock } from '@kbn/core/server/mocks';
import { AttachmentType } from '@kbn/agent-builder-common/attachments';
import {
  AGENT_BUILDER_EXPERIMENTAL_FEATURES_SETTING_ID,
  CONTEXT_ENGINE_ENABLED_SETTING_ID,
} from '@kbn/management-settings-ids';
import { createConnectorLifecycleHandler } from './connector_lifecycle_handler';

const createMockUiSettingsClient = (contextEngineEnabled = true, experimentalEnabled = true) => ({
  get: jest.fn().mockImplementation(async (key: string) => {
    if (key === CONTEXT_ENGINE_ENABLED_SETTING_ID) return contextEngineEnabled;
    if (key === AGENT_BUILDER_EXPERIMENTAL_FEATURES_SETTING_ID) return experimentalEnabled;
    return undefined;
  }),
});

const createMockAgentContextLayer = () => ({
  indexAttachment: jest.fn().mockResolvedValue(undefined),
  deleteAttachment: jest.fn().mockResolvedValue(undefined),
});

const createMockGetStartServices = (
  uiSettingsClient = createMockUiSettingsClient(),
  agentContextLayer = createMockAgentContextLayer()
) =>
  jest.fn().mockResolvedValue([
    {
      elasticsearch: { client: { asInternalUser: {} } },
      savedObjects: { getScopedClient: jest.fn().mockReturnValue({}) },
      uiSettings: { asScopedToClient: jest.fn().mockReturnValue(uiSettingsClient) },
    },
    {
      spaces: { spacesService: { getSpaceId: jest.fn().mockReturnValue('default') } },
      agentContextLayer,
    },
    {},
  ]);

const createBaseParams = (overrides = {}) => ({
  connectorId: 'connector-abc',
  connectorName: 'My Test Connector',
  connectorType: '.test',
  config: {},
  secrets: {},
  logger: loggingSystemMock.create().get(),
  request: {} as any,
  services: { scopedClusterClient: {} as any },
  wasSuccessful: true,
  ...overrides,
});

describe('createConnectorLifecycleHandler', () => {
  const logger = loggingSystemMock.create().get('connector-lifecycle');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('onPostCreate', () => {
    it('skips unsuccessful saves', async () => {
      const agentContextLayer = createMockAgentContextLayer();
      const handler = createConnectorLifecycleHandler({
        logger,
        getStartServices: createMockGetStartServices(
          createMockUiSettingsClient(),
          agentContextLayer
        ),
      });

      await handler.onPostCreate(createBaseParams({ wasSuccessful: false }) as any);

      expect(agentContextLayer.indexAttachment).not.toHaveBeenCalled();
    });

    it('skips when the Context Engine is disabled', async () => {
      const uiSettingsClient = createMockUiSettingsClient(false);
      const agentContextLayer = createMockAgentContextLayer();
      const handler = createConnectorLifecycleHandler({
        logger,
        getStartServices: createMockGetStartServices(uiSettingsClient, agentContextLayer),
      });

      await handler.onPostCreate(createBaseParams() as any);

      expect(agentContextLayer.indexAttachment).not.toHaveBeenCalled();
    });

    it('skips when Agent Builder experimental features are disabled', async () => {
      const uiSettingsClient = createMockUiSettingsClient(true, false);
      const agentContextLayer = createMockAgentContextLayer();
      const handler = createConnectorLifecycleHandler({
        logger,
        getStartServices: createMockGetStartServices(uiSettingsClient, agentContextLayer),
      });

      await handler.onPostCreate(createBaseParams() as any);

      expect(agentContextLayer.indexAttachment).not.toHaveBeenCalled();
    });

    it('indexes connector into SML', async () => {
      const agentContextLayer = createMockAgentContextLayer();
      const handler = createConnectorLifecycleHandler({
        logger,
        getStartServices: createMockGetStartServices(
          createMockUiSettingsClient(),
          agentContextLayer
        ),
      });

      await handler.onPostCreate(createBaseParams() as any);

      expect(agentContextLayer.indexAttachment).toHaveBeenCalledWith(
        expect.objectContaining({
          originId: 'connector-abc',
          attachmentType: AttachmentType.connector,
          action: 'create',
        })
      );
    });

    it('logs warning but does not throw when indexAttachment fails', async () => {
      const agentContextLayer = createMockAgentContextLayer();
      agentContextLayer.indexAttachment.mockRejectedValue(new Error('SML error'));
      const handler = createConnectorLifecycleHandler({
        logger,
        getStartServices: createMockGetStartServices(
          createMockUiSettingsClient(),
          agentContextLayer
        ),
      });

      await expect(handler.onPostCreate(createBaseParams() as any)).resolves.toBeUndefined();

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('failed to index connector')
      );
    });
  });

  describe('onPostDelete', () => {
    it('removes connector from SML', async () => {
      const agentContextLayer = createMockAgentContextLayer();
      const handler = createConnectorLifecycleHandler({
        logger,
        getStartServices: createMockGetStartServices(
          createMockUiSettingsClient(),
          agentContextLayer
        ),
      });

      await handler.onPostDelete(createBaseParams({ connectorType: '.test' }) as any);

      expect(agentContextLayer.indexAttachment).toHaveBeenCalledWith(
        expect.objectContaining({
          originId: 'connector-abc',
          attachmentType: AttachmentType.connector,
          action: 'delete',
        })
      );
    });

    it('logs warning but does not throw when SML delete fails', async () => {
      const agentContextLayer = createMockAgentContextLayer();
      agentContextLayer.indexAttachment.mockRejectedValue(new Error('SML delete error'));
      const handler = createConnectorLifecycleHandler({
        logger,
        getStartServices: createMockGetStartServices(
          createMockUiSettingsClient(),
          agentContextLayer
        ),
      });

      await expect(
        handler.onPostDelete(createBaseParams({ connectorType: '.test' }) as any)
      ).resolves.toBeUndefined();

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('failed to remove connector')
      );
    });

    it('logs error when getStartServices fails', async () => {
      const getStartServices = jest.fn().mockRejectedValue(new Error('start services failed'));
      const handler = createConnectorLifecycleHandler({
        logger,
        getStartServices,
      });

      await expect(
        handler.onPostDelete(createBaseParams({ connectorType: '.test' }) as any)
      ).resolves.toBeUndefined();

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('failed to clean up for connector')
      );
    });
  });
});
