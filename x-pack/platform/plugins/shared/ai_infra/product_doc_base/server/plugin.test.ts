/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { coreMock } from '@kbn/core/server/mocks';
import { licensingMock } from '@kbn/licensing-plugin/server/mocks';
import { taskManagerMock } from '@kbn/task-manager-plugin/server/mocks';
import { productDocInstallStatusSavedObjectTypeName } from '../common/consts';
import { ProductDocBasePlugin } from './plugin';
import type { ProductDocBaseSetupDependencies, ProductDocBaseStartDependencies } from './types';

jest.mock('./services/package_installer');
jest.mock('./services/search');
jest.mock('./services/doc_install_status');
jest.mock('./services/doc_manager');
jest.mock('./routes');
jest.mock('./tasks');
import { registerRoutes } from './routes';
import { PackageInstaller } from './services/package_installer';
import { registerTaskDefinitions, scheduleEnsureUpToDateTask } from './tasks';
import { DocumentationManager } from './services/doc_manager';

const PackageInstallMock = PackageInstaller as jest.Mock;
const DocumentationManagerMock = DocumentationManager as jest.Mock;

describe('ProductDocBasePlugin', () => {
  let initContext: ReturnType<typeof coreMock.createPluginInitializerContext>;
  let plugin: ProductDocBasePlugin;
  let pluginSetupDeps: ProductDocBaseSetupDependencies;
  let pluginStartDeps: ProductDocBaseStartDependencies;

  beforeEach(() => {
    initContext = coreMock.createPluginInitializerContext();
    plugin = new ProductDocBasePlugin(initContext);
    pluginSetupDeps = {
      taskManager: taskManagerMock.createSetup(),
    };
    pluginStartDeps = {
      licensing: licensingMock.createStart(),
      taskManager: taskManagerMock.createStart(),
    };

    PackageInstallMock.mockReturnValue({ ensureUpToDate: jest.fn().mockResolvedValue({}) });

    DocumentationManagerMock.mockReturnValue({
      install: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      uninstall: jest.fn().mockResolvedValue({}),
      getStatus: jest.fn().mockResolvedValue({}),
      getStatuses: jest.fn().mockResolvedValue({}),
      updateAll: jest.fn().mockResolvedValue({}),
      ensureDefaultProductDocumentation: jest.fn().mockResolvedValue(undefined),
      installSecurityLabs: jest.fn().mockResolvedValue({}),
      uninstallSecurityLabs: jest.fn().mockResolvedValue({}),
      getSecurityLabsStatus: jest.fn().mockResolvedValue({}),
      updateSecurityLabsAll: jest.fn().mockResolvedValue({}),
    });
  });

  afterEach(() => {
    (scheduleEnsureUpToDateTask as jest.Mock).mockReset();
  });

  describe('#setup', () => {
    it('register the routes', () => {
      plugin.setup(coreMock.createSetup(), pluginSetupDeps);

      expect(registerRoutes).toHaveBeenCalledTimes(1);
    });
    it('register the product-doc SO type', () => {
      const coreSetup = coreMock.createSetup();
      plugin.setup(coreSetup, pluginSetupDeps);

      expect(coreSetup.savedObjects.registerType).toHaveBeenCalledTimes(1);
      expect(coreSetup.savedObjects.registerType).toHaveBeenCalledWith(
        expect.objectContaining({
          name: productDocInstallStatusSavedObjectTypeName,
        })
      );
    });
    it('register the task definitions', () => {
      plugin.setup(coreMock.createSetup(), pluginSetupDeps);

      expect(registerTaskDefinitions).toHaveBeenCalledTimes(3);
    });
  });

  describe('#start', () => {
    it('returns a contract with the expected shape', () => {
      plugin.setup(coreMock.createSetup(), pluginSetupDeps);
      const startContract = plugin.start(coreMock.createStart(), pluginStartDeps);
      expect(startContract).toEqual({
        management: {
          getStatus: expect.any(Function),
          getStatuses: expect.any(Function),
          install: expect.any(Function),
          uninstall: expect.any(Function),
          update: expect.any(Function),
          updateAll: expect.any(Function),
          updateSecurityLabsAll: expect.any(Function),
          installSecurityLabs: expect.any(Function),
          uninstallSecurityLabs: expect.any(Function),
          getSecurityLabsStatus: expect.any(Function),
        },
        search: expect.any(Function),
      });
    });

    it('ensures default inference ID documentation on startup', () => {
      plugin.setup(coreMock.createSetup(), pluginSetupDeps);
      plugin.start(coreMock.createStart(), pluginStartDeps);
      expect(DocumentationManagerMock().ensureDefaultProductDocumentation).toHaveBeenCalledTimes(1);
    });
  });
});
