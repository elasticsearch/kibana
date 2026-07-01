/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { PluginInitializerContext } from '@kbn/core/public';
import { spacesPluginMock } from '@kbn/spaces-plugin/public/mocks';
import { coreMock, applicationServiceMock } from '@kbn/core/public/mocks';
import { embeddablePluginMock } from '@kbn/embeddable-plugin/public/mocks';
import { expressionsPluginMock } from '@kbn/expressions-plugin/public/mocks';
import { dataPluginMock } from '@kbn/data-plugin/public/mocks';
import { dataViewPluginMocks } from '@kbn/data-views-plugin/public/mocks';
import { indexPatternEditorPluginMock } from '@kbn/data-view-editor-plugin/public/mocks';
import { uiActionsPluginMock } from '@kbn/ui-actions-plugin/public/mocks';
import { inspectorPluginMock } from '@kbn/inspector-plugin/public/mocks';
import { urlForwardingPluginMock } from '@kbn/url-forwarding-plugin/public/mocks';
import { navigationPluginMock } from '@kbn/navigation-plugin/public/mocks';
import { presentationUtilPluginMock } from '@kbn/presentation-util-plugin/public/mocks';
import { savedObjectTaggingOssPluginMock } from '@kbn/saved-objects-tagging-oss-plugin/public/mocks';
import { screenshotModePluginMock } from '@kbn/screenshot-mode-plugin/public/mocks';
import { fieldFormatsServiceMock } from '@kbn/field-formats-plugin/public/mocks';
import { unifiedSearchPluginMock } from '@kbn/unified-search-plugin/public/mocks';
import { kqlPluginMock } from '@kbn/kql/public/mocks';
import { savedObjectsManagementPluginMock } from '@kbn/saved-objects-management-plugin/public/mocks';
import { savedSearchPluginMock } from '@kbn/saved-search-plugin/public/mocks';
import type { ContentManagementPublicStart } from '@kbn/content-management-plugin/public';
import { VisualizationsPlugin } from './plugin';
import { Schemas } from './vis_types';
import type { Schema, VisualizationsSetup, VisualizationsStart } from '.';

const createSetupContract = (): VisualizationsSetup => ({
  createBaseVisualization: jest.fn(),
  createBaseVisualizationAsync: jest.fn(),
  registerAlias: jest.fn(),
  visEditorsRegistry: { registerDefault: jest.fn(), register: jest.fn(), get: jest.fn() },
  listingViewRegistry: { add: jest.fn() },
});

const createStartContract = (): VisualizationsStart => ({
  get: jest.fn(),
  all: jest.fn(),
  getAliases: jest.fn(),
  getByGroup: jest.fn(),
  unRegisterAlias: jest.fn(),
  showNewVisModal: jest.fn(),
  findListItems: jest.fn().mockResolvedValue({ total: 0, hits: [] }),
  updateVisualizationLibraryItem: jest.fn(),
});

const createInstance = async () => {
  const plugin = new VisualizationsPlugin({} as PluginInitializerContext);

  const setup = plugin.setup(coreMock.createSetup(), {
    data: dataPluginMock.createSetupContract(),
    embeddable: embeddablePluginMock.createSetupContract(),
    expressions: expressionsPluginMock.createSetupContract(),
    inspector: inspectorPluginMock.createSetupContract(),
    urlForwarding: urlForwardingPluginMock.createSetupContract(),
    uiActions: uiActionsPluginMock.createSetupContract(),
    contentManagement: {
      registry: {
        register: jest.fn(),
      },
    },
  });

  const doStart = () =>
    plugin.start(coreMock.createStart(), {
      data: dataPluginMock.createStartContract(),
      dataViews: dataViewPluginMocks.createStartContract(),
      dataViewEditor: indexPatternEditorPluginMock.createStartContract(),
      expressions: expressionsPluginMock.createStartContract(),
      inspector: inspectorPluginMock.createStartContract(),
      uiActions: uiActionsPluginMock.createStartContract(),
      application: applicationServiceMock.createStartContract(),
      embeddable: embeddablePluginMock.createStartContract(),
      spaces: spacesPluginMock.createStartContract(),
      savedObjectsTaggingOss: savedObjectTaggingOssPluginMock.createStart(),
      savedSearch: savedSearchPluginMock.createStartContract(),
      navigation: navigationPluginMock.createStartContract(),
      presentationUtil: presentationUtilPluginMock.createStartContract(),
      urlForwarding: urlForwardingPluginMock.createStartContract(),
      screenshotMode: screenshotModePluginMock.createStartContract(),
      fieldFormats: fieldFormatsServiceMock.createStartContract(),
      unifiedSearch: unifiedSearchPluginMock.createStartContract(),
      kql: kqlPluginMock.createStartContract(),
      usageCollection: {
        reportUiCounter: jest.fn(),
      },
      savedObjectsManagement: savedObjectsManagementPluginMock.createStartContract(),
      contentManagement: {
        client: {
          search: jest.fn(),
          get: jest.fn(),
          create: jest.fn(),
          update: jest.fn(),
          delete: jest.fn(),
        } as unknown as ContentManagementPublicStart['client'],
        registry: {
          get: jest.fn(),
          getAll: jest.fn(),
        },
      },
    });

  return {
    plugin,
    setup,
    doStart,
  };
};

export const createMockedVisEditorSchemas = (schemas: Array<Partial<Schema>>) =>
  new Schemas(schemas);

export const visualizationsPluginMock = {
  createSetupContract,
  createStartContract,
  createInstance,
};
