/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { PluginInitializerContext } from '@kbn/core/public';
import { coreMock } from '@kbn/core/public/mocks';
import { licensingMock } from '@kbn/licensing-plugin/public/mocks';
import { featuresPluginMock } from '@kbn/features-plugin/public/mocks';
import { securityMock } from '@kbn/security-plugin/public/mocks';
import { managementPluginMock } from '@kbn/management-plugin/public/mocks';
import { uiActionsPluginMock } from '@kbn/ui-actions-plugin/public/mocks';
import { dataPluginMock } from '@kbn/data-plugin/public/mocks';
import { embeddablePluginMock } from '@kbn/embeddable-plugin/public/mocks';
import { lensPluginMock } from '@kbn/lens-plugin/public/mocks';
import { contentManagementMock } from '@kbn/content-management-plugin/public/mocks';
import { mockStorage } from '@kbn/kibana-utils-plugin/public/storage/hashed_item_store/mock';
import { triggersActionsUiMock } from '@kbn/triggers-actions-ui-plugin/public/mocks';
import type { CasesPublicStartDependencies, CasesPublicSetupDependencies } from './types';
import { CasesUiPlugin } from './plugin';
import { ALLOWED_MIME_TYPES } from '../common/constants/mime_types';
import { fieldFormatsMock } from '@kbn/field-formats-plugin/common/mocks';
import { CASE_PAGE_VIEW_EVENT_TYPE } from '../common/constants';
import { toastsServiceMock } from '@kbn/core-notifications-browser-mocks/src/toasts_service.mock';

function getConfig(overrides = {}) {
  return {
    markdownPlugins: { lens: true },
    files: { maxSize: 1, allowedMimeTypes: ALLOWED_MIME_TYPES },
    stack: { enabled: true },
    incrementalId: { enabled: true },
    ...overrides,
  };
}

describe('Cases Ui Plugin', () => {
  let context: PluginInitializerContext;
  let plugin: CasesUiPlugin;
  let coreSetup: ReturnType<typeof coreMock.createSetup>;
  let coreStart: ReturnType<typeof coreMock.createStart>;
  let pluginsSetup: jest.Mocked<CasesPublicSetupDependencies>;
  let pluginsStart: jest.Mocked<CasesPublicStartDependencies>;

  beforeEach(() => {
    context = coreMock.createPluginInitializerContext(getConfig());
    plugin = new CasesUiPlugin(context);
    coreSetup = coreMock.createSetup();
    coreStart = coreMock.createStart();

    pluginsSetup = {
      files: {
        filesClientFactory: { asScoped: jest.fn(), asUnscoped: jest.fn() },
        registerFileKind: jest.fn(),
      },
      security: securityMock.createSetup(),
      management: managementPluginMock.createSetupContract(),
      triggersActionsUi: triggersActionsUiMock.createStart(),
    };

    pluginsStart = {
      licensing: licensingMock.createStart(),
      uiActions: uiActionsPluginMock.createStartContract(),
      files: {
        filesClientFactory: { asScoped: jest.fn(), asUnscoped: jest.fn() },
        getAllFindKindDefinitions: jest.fn(),
        getFileKindDefinition: jest.fn(),
      },
      features: featuresPluginMock.createStart(),
      security: securityMock.createStart(),
      dashboard: {
        findDashboardsService: jest.fn(),
      } as unknown as CasesPublicStartDependencies['dashboard'],
      data: dataPluginMock.createStartContract(),
      embeddable: embeddablePluginMock.createStartContract(),
      lens: lensPluginMock.createStartContract(),
      maps: {
        Map: () => null,
        PassiveMap: () => null,
        createLayerDescriptors: {
          createSecurityLayerDescriptors: jest.fn(),
          createBasemapLayerDescriptor: jest.fn(),
          createESSearchSourceLayerDescriptor: jest.fn(),
        },
        suggestEMSTermJoinConfig: jest.fn(),
      },
      contentManagement: contentManagementMock.createStartContract(),
      storage: {
        store: {
          getItem: mockStorage.getItem,
          setItem: mockStorage.setItem,
          removeItem: mockStorage.removeItem,
          clear: mockStorage.clear,
        },
        get: jest.fn(),
        set: jest.fn(),
        clear: jest.fn(),
        remove: jest.fn(),
      },
      triggersActionsUi: triggersActionsUiMock.createStart(),
      fieldFormats: fieldFormatsMock,
      toastNotifications: toastsServiceMock.createSetupContract(),
    };
  });

  describe('setup()', () => {
    it('should start setup cases plugin correctly', async () => {
      const setup = plugin.setup(coreSetup, pluginsSetup);

      expect(setup).toMatchInlineSnapshot(`
        Object {
          "attachmentFramework": Object {
            "registerExternalReference": [Function],
            "registerPersistableState": [Function],
            "registerUnified": [Function],
          },
        }
      `);
    });

    it('registers cases page view event type', async () => {
      plugin.setup(coreSetup, pluginsSetup);

      expect(coreSetup.analytics.registerEventType).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: CASE_PAGE_VIEW_EVENT_TYPE,
          schema: expect.objectContaining({ owner: expect.objectContaining({ type: 'keyword' }) }),
        })
      );
    });

    it('should register kibana feature when stack is enabled', async () => {
      plugin.setup(coreSetup, pluginsSetup);

      expect(
        pluginsSetup.management.sections.section.insightsAndAlerting.registerApp
      ).toHaveBeenCalled();
    });

    it('should not register kibana feature when stack is disabled', async () => {
      context = coreMock.createPluginInitializerContext(getConfig({ stack: { enabled: false } }));
      const pluginWithStackDisabled = new CasesUiPlugin(context);

      pluginWithStackDisabled.setup(coreSetup, pluginsSetup);

      expect(
        pluginsSetup.management.sections.section.insightsAndAlerting.registerApp
      ).not.toHaveBeenCalled();
    });
  });

  describe('start', () => {
    it('should start cases plugin correctly', async () => {
      const pluginStart = plugin.start(coreStart, pluginsStart);

      expect(pluginStart).toStrictEqual({
        api: {
          cases: {
            bulkGet: expect.any(Function),
            find: expect.any(Function),
            getCasesMetrics: expect.any(Function),
          },
          getRelatedCases: expect.any(Function),
        },
        config: {
          templatesEnabled: false,
          attachmentsEnabled: false,
          casesRedesign: { list: false, details: false, settings: false },
        },
        helpers: {
          canUseCases: expect.any(Function),
          getRuleIdFromEvent: expect.any(Function),
          getUICapabilities: expect.any(Function),
          groupAlertsByRule: expect.any(Function),
        },
        hooks: {
          useCasesAddToExistingCaseModal: expect.any(Function),
          useCasesAddToNewCaseFlyout: expect.any(Function),
          useIsAddToCaseOpen: expect.any(Function),
        },
        ui: {
          getAllCasesSelectorModal: expect.any(Function),
          getCases: expect.any(Function),
          getCasesContext: expect.any(Function),
          getRecentCases: expect.any(Function),
        },
      });
    });
  });
});
