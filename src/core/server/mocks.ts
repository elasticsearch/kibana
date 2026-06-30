/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { of } from 'rxjs';
import { duration } from 'moment';
import { ByteSizeValue } from '@kbn/config-schema';
import { isPromise } from '@kbn/std';
import { loggingSystemMock } from '@kbn/core-logging-server-mocks';
import { nodeServiceMock } from '@kbn/core-node-server-mocks';
import { elasticsearchServiceMock } from '@kbn/core-elasticsearch-server-mocks';
import { typeRegistryMock as savedObjectsTypeRegistryMock } from '@kbn/core-saved-objects-base-server-mocks';
import { savedObjectsServiceMock } from '@kbn/core-saved-objects-server-mocks';
import { savedObjectsClientMock } from '@kbn/core-saved-objects-api-server-mocks';
import { deprecationsServiceMock } from '@kbn/core-deprecations-server-mocks';
import { uiSettingsServiceMock } from '@kbn/core-ui-settings-server-mocks';
import { coreLifecycleMock, coreInternalLifecycleMock } from '@kbn/core-lifecycle-server-mocks';
import { securityServiceMock } from '@kbn/core-security-server-mocks';
import { userProfileServiceMock } from '@kbn/core-user-profile-server-mocks';
import { i18nServiceMock } from '@kbn/core-i18n-server-mocks';
import type { SharedGlobalConfig, PluginInitializerContext } from '@kbn/core-plugins-server';
import { coreFeatureFlagsMock } from '@kbn/core-feature-flags-server-mocks';

export { configServiceMock, configDeprecationsMock } from '@kbn/config-mocks';
export { loggingSystemMock } from '@kbn/core-logging-server-mocks';
export { httpServerMock, sessionStorageMock, httpServiceMock } from '@kbn/core-http-server-mocks';
export { elasticsearchServiceMock } from '@kbn/core-elasticsearch-server-mocks';
export { typeRegistryMock as savedObjectsTypeRegistryMock } from '@kbn/core-saved-objects-base-server-mocks';
export { httpResourcesMock } from '@kbn/core-http-resources-server-mocks';
export { savedObjectsServiceMock } from '@kbn/core-saved-objects-server-mocks';
export {
  savedObjectsClientMock,
  savedObjectsRepositoryMock,
} from '@kbn/core-saved-objects-api-server-mocks';
export { migrationMocks } from '@kbn/core-saved-objects-migration-server-mocks';
export { uiSettingsServiceMock } from '@kbn/core-ui-settings-server-mocks';
export { metricsServiceMock } from '@kbn/core-metrics-server-mocks';
export { renderingServiceMock } from '@kbn/core-rendering-server-mocks';
export { statusServiceMock } from '@kbn/core-status-server-mocks';
export { contextServiceMock } from '@kbn/core-http-context-server-mocks';
export { capabilitiesServiceMock } from '@kbn/core-capabilities-server-mocks';
export { deprecationsServiceMock } from '@kbn/core-deprecations-server-mocks';
export { coreUsageDataServiceMock } from '@kbn/core-usage-data-server-mocks';
export { i18nServiceMock } from '@kbn/core-i18n-server-mocks';
export { executionContextServiceMock } from '@kbn/core-execution-context-server-mocks';
export { coreFeatureFlagsMock } from '@kbn/core-feature-flags-server-mocks';
export { docLinksServiceMock } from '@kbn/core-doc-links-server-mocks';
export { analyticsServiceMock } from '@kbn/core-analytics-server-mocks';
export { securityServiceMock } from '@kbn/core-security-server-mocks';
export { userProfileServiceMock } from '@kbn/core-user-profile-server-mocks';

export type {
  ElasticsearchClientMock,
  ClusterClientMock,
  ScopedClusterClientMock,
} from '@kbn/core-elasticsearch-client-server-mocks';

type MockedPluginInitializerConfig<T> = jest.Mocked<PluginInitializerContext<T>['config']>;

