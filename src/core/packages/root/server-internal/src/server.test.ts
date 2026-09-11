/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  mockElasticsearchService,
  mockHttpService,
  mockPluginsService,
  mockConfigService,
  mockSavedObjectsService,
  mockContextService,
  mockEnsureValidConfiguration,
  mockUiSettingsService,
  mockRenderingService,
  mockMetricsService,
  mockStatusService,
  mockLoggingService,
  mockI18nService,
  mockEnvironmentService,
  mockNodeService,
  mockPrebootService,
  mockDeprecationService,
  mockDocLinksService,
  mockCustomBrandingService,
  mockUserSettingsService,
  mockSecurityService,
  mockUserProfileService,
  mockInjectionService,
} from './server.test.mocks';

import { BehaviorSubject } from 'rxjs';
import { REPO_ROOT } from '@kbn/repo-info';
import { Env } from '@kbn/config';
import { rawConfigServiceMock, getEnvOptions } from '@kbn/config-mocks';
import { elasticsearchServiceMock } from '@kbn/core-elasticsearch-server-mocks';
import { savedObjectsServiceMock } from '@kbn/core-saved-objects-server-mocks';
import { Server } from './server';
import { MIGRATION_EXCEPTION_CODE } from './constants';

import { loggingSystemMock } from '@kbn/core-logging-server-mocks';
import type { InternalNodeServicePreboot } from '@kbn/core-node-server-internal';
import { CriticalError } from '@kbn/core-base-server-internal';

const env = Env.createDefault(REPO_ROOT, getEnvOptions());
const logger = loggingSystemMock.create();
const rawConfigService = rawConfigServiceMock.create({});

beforeEach(() => {
  mockConfigService.atPath.mockReturnValue(
    // config for `core` path, only one used with all the services being mocked
    new BehaviorSubject({ lifecycle: { disablePreboot: false } })
  );
  mockPluginsService.discover.mockResolvedValue({
    preboot: {
      pluginTree: { asOpaqueIds: new Map(), asNames: new Map() },
      pluginPaths: [],
      uiPlugins: { internal: new Map(), public: new Map(), browserConfigs: new Map() },
    },
    standard: {
      pluginTree: { asOpaqueIds: new Map(), asNames: new Map() },
      pluginPaths: [],
      uiPlugins: { internal: new Map(), public: new Map(), browserConfigs: new Map() },
    },
  });

  mockElasticsearchService.start.mockResolvedValue(elasticsearchServiceMock.createInternalStart());
  mockSavedObjectsService.start.mockResolvedValue(
    savedObjectsServiceMock.createInternalStartContract()
  );
});

afterEach(() => {
  jest.clearAllMocks();
  mockEnsureValidConfiguration.mockReset();
});

test('sets service.version global context to kibana version on traditional', () => {
  const loggingSystem = loggingSystemMock.create();
  const traditionalEnv = Env.createDefault(
    REPO_ROOT,
    getEnvOptions({ cliArgs: { serverless: false } })
  );

  new Server(rawConfigService, traditionalEnv, loggingSystem);

  expect(traditionalEnv.packageInfo.buildFlavor).toBe('traditional');
  expect(loggingSystem.setGlobalContext).toHaveBeenCalledTimes(1);
  expect(loggingSystem.setGlobalContext).toHaveBeenCalledWith({
    service: { state: 'initializing', type: 'kibana', version: traditionalEnv.packageInfo.version },
  });
});

test('sets service.version global context to build sha short on serverless', () => {
  const loggingSystem = loggingSystemMock.create();
  const serverlessEnv = Env.createDefault(
    REPO_ROOT,
    getEnvOptions({ cliArgs: { serverless: true } })
  );

  new Server(rawConfigService, serverlessEnv, loggingSystem);

  expect(serverlessEnv.packageInfo.buildFlavor).toBe('serverless');
  expect(loggingSystem.setGlobalContext).toHaveBeenCalledTimes(1);
  expect(loggingSystem.setGlobalContext).toHaveBeenCalledWith({
    service: {
      state: 'initializing',
      type: 'kibana',
      version: serverlessEnv.packageInfo.buildShaShort,
    },
  });
});

