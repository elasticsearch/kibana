/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggingSystemMock } from '@kbn/core/server/mocks';
import { AttachmentType } from '@kbn/agent-builder-common/attachments';
import { AGENT_BUILDER_EXPERIMENTAL_FEATURES_SETTING_ID } from '@kbn/management-settings-ids';
import { getConnectorSpec } from '@kbn/connector-specs';
import { createConnectorLifecycleHandler } from './connector_lifecycle_handler';

jest.mock('@kbn/connector-specs', () => ({
  connectorsSpecs: {},
  getConnectorSpec: jest.fn(),
}));

const getConnectorSpecMock = getConnectorSpec as jest.MockedFunction<typeof getConnectorSpec>;

const createMockUiSettingsClient = (experimentalEnabled = true) => ({
  get: jest.fn().mockImplementation(async (key: string) => {
    if (key === AGENT_BUILDER_EXPERIMENTAL_FEATURES_SETTING_ID) return experimentalEnabled;
    return undefined;
  }),
});

const createMockAgentBuilderSml = () => ({
  indexAttachment: jest.fn().mockResolvedValue(undefined),
  deleteAttachment: jest.fn().mockResolvedValue(undefined),
});

const createMockGetStartServices = (
  uiSettingsClient = createMockUiSettingsClient(),
  agentBuilderSml = createMockAgentBuilderSml()
) =>
  jest.fn().mockResolvedValue([
    {
      elasticsearch: { client: { asInternalUser: {} } },
      savedObjects: { getScopedClient: jest.fn().mockReturnValue({}) },
      uiSettings: { asScopedToClient: jest.fn().mockReturnValue(uiSettingsClient) },
    },
    {
      spaces: { spacesService: { getSpaceId: jest.fn().mockReturnValue('default') } },
      agentBuilderSml,
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
    getConnectorSpecMock.mockReturnValue({
      metadata: { id: '.test', displayName: 'Test', description: '', minimumLicense: 'basic' },
      actions: {},
      test: { handler: jest.fn(), enabled: false },
    } as never);
  });

  describe('onPostCreate', () => {
    it('skips unsuccessful saves', async () => {
      const agentBuilderSml = createMockAgentBuilderSml();
      const handler = createConnectorLifecycleHandler({
        logger,
        getStartServices: createMockGetStartServices(createMockUiSettingsClient(), agentBuilderSml),
      });

      await handler.onPostCreate(createBaseParams({ wasSuccessful: false }) as any);

      expect(agentBuilderSml.indexAttachment).not.toHaveBeenCalled();
    });

    it('skips connector types with no way to be called from chat (no spec, not MCP)', async () => {
      getConnectorSpecMock.mockReturnValue(undefined);
      const agentBuilderSml = createMockAgentBuilderSml();
      const handler = createConnectorLifecycleHandler({
        logger,
        getStartServices: createMockGetStartServices(createMockUiSettingsClient(), agentBuilderSml),
      });

      await handler.onPostCreate(createBaseParams({ connectorType: '.jira' }) as any);

      expect(agentBuilderSml.indexAttachment).not.toHaveBeenCalled();
    });

    it('indexes the MCP connector even though it has no connector-specs entry', async () => {
      getConnectorSpecMock.mockReturnValue(undefined);
      const agentBuilderSml = createMockAgentBuilderSml();
      const handler = createConnectorLifecycleHandler({
        logger,
        getStartServices: createMockGetStartServices(createMockUiSettingsClient(), agentBuilderSml),
      });

      await handler.onPostCreate(createBaseParams({ connectorType: '.mcp' }) as any);

      expect(agentBuilderSml.indexAttachment).toHaveBeenCalledWith(
        expect.objectContaining({ originId: 'connector-abc', action: 'create' })
      );
    });

    it('indexes connector into SML', async () => {
      const agentBuilderSml = createMockAgentBuilderSml();
      const handler = createConnectorLifecycleHandler({
        logger,
        getStartServices: createMockGetStartServices(createMockUiSettingsClient(), agentBuilderSml),
      });

      await handler.onPostCreate(createBaseParams() as any);

      expect(agentBuilderSml.indexAttachment).toHaveBeenCalledWith(
        expect.objectContaining({
          originId: 'connector-abc',
          attachmentType: AttachmentType.connector,
          action: 'create',
        })
      );
    });

    it('logs warning but does not throw when indexAttachment fails', async () => {
      const agentBuilderSml = createMockAgentBuilderSml();
      agentBuilderSml.indexAttachment.mockRejectedValue(new Error('SML error'));
      const handler = createConnectorLifecycleHandler({
        logger,
        getStartServices: createMockGetStartServices(createMockUiSettingsClient(), agentBuilderSml),
      });

      await expect(handler.onPostCreate(createBaseParams() as any)).resolves.toBeUndefined();

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('failed to index connector')
      );
    });
  });

  describe('onPostDelete', () => {
    it('removes connector from SML', async () => {
      const agentBuilderSml = createMockAgentBuilderSml();
      const handler = createConnectorLifecycleHandler({
        logger,
        getStartServices: createMockGetStartServices(createMockUiSettingsClient(), agentBuilderSml),
      });

      await handler.onPostDelete(createBaseParams({ connectorType: '.test' }) as any);

      expect(agentBuilderSml.indexAttachment).toHaveBeenCalledWith(
        expect.objectContaining({
          originId: 'connector-abc',
          attachmentType: AttachmentType.connector,
          action: 'delete',
        })
      );
    });

    it('logs warning but does not throw when SML delete fails', async () => {
      const agentBuilderSml = createMockAgentBuilderSml();
      agentBuilderSml.indexAttachment.mockRejectedValue(new Error('SML delete error'));
      const handler = createConnectorLifecycleHandler({
        logger,
        getStartServices: createMockGetStartServices(createMockUiSettingsClient(), agentBuilderSml),
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