export function pluginInitializerContextConfigMock<T>(config: T) {
  const globalConfig: SharedGlobalConfig = {
    elasticsearch: {
      shardTimeout: duration('30s'),
      requestTimeout: duration('30s'),
    },
    path: { data: '/tmp' },
    savedObjects: {
      maxImportPayloadBytes: new ByteSizeValue(26214400),
    },
  };

  const mock: MockedPluginInitializerConfig<T> = {
    legacy: {
      globalConfig$: of(globalConfig),
      get: () => globalConfig,
    },
    create: jest.fn().mockReturnValue(of(config)),
    get: jest.fn().mockReturnValue(config),
  };

  return mock;
}

export type PluginInitializerContextMock<T> = Omit<PluginInitializerContext<T>, 'config'> & {
  config: MockedPluginInitializerConfig<T>;
};

function pluginInitializerContextMock<T>(config: T = {} as T) {
  const mock: PluginInitializerContextMock<T> = {
    opaqueId: Symbol(),
    logger: loggingSystemMock.create(),
    env: {
      mode: {
        dev: true,
        name: 'development',
        prod: false,
      },
      packageInfo: {
        version: 'version',
        branch: 'branch',
        buildNum: 100,
        buildSha: 'buildSha',
        buildShaShort: 'buildShaShort',
        dist: false,
        buildDate: new Date('2023-05-15T23:12:09.000Z'),
        buildFlavor: 'traditional',
      },
      instanceUuid: 'instance-uuid',
      configs: ['/some/path/to/config/kibana.yml'],
      airgapped: false,
    },
    config: pluginInitializerContextConfigMock<T>(config),
    node: nodeServiceMock.createInternalPrebootContract(),
  };

  return mock;
}

function createCoreRequestHandlerContextMock() {
  return {
    featureFlags: coreFeatureFlagsMock.createRequestHandlerContext(),
    savedObjects: {
      client: savedObjectsClientMock.create(),
      typeRegistry: savedObjectsTypeRegistryMock.create(),
      getClient: savedObjectsClientMock.create,
      getExporter: savedObjectsServiceMock.createExporter,
      getImporter: savedObjectsServiceMock.createImporter,
    },
    elasticsearch: {
      client: elasticsearchServiceMock.createScopedClusterClient(),
    },
    uiSettings: {
      client: uiSettingsServiceMock.createClient(),
      globalClient: uiSettingsServiceMock.createClient(),
    },
    deprecations: {
      client: deprecationsServiceMock.createClient(),
    },
    security: securityServiceMock.createRequestHandlerContext(),
    userProfile: userProfileServiceMock.createRequestHandlerContext(),
    i18n: i18nServiceMock.createRequestClient(),
  };
}

export type CustomRequestHandlerMock<T> = {
  core: Promise<ReturnType<typeof createCoreRequestHandlerContextMock>>;
  resolve: jest.MockedFunction<any>;
} & {
  [Key in keyof T]: T[Key] extends Promise<unknown> ? T[Key] : Promise<T[Key]>;
};

const createCustomRequestHandlerContextMock = <T extends Record<string, unknown>>(
  contextParts: T
): CustomRequestHandlerMock<T> => {
  const mock = Object.entries(contextParts).reduce(
    (context, [key, value]) => {
      // @ts-expect-error type matching from inferred types is hard
      context[key] = isPromise(value) ? value : Promise.resolve(value);
      return context;
    },
    {
      core: Promise.resolve(createCoreRequestHandlerContextMock()),
    } as CustomRequestHandlerMock<T>
  );

  mock.resolve = jest.fn().mockImplementation(async () => {
    const resolved = {};
    for (const propName of Object.keys(mock)) {
      if (propName === 'resolve') {
        continue;
      }
      // @ts-expect-error type matching from inferred types is hard
      resolved[propName] = await mock[propName];
    }
    return resolved;
  });

  return mock;
};

export const coreMock = {
  createPreboot: coreLifecycleMock.createPreboot,
  createSetup: coreLifecycleMock.createCoreSetup,
  createStart: coreLifecycleMock.createCoreStart,
  createInternalPreboot: coreInternalLifecycleMock.createInternalPreboot,
  createInternalSetup: coreInternalLifecycleMock.createInternalSetup,
  createInternalStart: coreInternalLifecycleMock.createInternalStart,
  createPluginInitializerContext: pluginInitializerContextMock,
  createRequestHandlerContext: createCoreRequestHandlerContextMock,
  createCustomRequestHandlerContext: createCustomRequestHandlerContextMock,
};