test('preboot services on "preboot"', async () => {
  const server = new Server(rawConfigService, env, logger);

  expect(mockEnvironmentService.preboot).not.toHaveBeenCalled();
  expect(mockNodeService.preboot).not.toHaveBeenCalled();
  expect(mockContextService.preboot).not.toHaveBeenCalled();
  expect(mockHttpService.preboot).not.toHaveBeenCalled();
  expect(mockI18nService.preboot).not.toHaveBeenCalled();
  expect(mockDocLinksService.setup).not.toHaveBeenCalled();
  expect(mockElasticsearchService.preboot).not.toHaveBeenCalled();
  expect(mockUiSettingsService.preboot).not.toHaveBeenCalled();
  expect(mockRenderingService.preboot).not.toHaveBeenCalled();
  expect(mockLoggingService.preboot).not.toHaveBeenCalled();
  expect(mockPluginsService.preboot).not.toHaveBeenCalled();
  expect(mockPrebootService.preboot).not.toHaveBeenCalled();
  expect(mockStatusService.preboot).not.toHaveBeenCalled();

  await server.preboot();

  expect(mockEnvironmentService.preboot).toHaveBeenCalledTimes(1);
  expect(mockNodeService.preboot).toHaveBeenCalledTimes(1);
  expect(mockContextService.preboot).toHaveBeenCalledTimes(1);
  expect(mockHttpService.preboot).toHaveBeenCalledTimes(1);
  expect(mockI18nService.preboot).toHaveBeenCalledTimes(1);
  expect(mockDocLinksService.setup).toHaveBeenCalledTimes(1);
  expect(mockElasticsearchService.preboot).toHaveBeenCalledTimes(1);
  expect(mockUiSettingsService.preboot).toHaveBeenCalledTimes(1);
  expect(mockRenderingService.preboot).toHaveBeenCalledTimes(1);
  expect(mockLoggingService.preboot).toHaveBeenCalledTimes(1);
  expect(mockPluginsService.preboot).toHaveBeenCalledTimes(1);
  expect(mockPrebootService.preboot).toHaveBeenCalledTimes(1);
  expect(mockStatusService.preboot).toHaveBeenCalledTimes(1);
});

test('sets up services on "setup"', async () => {
  const server = new Server(rawConfigService, env, logger);

  await server.preboot();

  expect(mockEnvironmentService.setup).not.toHaveBeenCalled();
  expect(mockHttpService.setup).not.toHaveBeenCalled();
  expect(mockElasticsearchService.setup).not.toHaveBeenCalled();
  expect(mockPluginsService.setup).not.toHaveBeenCalled();
  expect(mockSavedObjectsService.setup).not.toHaveBeenCalled();
  expect(mockUiSettingsService.setup).not.toHaveBeenCalled();
  expect(mockRenderingService.setup).not.toHaveBeenCalled();
  expect(mockMetricsService.setup).not.toHaveBeenCalled();
  expect(mockStatusService.setup).not.toHaveBeenCalled();
  expect(mockLoggingService.setup).not.toHaveBeenCalled();
  expect(mockI18nService.setup).not.toHaveBeenCalled();
  expect(mockDeprecationService.setup).not.toHaveBeenCalled();
  expect(mockCustomBrandingService.setup).not.toHaveBeenCalled();
  expect(mockUserSettingsService.setup).not.toHaveBeenCalled();
  expect(mockSecurityService.setup).not.toHaveBeenCalled();
  expect(mockSecurityService.setup).not.toHaveBeenCalled();
  expect(mockUserProfileService.setup).not.toHaveBeenCalled();
  expect(mockInjectionService.setup).not.toHaveBeenCalled();

  await server.setup();

  expect(mockEnvironmentService.setup).toHaveBeenCalled();
  expect(mockHttpService.setup).toHaveBeenCalledTimes(1);
  expect(mockElasticsearchService.setup).toHaveBeenCalledTimes(1);
  expect(mockPluginsService.setup).toHaveBeenCalledTimes(1);
  expect(mockSavedObjectsService.setup).toHaveBeenCalledTimes(1);
  expect(mockUiSettingsService.setup).toHaveBeenCalledTimes(1);
  expect(mockRenderingService.setup).toHaveBeenCalledTimes(1);
  expect(mockMetricsService.setup).toHaveBeenCalledTimes(1);
  expect(mockStatusService.setup).toHaveBeenCalledTimes(1);
  expect(mockLoggingService.setup).toHaveBeenCalledTimes(1);
  expect(mockI18nService.setup).toHaveBeenCalledTimes(1);
  expect(mockDeprecationService.setup).toHaveBeenCalledTimes(1);
  expect(mockDocLinksService.setup).toHaveBeenCalledTimes(2);
  expect(mockCustomBrandingService.setup).toHaveBeenCalledTimes(1);
  expect(mockUserSettingsService.setup).toHaveBeenCalledTimes(1);
  expect(mockSecurityService.setup).toHaveBeenCalledTimes(1);
  expect(mockUserProfileService.setup).toHaveBeenCalledTimes(1);
  expect(mockInjectionService.setup).toHaveBeenCalledTimes(1);
});

