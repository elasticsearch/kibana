/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { uniq } from 'lodash';
import type { ApmSourceAccessPluginStart } from '@kbn/apm-sources-access-plugin/public';
import { createStubIndexPattern } from '@kbn/data-views-plugin/common/data_view.stub';
import { createApmContextService } from '@kbn/discover-utils';
import { createDataViewDataSource, createEsqlDataSource } from '../../../common/data_sources';
import { createContextAwarenessMocks, createProfileProviderSharedServicesMock } from '../__mocks__';
import { createExampleRootProfileProvider } from './example/example_root_profile';
import { createExampleDataSourceProfileProvider } from './example/example_data_source_profile/profile';
import { createExampleDocumentProfileProvider } from './example/example_document_profile';
import { registerProfileProviders } from './register_profile_providers';
import type { BaseProfileProvider } from '../profile_service';
import { SolutionType } from '../profiles';
import { METRICS_DATA_SOURCE_PROFILE_ID } from './common/metrics_data_source_profile/profile';
import { OBSERVABILITY_TRACES_DATA_SOURCE_PROFILE_ID } from './observability/traces_data_source_profile/profile';
import { SECURITY_PROFILE_ID } from './security/constants';
import { SPARKLINE_DATA_SOURCE_PROFILE_ID } from './common/sparkline_data_source_profile/profile';

const levels = ['root', 'data-source', 'document'];
let mockAllCollectedProfiles: Array<{ level: string; profileId: string }> = [];

jest.mock('./register_enabled_profile_providers', () => {
  const real = jest.requireActual('./register_enabled_profile_providers');
  return {
    ...real,
    registerEnabledProfileProviders: jest.fn((params) => {
      let level = 'unknown';
      levels.forEach((l) => {
        if (params.profileService.defaultContext.profileId.includes(l)) {
          level = l;
        }
      });
      mockAllCollectedProfiles.push(
        ...params.providers.map((p: BaseProfileProvider<{}, {}>) => {
          return { level, profileId: p.profileId };
        })
      );
      return real.registerEnabledProfileProviders(params);
    }),
  };
});

const exampleRootProfileProvider = createExampleRootProfileProvider();
const exampleDataSourceProfileProvider = createExampleDataSourceProfileProvider();
const exampleDocumentProfileProvider = createExampleDocumentProfileProvider();
const DEFAULT_DATA_SOURCE_PROFILE_ID = 'default-data-source-profile';
const CUSTOM_TRACES_INDEX_PATTERN = 'logs-custom-traces-*';
const LOG_PROFILE_CASES: Array<[profileId: string, indexPattern: string]> = [
  ['observability-logs-data-source-profile', 'logs-custom-*'],
  ['observability-apache-error-logs-data-source-profile', 'logs-apache.error-*'],
  ['observability-aws-s3access-logs-data-source-profile', 'logs-aws.s3access-*'],
  [
    'observability-kubernetes-container-logs-data-source-profile',
    'logs-kubernetes.container_logs-*',
  ],
  ['observability-nginx-access-logs-data-source-profile', 'logs-nginx.access-*'],
  ['observability-nginx-error-logs-data-source-profile', 'logs-nginx.error-*'],
  ['observability-system-logs-data-source-profile', 'logs-system.syslog-*'],
  ['observability-windows-logs-data-source-profile', 'logs-windows.powershell-*'],
];

const setupObservabilityProfileStack = async () => {
  const profileProviderServices = createProfileProviderSharedServicesMock();
  jest.spyOn(profileProviderServices.core.pricing, 'isFeatureAvailable').mockReturnValue(true);
  const { rootProfileServiceMock, dataSourceProfileServiceMock, documentProfileServiceMock } =
    createContextAwarenessMocks({
      shouldRegisterProviders: false,
    });
  registerProfileProviders({
    rootProfileService: rootProfileServiceMock,
    dataSourceProfileService: dataSourceProfileServiceMock,
    documentProfileService: documentProfileServiceMock,
    enabledExperimentalProfileIds: [],
    sharedServices: profileProviderServices,
    services: profileProviderServices,
  });
  const rootContext = await rootProfileServiceMock.resolve({
    solutionNavId: SolutionType.Observability,
  });

  return {
    dataSourceProfileServiceMock,
    profileProviderServices,
    rootContext,
  };
};

