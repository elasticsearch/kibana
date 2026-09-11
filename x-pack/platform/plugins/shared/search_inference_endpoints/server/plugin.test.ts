/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { DEFAULT_APP_CATEGORIES } from '@kbn/core/server';
import { actionsMock } from '@kbn/actions-plugin/server/mocks';
import { SavedObjectsErrorHelpers } from '@kbn/core/server';
import { coreMock, httpServerMock, savedObjectsClientMock } from '@kbn/core/server/mocks';
import { featuresPluginMock } from '@kbn/features-plugin/server/mocks';
import { inferenceMock } from '@kbn/inference-plugin/server/mocks';
import { SearchInferenceEndpointsPlugin } from './plugin';
import {
  ELASTIC_INFERENCE_SERVICE_APP_ID,
  INFERENCE_ENDPOINTS_APP_ID,
  INFERENCE_SETTINGS_SO_TYPE,
  MODEL_SETTINGS_APP_ID,
  PLUGIN_ID,
  PLUGIN_NAME,
} from '../common/constants';
import type { SearchInferenceEndpointsConfig } from './config';

describe('SearchInferenceEndpointsPlugin', () => {
  let plugin: SearchInferenceEndpointsPlugin;
  let coreSetup: ReturnType<typeof coreMock.createSetup>;
  let features: ReturnType<typeof featuresPluginMock.createSetup>;

  beforeEach(() => {
    const context = coreMock.createPluginInitializerContext<SearchInferenceEndpointsConfig>({
      enabled: true,
      ui: { enabled: true },
      dynamicConnectors: { enabled: false, pollingIntervalMins: 15 },
    });
    plugin = new SearchInferenceEndpointsPlugin(context);
    coreSetup = coreMock.createSetup();
    features = featuresPluginMock.createSetup();
  });

  describe('setup()', () => {
    it('registers routes', () => {
      plugin.setup(coreSetup, { features });

      expect(coreSetup.http.createRouter).toHaveBeenCalledTimes(1);
    });

    it('registers the kibana feature with correct properties', () => {
      plugin.setup(coreSetup, { features });

      expect(features.registerKibanaFeature).toHaveBeenCalledTimes(1);

      const feature = features.registerKibanaFeature.mock.calls[0][0];

      expect(feature).toMatchObject({
        id: PLUGIN_ID,
        name: PLUGIN_NAME,
        minimumLicense: 'enterprise',
        category: DEFAULT_APP_CATEGORIES.management,
        management: {
          modelManagement: [
            ELASTIC_INFERENCE_SERVICE_APP_ID,
            INFERENCE_ENDPOINTS_APP_ID,
            MODEL_SETTINGS_APP_ID,
          ],
        },
      });
    });

    it('registers feature with all privilege granting management access', () => {
      plugin.setup(coreSetup, { features });

      const feature = features.registerKibanaFeature.mock.calls[0][0];

      expect(feature.privileges?.all).toMatchObject({
        management: {
          modelManagement: [
            ELASTIC_INFERENCE_SERVICE_APP_ID,
            INFERENCE_ENDPOINTS_APP_ID,
            MODEL_SETTINGS_APP_ID,
          ],
        },
      });
    });

    it('registers feature with read privilege disabled', () => {
      plugin.setup(coreSetup, { features });

      const feature = features.registerKibanaFeature.mock.calls[0][0];

      expect(feature.privileges?.read).toMatchObject({
        disabled: true,
      });
    });
  });

  describe('start()', () => {
    let coreStart: ReturnType<typeof coreMock.createStart>;
    let startContract: ReturnType<SearchInferenceEndpointsPlugin['start']>;

    beforeEach(() => {
      coreStart = coreMock.createStart();
      plugin.setup(coreSetup, { features });

      const inference = inferenceMock.createStartContract();
      inference.getConnectorList.mockResolvedValue([]);
      inference.getConnectorById.mockRejectedValue(new Error('not found'));

      startContract = plugin.start(coreStart, {
        actions: actionsMock.createStart(),
        inference,
      });
    });

    it('endpoints.getForFeature reads inference settings with the internal client', async () => {
      const request = httpServerMock.createKibanaRequest();
      await startContract.endpoints.getForFeature('any_feature', request);

      expect(coreStart.savedObjects.getUnsafeInternalClient).toHaveBeenCalledWith({
        includedHiddenTypes: [INFERENCE_SETTINGS_SO_TYPE],
      });
    });

    it('scopes the internal settings client to the namespace of the request', async () => {
      const request = httpServerMock.createKibanaRequest();
      const scopedClient = savedObjectsClientMock.create();
      scopedClient.getCurrentNamespace.mockReturnValue('applications');
      coreStart.savedObjects.getScopedClient.mockReturnValue(scopedClient);

      const internalClient = savedObjectsClientMock.create();
      const spaceScopedClient = savedObjectsClientMock.create();
      internalClient.asScopedToNamespace.mockReturnValue(spaceScopedClient);
      coreStart.savedObjects.getUnsafeInternalClient.mockReturnValue(internalClient);

      await startContract.endpoints.getForFeature('any_feature', request);

      expect(internalClient.asScopedToNamespace).toHaveBeenCalledWith('applications');
      expect(spaceScopedClient.get).toHaveBeenCalledWith(INFERENCE_SETTINGS_SO_TYPE, 'default');
      expect(internalClient.get).not.toHaveBeenCalled();
    });

    it('does not scope the internal settings client when the request is in the default space', async () => {
      const request = httpServerMock.createKibanaRequest();
      const internalClient = savedObjectsClientMock.create();
      coreStart.savedObjects.getUnsafeInternalClient.mockReturnValue(internalClient);

      await startContract.endpoints.getForFeature('any_feature', request);

      expect(internalClient.asScopedToNamespace).not.toHaveBeenCalled();
      expect(internalClient.get).toHaveBeenCalledWith(INFERENCE_SETTINGS_SO_TYPE, 'default');
    });

    it('applies the admin-configured model list to users who cannot read the settings saved object', async () => {
      const request = httpServerMock.createKibanaRequest();
      const scopedClient = savedObjectsClientMock.create();
      scopedClient.get.mockRejectedValue(
        SavedObjectsErrorHelpers.decorateForbiddenError(
          new Error(`Unable to get ${INFERENCE_SETTINGS_SO_TYPE}`)
        )
      );
      coreStart.savedObjects.getScopedClient.mockReturnValue(scopedClient);

      const internalClient = savedObjectsClientMock.create();
      internalClient.get.mockResolvedValue({
        id: 'default',
        type: INFERENCE_SETTINGS_SO_TYPE,
        references: [],
        attributes: { features: [{ feature_id: 'any_feature', endpoints: [{ id: 'allowed' }] }] },
      });
      coreStart.savedObjects.getUnsafeInternalClient.mockReturnValue(internalClient);

      const createConnector = (connectorId: string) => ({
        connectorId,
        name: connectorId,
        type: '.gen-ai',
        config: {},
        capabilities: {},
        isPreconfigured: false,
        isInferenceEndpoint: false,
      });
      const inference = inferenceMock.createStartContract();
      inference.getConnectorList.mockResolvedValue([
        createConnector('allowed'),
        createConnector('hidden'),
      ] as any);
      inference.getConnectorById.mockImplementation(
        async (id: string) => createConnector(id) as any
      );

      const contract = plugin.start(coreStart, { actions: actionsMock.createStart(), inference });
      contract.features.register({
        featureId: 'any_feature',
        featureName: 'Any feature',
        featureDescription: 'Any feature',
        taskType: 'chat_completion',
        recommendedEndpoints: [],
      });
      const result = await contract.endpoints.getForFeature('any_feature', request);

      expect(result.soEntryFound).toBe(true);
      expect(result.endpoints.map((e) => e.connectorId)).toEqual(['allowed']);
    });

    it('creates a separate scoped SO client per request, ensuring space isolation', async () => {
      const requestA = httpServerMock.createKibanaRequest();
      const requestB = httpServerMock.createKibanaRequest();

      await startContract.endpoints.getForFeature('any_feature', requestA);
      await startContract.endpoints.getForFeature('any_feature', requestB);

      const calls = coreStart.savedObjects.getScopedClient.mock.calls;
      const requestsUsed = calls.map(([req]) => req);

      expect(requestsUsed).toContain(requestA);
      expect(requestsUsed).toContain(requestB);
    });
  });
});