test('injects legacy dependency to context#setup()', async () => {
  const server = new Server(rawConfigService, env, logger);

  const pluginA = Symbol();
  const pluginB = Symbol();
  const pluginDependencies = new Map<symbol, symbol[]>([
    [pluginA, []],
    [pluginB, [pluginA]],
  ]);
  mockPluginsService.discover.mockResolvedValue({
    preboot: {
      pluginTree: { asOpaqueIds: new Map(), asNames: new Map() },
      pluginPaths: [],
      uiPlugins: { internal: new Map(), public: new Map(), browserConfigs: new Map() },
    },
    standard: {
      pluginTree: { asOpaqueIds: pluginDependencies, asNames: new Map() },
      pluginPaths: [],
      uiPlugins: { internal: new Map(), public: new Map(), browserConfigs: new Map() },
    },
  });

  await server.preboot();
  await server.setup();

  expect(mockContextService.setup).toHaveBeenCalledWith({
    pluginDependencies: new Map([
      [pluginA, []],
      [pluginB, [pluginA]],
    ]),
    // Backs `context.loadPluginContract()`; the context service knows a route's owner only by
    // opaque id, so the plugins service supplies the name lookup and the resolver.
    loadPluginContract: expect.any(Function),
  });
});

test('runs services on "start"', async () => {
  const server = new Server(rawConfigService, env, logger);

  await server.preboot();

  expect(mockHttpService.setup).not.toHaveBeenCalled();

  await server.setup();

  expect(mockHttpService.start).not.toHaveBeenCalled();
  expect(mockSavedObjectsService.start).not.toHaveBeenCalled();
  expect(mockUiSettingsService.start).not.toHaveBeenCalled();
  expect(mockMetricsService.start).not.toHaveBeenCalled();
  expect(mockStatusService.start).not.toHaveBeenCalled();
  expect(mockDeprecationService.start).not.toHaveBeenCalled();
  expect(mockDocLinksService.start).not.toHaveBeenCalled();
  expect(mockCustomBrandingService.start).not.toHaveBeenCalled();
  expect(mockSecurityService.start).not.toHaveBeenCalled();
  expect(mockUserProfileService.start).not.toHaveBeenCalled();
  expect(mockInjectionService.start).not.toHaveBeenCalled();

  await server.start();

  expect(mockHttpService.start).toHaveBeenCalledTimes(1);
  expect(mockSavedObjectsService.start).toHaveBeenCalledTimes(1);
  expect(mockUiSettingsService.start).toHaveBeenCalledTimes(1);
  expect(mockMetricsService.start).toHaveBeenCalledTimes(1);
  expect(mockStatusService.start).toHaveBeenCalledTimes(1);
  expect(mockDeprecationService.start).toHaveBeenCalledTimes(1);
  expect(mockDocLinksService.start).toHaveBeenCalledTimes(1);
  expect(mockCustomBrandingService.start).toHaveBeenCalledTimes(1);
  expect(mockSecurityService.start).toHaveBeenCalledTimes(1);
  expect(mockUserProfileService.start).toHaveBeenCalledTimes(1);
  expect(mockUserSettingsService.start).toHaveBeenCalledTimes(1);
  expect(mockInjectionService.start).toHaveBeenCalledTimes(1);
});

test('does not fail on "setup" if there are unused paths detected', async () => {
  mockConfigService.getUnusedPaths.mockResolvedValue(['some.path', 'another.path']);

  const server = new Server(rawConfigService, env, logger);

  await expect(server.preboot()).resolves.toBeDefined();
  await expect(server.setup()).resolves.toBeDefined();
});