const setupRootProfileService = () => {
  const profileProviderServices = createProfileProviderSharedServicesMock();
  const { rootProfileServiceMock, dataSourceProfileServiceMock, documentProfileServiceMock } =
    createContextAwarenessMocks({ shouldRegisterProviders: false });
  registerProfileProviders({
    rootProfileService: rootProfileServiceMock,
    dataSourceProfileService: dataSourceProfileServiceMock,
    documentProfileService: documentProfileServiceMock,
    enabledExperimentalProfileIds: [],
    sharedServices: profileProviderServices,
    services: profileProviderServices,
  });
  return rootProfileServiceMock;
};

describe('registerProfileProviders', () => {
  beforeEach(() => {
    mockAllCollectedProfiles = [];
  });

  it('should register enabled experimental profile providers', async () => {
    const profileProviderServices = createProfileProviderSharedServicesMock();
    const { rootProfileServiceMock, dataSourceProfileServiceMock, documentProfileServiceMock } =
      createContextAwarenessMocks({
        shouldRegisterProviders: false,
      });
    registerProfileProviders({
      rootProfileService: rootProfileServiceMock,
      dataSourceProfileService: dataSourceProfileServiceMock,
      documentProfileService: documentProfileServiceMock,
      enabledExperimentalProfileIds: [
        exampleRootProfileProvider.profileId,
        exampleDataSourceProfileProvider.profileId,
        exampleDocumentProfileProvider.profileId,
      ],
      sharedServices: profileProviderServices,
      services: profileProviderServices,
    });
    const rootContext = await rootProfileServiceMock.resolve({ solutionNavId: null });
    const dataSourceContext = await dataSourceProfileServiceMock.resolve({
      rootContext,
      dataSource: createEsqlDataSource(),
      query: { esql: 'from my-example-logs' },
    });
    const documentContext = documentProfileServiceMock.resolve({
      rootContext,
      dataSourceContext,
      record: {
        id: 'test',
        flattened: { 'data_stream.type': 'example' },
        raw: {},
      },
    });
    expect(rootContext.profileId).toBe(exampleRootProfileProvider.profileId);
    expect(dataSourceContext.profileId).toBe(exampleDataSourceProfileProvider.profileId);
    expect(documentContext.profileId).toBe(exampleDocumentProfileProvider.profileId);
  });

  it('should not register disabled experimental profile providers', async () => {
    const profileProviderServices = createProfileProviderSharedServicesMock();
    const { rootProfileServiceMock, dataSourceProfileServiceMock, documentProfileServiceMock } =
      createContextAwarenessMocks({
        shouldRegisterProviders: false,
      });
    registerProfileProviders({
      rootProfileService: rootProfileServiceMock,
      dataSourceProfileService: dataSourceProfileServiceMock,
      documentProfileService: documentProfileServiceMock,
      enabledExperimentalProfileIds: [],
      sharedServices: profileProviderServices,
      services: profileProviderServices,
    });
    const rootContext = await rootProfileServiceMock.resolve({ solutionNavId: null });
    const dataSourceContext = await dataSourceProfileServiceMock.resolve({
      rootContext,
      dataSource: createEsqlDataSource(),
      query: { esql: 'from my-example-logs' },
    });
    const documentContext = documentProfileServiceMock.resolve({
      rootContext,
      dataSourceContext,
      record: {
        id: 'test',
        flattened: { 'data_stream.type': 'example' },
        raw: {},
      },
    });
    expect(rootContext.profileId).not.toBe(exampleRootProfileProvider.profileId);
    expect(dataSourceContext.profileId).not.toBe(exampleDataSourceProfileProvider.profileId);
    expect(documentContext.profileId).not.toBe(exampleDocumentProfileProvider.profileId);
  });

  it('all profile ids should be unique', async () => {
    expect(mockAllCollectedProfiles.length).toBe(0);

    const profileProviderServices = createProfileProviderSharedServicesMock();
    const { rootProfileServiceMock, dataSourceProfileServiceMock, documentProfileServiceMock } =
      createContextAwarenessMocks({
        shouldRegisterProviders: false,
      });
    registerProfileProviders({
      rootProfileService: rootProfileServiceMock,
      dataSourceProfileService: dataSourceProfileServiceMock,
      documentProfileService: documentProfileServiceMock,
      enabledExperimentalProfileIds: [],
      sharedServices: profileProviderServices,
      services: profileProviderServices,
    });

    expect(mockAllCollectedProfiles.length).toBeGreaterThan(0);

    const allCollectedProfileIds = mockAllCollectedProfiles.map((p) => p.profileId);
    expect(allCollectedProfileIds).toEqual(uniq(allCollectedProfileIds));
  });

  it('distinguishes Search navigation from Classic navigation', async () => {
    const rootProfileService = setupRootProfileService();

    await expect(
      rootProfileService.resolve({ solutionNavId: SolutionType.Search })
    ).resolves.toEqual(expect.objectContaining({ solutionType: SolutionType.Search }));
    await expect(rootProfileService.resolve({ solutionNavId: null })).resolves.toEqual(
      expect.objectContaining({ solutionType: SolutionType.Default })
    );
  });

  it('registers Security after solution-agnostic profiles and before Observability profiles', () => {
    const profileProviderServices = createProfileProviderSharedServicesMock();
    const { rootProfileServiceMock, dataSourceProfileServiceMock, documentProfileServiceMock } =
      createContextAwarenessMocks({ shouldRegisterProviders: false });
    registerProfileProviders({
      rootProfileService: rootProfileServiceMock,
      dataSourceProfileService: dataSourceProfileServiceMock,
      documentProfileService: documentProfileServiceMock,
      enabledExperimentalProfileIds: [],
      sharedServices: profileProviderServices,
      services: profileProviderServices,
    });

    const dataSourceProfileIds = mockAllCollectedProfiles
      .filter(({ level }) => level === 'data-source')
      .map(({ profileId }) => profileId);
    const securityIndex = dataSourceProfileIds.indexOf(SECURITY_PROFILE_ID.dataSource);

    expect(securityIndex).toBeGreaterThan(
      dataSourceProfileIds.indexOf(SPARKLINE_DATA_SOURCE_PROFILE_ID)
    );
    expect(securityIndex).toBeLessThan(
      dataSourceProfileIds.indexOf(OBSERVABILITY_TRACES_DATA_SOURCE_PROFILE_ID)
    );
    expect(securityIndex).toBeLessThan(
      dataSourceProfileIds.indexOf('observability-logs-data-source-profile')
    );
  });

  describe('Observability cross-profile resolution', () => {
    it.each([
      ['an ordinary metrics pattern', 'TS metrics-*'],
      ['a logs-shaped pattern', 'TS metrics-logstash.otel-default'],
      ['a traces-shaped pattern', 'TS traces-apm-default'],
      ['a deprecation-logs pattern', 'TS .logs-deprecation.elasticsearch-default'],
      ['a leading line comment', '// metrics query\nTS metrics-*'],
      ['a leading block comment', '/* metrics query */\nTS metrics-*'],
      ['a split source command', 'TS\nmetrics-*'],
      [
        'a multiline pipeline of supported commands',
        `TS metrics-*
          | WHERE host.name == "test-host"
          | SORT @timestamp DESC
          | LIMIT 10`,
      ],
    ])('resolves the metrics profile for %s', async (_, query) => {
      const { dataSourceProfileServiceMock, rootContext } = await setupObservabilityProfileStack();
      const dataSourceContext = await dataSourceProfileServiceMock.resolve({
        rootContext,
        dataSource: createEsqlDataSource(),
        query: { esql: query },
      });

      expect(dataSourceContext.profileId).toBe(METRICS_DATA_SOURCE_PROFILE_ID);
    });

    it.each([
      ['an unsupported metrics command', 'TS metrics-* | STATS count()'],
      ['an invalid metrics query', 'TS metrics-* | WHERE'],
      ['a transformational traces query', 'FROM traces-* | STATS count()'],
      ['an invalid traces query', 'FROM traces-* | WHERE'],
    ])('uses the default profile for %s', async (_, query) => {
      const { dataSourceProfileServiceMock, rootContext } = await setupObservabilityProfileStack();
      const dataSourceContext = await dataSourceProfileServiceMock.resolve({
        rootContext,
        dataSource: createEsqlDataSource(),
        query: { esql: query },
      });

      expect(dataSourceContext.profileId).toBe(DEFAULT_DATA_SOURCE_PROFILE_ID);
    });

    it('resolves the traces profile for the default traces pattern', async () => {
      const { dataSourceProfileServiceMock, rootContext } = await setupObservabilityProfileStack();
      const dataSourceContext = await dataSourceProfileServiceMock.resolve({
        rootContext,
        dataSource: createEsqlDataSource(),
        query: { esql: 'FROM traces-*' },
      });

      expect(dataSourceContext.profileId).toBe(OBSERVABILITY_TRACES_DATA_SOURCE_PROFILE_ID);
    });

    it.each([
      [
        'an ES|QL query',
        {
          dataSource: createEsqlDataSource(),
          query: { esql: `FROM ${CUSTOM_TRACES_INDEX_PATTERN}` },
        },
      ],
      [
        'a data view',
        {
          dataSource: createDataViewDataSource({ dataViewId: CUSTOM_TRACES_INDEX_PATTERN }),
          dataView: createStubIndexPattern({ spec: { title: CUSTOM_TRACES_INDEX_PATTERN } }),
        },
      ],
    ])(
      'resolves the traces profile for a custom traces-shaped pattern in %s',
      async (_, params) => {
        const { dataSourceProfileServiceMock, profileProviderServices, rootContext } =
          await setupObservabilityProfileStack();
        const apmSourcesAccess = {
          getApmIndices: jest.fn().mockResolvedValue({
            transaction: CUSTOM_TRACES_INDEX_PATTERN,
            span: CUSTOM_TRACES_INDEX_PATTERN,
            error: '',
            metric: '',
            onboarding: '',
            sourcemap: '',
          }),
          getApmIndexSettings: jest.fn(),
          saveApmIndices: jest.fn(),
        } as ApmSourceAccessPluginStart;
        const configuredApmContextService = await createApmContextService({
          apmSourcesAccess,
        });
        profileProviderServices.apmContextService.tracesService =
          configuredApmContextService.tracesService;
        const dataSourceContext = await dataSourceProfileServiceMock.resolve({
          rootContext,
          ...params,
        });

        expect(dataSourceContext.profileId).toBe(OBSERVABILITY_TRACES_DATA_SOURCE_PROFILE_ID);
      }
    );

    describe.each(LOG_PROFILE_CASES)('%s', (profileId, indexPattern) => {
      it.each([
        [
          'an ES|QL query',
          {
            dataSource: createEsqlDataSource(),
            query: { esql: `FROM ${indexPattern}` },
          },
        ],
        [
          'a data view',
          {
            dataSource: createDataViewDataSource({ dataViewId: indexPattern }),
            dataView: createStubIndexPattern({ spec: { title: indexPattern } }),
          },
        ],
      ])('wins ahead of less-specific logs profiles for %s', async (_, params) => {
        const { dataSourceProfileServiceMock, rootContext } =
          await setupObservabilityProfileStack();
        const dataSourceContext = await dataSourceProfileServiceMock.resolve({
          rootContext,
          ...params,
        });

        expect(dataSourceContext.profileId).toBe(profileId);
      });
    });
  });

  it('all profile ids should be named appropriate to their context level', async () => {
    expect(mockAllCollectedProfiles.length).toBe(0);

    const profileProviderServices = createProfileProviderSharedServicesMock();
    const { rootProfileServiceMock, dataSourceProfileServiceMock, documentProfileServiceMock } =
      createContextAwarenessMocks({
        shouldRegisterProviders: false,
      });
    registerProfileProviders({
      rootProfileService: rootProfileServiceMock,
      dataSourceProfileService: dataSourceProfileServiceMock,
      documentProfileService: documentProfileServiceMock,
      enabledExperimentalProfileIds: [],
      sharedServices: profileProviderServices,
      services: profileProviderServices,
    });

    expect(mockAllCollectedProfiles.length).toBeGreaterThan(0);

    mockAllCollectedProfiles.forEach((item) => {
      expect(item.profileId.length).toBeGreaterThan(0);
      expect(item.level).not.toBe('unknown');
      if (levels.some((level) => item.profileId.includes(level))) {
        expect(item.profileId).toContain(item.level);
      }
    });
  });
});
