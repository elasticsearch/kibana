/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { httpServerMock, httpServiceMock } from '@kbn/core-http-server-mocks';
import { coreMock } from '@kbn/core/server/mocks';
import { CONTEXT_ENGINE_ENABLED_SETTING_ID } from '@kbn/management-settings-ids';
import type { SmlDocument } from '../services/sml/types';

export const createMockSmlService = () => ({
  search: jest.fn(),
  checkItemsAccess: jest.fn(),
  indexAttachment: jest.fn(),
  deleteAttachment: jest.fn(),
  getDocuments: jest.fn(),
  listDocuments: jest.fn(),
  upsertDocument: jest.fn(),
  deleteDocument: jest.fn(),
  getTypeDefinition: jest.fn(),
  listTypeDefinitions: jest.fn(),
  getCrawler: jest.fn(),
});

export const createMockUiSettingsClient = (enabled = true) => ({
  get: jest.fn().mockImplementation(async (key: string) => {
    if (key === CONTEXT_ENGINE_ENABLED_SETTING_ID) return enabled;
    return undefined;
  }),
});

/** Create a coreSetup mock with the spaces plugin returning the given spaceId. */
export const createTestCoreSetup = (spaceId = 'test-space') => {
  const coreSetup = coreMock.createSetup();
  (coreSetup.getStartServices as jest.Mock).mockResolvedValue([
    {},
    { spaces: { spacesService: { getSpaceId: jest.fn().mockReturnValue(spaceId) } } },
    {},
  ]);
  return coreSetup;
};

/** Create a coreSetup mock with no spaces plugin (triggers 'default' space fallback). */
export const createTestCoreSetupNoSpaces = () => {
  const coreSetup = coreMock.createSetup();
  (coreSetup.getStartServices as jest.Mock).mockResolvedValue([{}, {}, {}]);
  return coreSetup;
};

export const buildMockContext = (uiSettingsEnabled = true) => ({
  core: Promise.resolve({
    uiSettings: { client: createMockUiSettingsClient(uiSettingsEnabled) },
    elasticsearch: { client: { asInternalUser: {}, asCurrentUser: {} } },
  }),
});

export const sampleDocument: SmlDocument = {
  id: 'chunk-1',
  type: 'visualization',
  title: 'Test Viz',
  origin_id: 'viz-1',
  origin: { uri: 'visualization://viz-1' },
  content: 'some content',
  created_at: '2024-01-01',
  updated_at: '2024-01-02',
  spaces: ['test-space'],
  permissions: { kibana: { privileges: [] }, elasticsearch: { indices: [] } },
  ingestion_method: 'crawled',
};

export { httpServerMock, httpServiceMock };