test('stops services on "stop"', async () => {
  const server = new Server(rawConfigService, env, logger);

  await server.preboot();
  await server.setup();

  expect(mockHttpService.stop).not.toHaveBeenCalled();
  expect(mockElasticsearchService.stop).not.toHaveBeenCalled();
  expect(mockPluginsService.stop).not.toHaveBeenCalled();
  expect(mockNodeService.stop).not.toHaveBeenCalled();
  expect(mockSavedObjectsService.stop).not.toHaveBeenCalled();
  expect(mockUiSettingsService.stop).not.toHaveBeenCalled();
  expect(mockMetricsService.stop).not.toHaveBeenCalled();
  expect(mockStatusService.stop).not.toHaveBeenCalled();
  expect(mockLoggingService.stop).not.toHaveBeenCalled();
  expect(mockCustomBrandingService.stop).not.toHaveBeenCalled();
  expect(mockSecurityService.stop).not.toHaveBeenCalled();
  expect(mockUserProfileService.stop).not.toHaveBeenCalled();

  await server.stop();

  expect(mockHttpService.stop).toHaveBeenCalledTimes(1);
  expect(mockElasticsearchService.stop).toHaveBeenCalledTimes(1);
  expect(mockPluginsService.stop).toHaveBeenCalledTimes(1);
  expect(mockNodeService.stop).toHaveBeenCalledTimes(1);
  expect(mockSavedObjectsService.stop).toHaveBeenCalledTimes(1);
  expect(mockUiSettingsService.stop).toHaveBeenCalledTimes(1);
  expect(mockMetricsService.stop).toHaveBeenCalledTimes(1);
  expect(mockStatusService.stop).toHaveBeenCalledTimes(1);
  expect(mockLoggingService.stop).toHaveBeenCalledTimes(1);
  expect(mockCustomBrandingService.stop).toHaveBeenCalledTimes(1);
  expect(mockSecurityService.stop).toHaveBeenCalledTimes(1);
  expect(mockUserProfileService.stop).toHaveBeenCalledTimes(1);
});

test(`doesn't preboot core services if config validation fails`, async () => {
  mockEnsureValidConfiguration.mockImplementation(() => {
    throw new Error('Unknown configuration keys');
  });

  const server = new Server(rawConfigService, env, logger);

  await expect(server.preboot()).rejects.toThrowErrorMatchingInlineSnapshot(
    `"Unknown configuration keys"`
  );

  expect(mockContextService.preboot).not.toHaveBeenCalled();
  expect(mockHttpService.preboot).not.toHaveBeenCalled();
  expect(mockI18nService.preboot).not.toHaveBeenCalled();
  expect(mockElasticsearchService.preboot).not.toHaveBeenCalled();
  expect(mockUiSettingsService.preboot).not.toHaveBeenCalled();
  expect(mockRenderingService.preboot).not.toHaveBeenCalled();
  expect(mockLoggingService.preboot).not.toHaveBeenCalled();
  expect(mockPluginsService.preboot).not.toHaveBeenCalled();
  expect(mockPrebootService.preboot).not.toHaveBeenCalled();
});

