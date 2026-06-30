/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { PluginInitializerContext } from '@kbn/core/server';
import {} from '@kbn/core/server';
import { coreMock } from '@kbn/core/server/mocks';
import { usageCollectionPluginMock } from '@kbn/usage-collection-plugin/server/mocks';
import { licensingMock } from '@kbn/licensing-plugin/server/mocks';
import { featuresPluginMock } from '@kbn/features-plugin/server/mocks';
import { createFileServiceFactoryMock, createFilesSetupMock } from '@kbn/files-plugin/server/mocks';
import { securityMock } from '@kbn/security-plugin/server/mocks';
import { makeLensEmbeddableFactory } from '@kbn/lens-plugin/server/embeddable/make_lens_embeddable_factory';
import { taskManagerMock } from '@kbn/task-manager-plugin/server/mocks';
import { actionsMock } from '@kbn/actions-plugin/server/mocks';
import { notificationsMock } from '@kbn/notifications-plugin/server/mocks';
import { alertsMock } from '@kbn/alerting-plugin/server/mocks';
import { CasePlugin } from './plugin';
import type { ConfigType } from './config';
import { ALLOWED_MIME_TYPES } from '../common/constants/mime_types';
import { CASE_ATTACHMENT_SAVED_OBJECT } from '../common/constants';
import type { CasesServerSetupDependencies, CasesServerStartDependencies } from './types';

function getConfig(overrides: Partial<ConfigType> = {}): ConfigType {
  return {
    enabled: true,
    markdownPlugins: { lens: true },
    files: { maxSize: 1, allowedMimeTypes: ALLOWED_MIME_TYPES },
    stack: { enabled: true },
    incrementalId: { enabled: true, taskIntervalMinutes: 10, taskStartDelayMinutes: 10 },
    analytics: { index: { enabled: true } },
    analyticsV2: {
      enabled: false,
      reconciliationIntervalMinutes: 30,
      enableAdminRoutes: false,
      resetTaskTimeoutMinutes: 60,
      resetPageDelayMs: 0,
    },
    templates: { enabled: true },
    casesRedesign: { list: false, details: false, settings: false },
    attachments: { enabled: true },
    ...overrides,
  };
}