describe('stripUnknownsWorkaround', () => {
  beforeEach(async () => {
    mockEnsureValidConfiguration.mockImplementation(() => {
      throw new Error('Unknown configuration keys');
    });
  });

  test(`aborts on the first validation attempt if enableStripUnknownConfigWorkaround is not true`, async () => {
    mockConfigService.atPath.mockReturnValue(
      new BehaviorSubject({ lifecycle: { disablePreboot: true } })
    );
    const server = new Server(rawConfigService, env, logger);
    await server.preboot();
    await expect(server.setup()).rejects.toThrowErrorMatchingInlineSnapshot(
      `"Unknown configuration keys"`
    );
    expect(mockEnsureValidConfiguration).toHaveBeenCalledTimes(1);
  });

  test(`tries again with stripUnknownKeys: true when enableStripUnknownConfigWorkaround is true`, async () => {
    mockConfigService.atPath.mockReturnValue(
      new BehaviorSubject({
        lifecycle: { disablePreboot: true },
        enableStripUnknownConfigWorkaround: true,
      })
    );

    const server = new Server(rawConfigService, env, logger);
    await server.preboot();
    await expect(server.setup()).rejects.toThrowErrorMatchingInlineSnapshot(
      `"Unknown configuration keys"`
    );
    expect(mockEnsureValidConfiguration).toHaveBeenCalledTimes(2);
    expect(mockEnsureValidConfiguration).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.objectContaining({ stripUnknownKeys: true })
    );
    expect(logger.get('config-validation').error).toHaveBeenCalledTimes(0); // No error logged as it lets the validation fail
  });

  test(`if the 2nd validation succeeds, it logs an error to highlight that it's running in compat mode`, async () => {
    mockEnsureValidConfiguration.mockImplementation(() => ({})); // Success by default
    mockEnsureValidConfiguration.mockRejectedValueOnce(new Error('Unknown configuration keys')); // Fail the first time

    mockConfigService.atPath.mockReturnValue(
      new BehaviorSubject({
        lifecycle: { disablePreboot: true },
        enableStripUnknownConfigWorkaround: true,
      })
    );

    const server = new Server(rawConfigService, env, logger);
    await server.preboot();
    await expect(server.setup()).resolves.toBeDefined();
    expect(mockEnsureValidConfiguration).toHaveBeenCalledTimes(2);
    expect(mockEnsureValidConfiguration).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.objectContaining({ stripUnknownKeys: true })
    );
    expect(logger.get('config-validation').error).toHaveBeenCalledTimes(1);
    expect(logger.get('config-validation').error).toHaveBeenCalledWith(
      expect.stringContaining(
        'Strict config validation failed! Extra unknown keys removed in Serverless-compatible mode. Original error'
      )
    );
  });
});

test('migrator-only node throws exception during start', async () => {
  rawConfigService.getConfig$.mockReturnValue(
    new BehaviorSubject({ node: { roles: ['migrator'] } })
  );
  const nodeServiceContract: InternalNodeServicePreboot = {
    roles: { migrator: true, ui: false, backgroundTasks: false },
  };
  mockNodeService.preboot.mockResolvedValue(nodeServiceContract);
  mockNodeService.start.mockReturnValue(nodeServiceContract);

  const server = new Server(rawConfigService, env, logger);

  await server.preboot();
  await server.setup();

  let migrationException: undefined | CriticalError;
  expect(mockSavedObjectsService.start).not.toHaveBeenCalled();
  await server.start().catch((e) => (migrationException = e));

  expect(mockSavedObjectsService.start).toHaveBeenCalledTimes(1);
  expect(mockSavedObjectsService.start).toHaveNthReturnedWith(1, expect.anything());

  expect(migrationException).not.toBeUndefined();
  expect(migrationException).toBeInstanceOf(CriticalError);
  expect(migrationException!.message).toBe('Migrations completed, shutting down Kibana');
  expect(migrationException!.code).toBe(MIGRATION_EXCEPTION_CODE);
  expect(migrationException!.processExitCode).toBe(0);
  expect(migrationException!.cause).toBeUndefined();
});

describe('When preboot is disabled', () => {
  beforeEach(() => {
    mockConfigService.atPath.mockReturnValue(
      // config for `core` path, only one used with all the services being mocked
      new BehaviorSubject({ lifecycle: { disablePreboot: true } })
    );
  });

  test('only preboots the mandatory services', async () => {
    const server = new Server(rawConfigService, env, logger);

    await server.preboot();

    expect(mockNodeService.preboot).toHaveBeenCalledTimes(1);
    expect(mockEnvironmentService.preboot).toHaveBeenCalledTimes(1);
    expect(mockUiSettingsService.preboot).toHaveBeenCalledTimes(1);
    expect(mockLoggingService.preboot).toHaveBeenCalledTimes(1);

    expect(mockContextService.preboot).not.toHaveBeenCalled();
    expect(mockHttpService.preboot).not.toHaveBeenCalled();
    expect(mockI18nService.preboot).not.toHaveBeenCalled();
    expect(mockElasticsearchService.preboot).not.toHaveBeenCalled();
    expect(mockRenderingService.preboot).not.toHaveBeenCalled();
    expect(mockPluginsService.preboot).not.toHaveBeenCalled();
    expect(mockPrebootService.preboot).not.toHaveBeenCalled();
    expect(mockStatusService.preboot).not.toHaveBeenCalled();
  });
});