describe('Cases Plugin', () => {
  let context: PluginInitializerContext;
  let plugin: CasePlugin;
  let coreSetup: ReturnType<typeof coreMock.createSetup>;
  let coreStart: ReturnType<typeof coreMock.createStart>;
  let pluginsSetup: jest.Mocked<CasesServerSetupDependencies>;
  let pluginsStart: jest.Mocked<CasesServerStartDependencies>;

  beforeEach(() => {
    context = coreMock.createPluginInitializerContext<ConfigType>(getConfig());

    plugin = new CasePlugin(context);
    coreSetup = coreMock.createSetup();
    coreStart = coreMock.createStart();

    pluginsSetup = {
      alerting: alertsMock.createSetup(),
      taskManager: taskManagerMock.createSetup(),
      actions: actionsMock.createSetup(),
      files: createFilesSetupMock(),
      lens: {
        lensEmbeddableFactory: makeLensEmbeddableFactory(
          () => ({}),
          () => ({}),
          {}
        ),
        registerVisualizationMigration: jest.fn(),
      },
      security: securityMock.createSetup(),
      licensing: licensingMock.createSetup(),
      usageCollection: usageCollectionPluginMock.createSetupContract(),
      features: featuresPluginMock.createSetup(),
    };

    pluginsStart = {
      licensing: licensingMock.createStart(),
      actions: actionsMock.createStart(),
      files: { fileServiceFactory: createFileServiceFactoryMock() },
      features: featuresPluginMock.createStart(),
      security: securityMock.createStart(),
      notifications: notificationsMock.createStart(),
      ruleRegistry: { getRacClientWithRequest: jest.fn(), alerting: alertsMock.createStart() },
      taskManager: taskManagerMock.createStart(),
      // Cases-analyticsV2 needs the dataViews plugin at start to manage the
      // Cases data view + runtime fields. The flag is off in the test
      // fixture so this mock is never actually called.
      dataViews: {
        dataViewsServiceFactory: jest.fn(),
        getScriptedFieldsEnabled: jest.fn().mockReturnValue(false),
      } as unknown as CasesServerStartDependencies['dataViews'],
    };
  });

  describe('setup()', () => {
    it('should start setup cases plugin correctly', async () => {
      plugin.setup(coreSetup, pluginsSetup);

      expect(context.logger.get().debug).toHaveBeenCalledWith(
        `Setting up Case Workflow with core contract [${Object.keys(
          coreSetup
        )}] and plugins [${Object.keys(pluginsSetup)}]`
      );
    });

    it('should register kibana feature when stack is enabled', async () => {
      plugin.setup(coreSetup, pluginsSetup);

      expect(pluginsSetup.features.registerKibanaFeature).toHaveBeenCalled();
    });

    it('should not register kibana feature when stack is disabled', async () => {
      context = coreMock.createPluginInitializerContext<ConfigType>(
        getConfig({ stack: { enabled: false } })
      );
      const pluginWithStackDisabled = new CasePlugin(context);

      pluginWithStackDisabled.setup(coreSetup, pluginsSetup);

      expect(pluginsSetup.features.registerKibanaFeature).not.toHaveBeenCalled();
    });

    it('should always register cases-attachments SO', async () => {
      plugin.setup(coreSetup, pluginsSetup);

      const registerTypeCalls = coreSetup.savedObjects.registerType.mock.calls;
      const attachmentSOCall = registerTypeCalls.find(
        (call) => call[0]?.name === CASE_ATTACHMENT_SAVED_OBJECT
      );
      expect(attachmentSOCall).toBeDefined();
    });
  });

  describe('start', () => {
    it('should start cases plugin correctly', async () => {
      const pluginStart = plugin.start(coreStart, pluginsStart);

      expect(context.logger.get().debug).toHaveBeenCalledWith(`Starting Case Workflow`);

      expect(pluginStart).toMatchInlineSnapshot(`
        Object {
          "config": Object {
            "analytics": Object {
              "index": Object {
                "enabled": true,
              },
            },
            "analyticsV2": Object {
              "enableAdminRoutes": false,
              "enabled": false,
              "reconciliationIntervalMinutes": 30,
              "resetPageDelayMs": 0,
              "resetTaskTimeoutMinutes": 60,
            },
            "attachments": Object {
              "enabled": true,
            },
            "casesRedesign": Object {
              "details": false,
              "list": false,
              "settings": false,
            },
            "enabled": true,
            "files": Object {
              "allowedMimeTypes": Array [
                "image/aces",
                "image/apng",
                "image/avci",
                "image/avcs",
                "image/avif",
                "image/bmp",
                "image/cgm",
                "image/dicom-rle",
                "image/dpx",
                "image/emf",
                "image/example",
                "image/fits",
                "image/g3fax",
                "image/heic",
                "image/heic-sequence",
                "image/heif",
                "image/heif-sequence",
                "image/hej2k",
                "image/hsj2",
                "image/jls",
                "image/jp2",
                "image/jpeg",
                "image/jph",
                "image/jphc",
                "image/jpm",
                "image/jpx",
                "image/jxr",
                "image/jxrA",
                "image/jxrS",
                "image/jxs",
                "image/jxsc",
                "image/jxsi",
                "image/jxss",
                "image/ktx",
                "image/ktx2",
                "image/naplps",
                "image/png",
                "image/prs.btif",
                "image/prs.pti",
                "image/pwg-raster",
                "image/svg+xml",
                "image/t38",
                "image/tiff",
                "image/tiff-fx",
                "image/vnd.adobe.photoshop",
                "image/vnd.airzip.accelerator.azv",
                "image/vnd.cns.inf2",
                "image/vnd.dece.graphic",
                "image/vnd.djvu",
                "image/vnd.dwg",
                "image/vnd.dxf",
                "image/vnd.dvb.subtitle",
                "image/vnd.fastbidsheet",
                "image/vnd.fpx",
                "image/vnd.fst",
                "image/vnd.fujixerox.edmics-mmr",
                "image/vnd.fujixerox.edmics-rlc",
                "image/vnd.globalgraphics.pgb",
                "image/vnd.microsoft.icon",
                "image/vnd.mix",
                "image/vnd.ms-modi",
                "image/vnd.mozilla.apng",
                "image/vnd.net-fpx",
                "image/vnd.pco.b16",
                "image/vnd.radiance",
                "image/vnd.sealed.png",
                "image/vnd.sealedmedia.softseal.gif",
                "image/vnd.sealedmedia.softseal.jpg",
                "image/vnd.svf",
                "image/vnd.tencent.tap",
                "image/vnd.valve.source.texture",
                "image/vnd.wap.wbmp",
                "image/vnd.xiff",
                "image/vnd.zbrush.pcx",
                "image/webp",
                "image/wmf",
                "text/plain",
                "text/csv",
                "text/json",
                "application/json",
                "application/zip",
                "application/x-zip-compressed",
                "application/gzip",
                "application/x-bzip",
                "application/x-bzip2",
                "application/x-7z-compressed",
                "application/x-tar",
                "application/pdf",
              ],
              "maxSize": 1,
            },
            "incrementalId": Object {
              "enabled": true,
              "taskIntervalMinutes": 10,
              "taskStartDelayMinutes": 10,
            },
            "markdownPlugins": Object {
              "lens": true,
            },
            "stack": Object {
              "enabled": true,
            },
            "templates": Object {
              "enabled": true,
            },
          },
          "getCasesClientWithRequest": [Function],
          "getExternalReferenceAttachmentTypeRegistry": [Function],
          "getPersistableStateAttachmentTypeRegistry": [Function],
          "getUnifiedAttachmentTypeRegistry": [Function],
        }
      `);
    });
  });
});
