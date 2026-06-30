/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { elasticsearchServiceMock } from '@kbn/core-elasticsearch-server-mocks';
import { savedObjectsClientMock } from '@kbn/core-saved-objects-api-server-mocks';
import { securityMock } from '@kbn/security-plugin/server/mocks';

import { ElasticsearchAssetType } from '../../../../common/types';
import { appContextService } from '../../app_context';
import { updateCurrentWriteIndices } from '../elasticsearch/template/template';
import { deleteComponentTemplates } from '../elasticsearch/template/remove';

import { getInstalledPackageWithAssets, getInstallation } from './get';
import { updateEsAssetReferences } from './es_assets_reference';

import {
  handleIlmSettingsRestoreAfterPackageInstall,
  insertIlmComponentTemplate,
  syncIlmPolicy,
} from './namespace_ilm_settings';

jest.mock('./get');
jest.mock('../elasticsearch/template/template', () => {
  const actual = jest.requireActual('../elasticsearch/template/template');
  return {
    ...actual,
    updateCurrentWriteIndices: jest.fn(),
  };
});
jest.mock('../elasticsearch/template/remove');
jest.mock('./es_assets_reference');
jest.mock('../../app_context');
jest.mock('../elasticsearch/retry', () => ({
  retryTransientEsErrors: jest.fn((fn: () => unknown) => fn()),
}));

const mockedAppContextService = appContextService as jest.Mocked<typeof appContextService>;
mockedAppContextService.getSecuritySetup.mockImplementation(() => ({
  ...securityMock.createSetup(),
}));
mockedAppContextService.getLogger.mockReturnValue({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
} as any);
mockedAppContextService.getExperimentalFeatures.mockReturnValue({} as any);

const mockedGetInstalledPackageWithAssets = getInstalledPackageWithAssets as jest.MockedFunction<
  typeof getInstalledPackageWithAssets
>;
const mockedGetInstallation = getInstallation as jest.MockedFunction<typeof getInstallation>;
const mockedUpdateCurrentWriteIndices = updateCurrentWriteIndices as jest.MockedFunction<
  typeof updateCurrentWriteIndices
>;
const mockedDeleteComponentTemplates = deleteComponentTemplates as jest.MockedFunction<
  typeof deleteComponentTemplates
>;
const mockedUpdateEsAssetReferences = updateEsAssetReferences as jest.MockedFunction<
  typeof updateEsAssetReferences
>;

// ---------------------------------------------------------------------------
// insertIlmComponentTemplate — pure function tests
// ---------------------------------------------------------------------------

describe('insertIlmComponentTemplate', () => {
  it('inserts the ILM component template after {namespace}@custom', () => {
    const composedOf = [
      'logs-nginx.access@package',
      'logs@custom',
      'nginx@custom',
      'production@custom',
      'logs-nginx.access@custom',
    ];
    const result = insertIlmComponentTemplate(
      composedOf,
      'production',
      'logs-nginx.access',
      'logs-nginx.access@namespace.production'
    );
    expect(result).toEqual([
      'logs-nginx.access@package',
      'logs@custom',
      'nginx@custom',
      'production@custom',
      'logs-nginx.access@namespace.production',
      'logs-nginx.access@custom',
    ]);
  });

  it('inserts before dataset-level @custom when {namespace}@custom is absent', () => {
    const composedOf = [
      'logs-nginx.access@package',
      'logs@custom',
      'nginx@custom',
      'logs-nginx.access@custom',
    ];
    const result = insertIlmComponentTemplate(
      composedOf,
      'production',
      'logs-nginx.access',
      'logs-nginx.access@namespace.production'
    );
    expect(result).toEqual([
      'logs-nginx.access@package',
      'logs@custom',
      'nginx@custom',
      'logs-nginx.access@namespace.production',
      'logs-nginx.access@custom',
    ]);
  });

  it('appends at end when neither {namespace}@custom nor dataset-level @custom are present', () => {
    const composedOf = ['logs-nginx.access@package'];
    const result = insertIlmComponentTemplate(
      composedOf,
      'production',
      'logs-nginx.access',
      'logs-nginx.access@namespace.production'
    );
    expect(result).toEqual(['logs-nginx.access@package', 'logs-nginx.access@namespace.production']);
  });

  it('is a no-op when the ILM component template is already present', () => {
    const composedOf = [
      'logs-nginx.access@package',
      'production@custom',
      'logs-nginx.access@namespace.production',
      'logs-nginx.access@custom',
    ];
    const result = insertIlmComponentTemplate(
      composedOf,
      'production',
      'logs-nginx.access',
      'logs-nginx.access@namespace.production'
    );
    expect(result).toBe(composedOf);
  });
});

// ---------------------------------------------------------------------------
// Helpers shared by the remaining test suites
// ---------------------------------------------------------------------------

const BASE_COMPOSED_OF = [
  'logs-nginx.access@package',
  'logs@custom',
  'nginx@custom',
  'production@custom',
  'logs-nginx.access@custom',
];

function mockInstalledPackage(
  dataStreams: Array<{ dataset: string; type: string }> = [
    { dataset: 'nginx.access', type: 'logs' },
  ]
) {
  mockedGetInstalledPackageWithAssets.mockResolvedValue({
    packageInfo: { name: 'nginx', data_streams: dataStreams, policy_templates: [] },
    installation: { installed_es: [] },
  } as any);
}

function makeEsClientWithNamespaceTemplate(composedOf: string[] = BASE_COMPOSED_OF) {
  const esClient = elasticsearchServiceMock.createElasticsearchClient();
  esClient.indices.getIndexTemplate.mockResolvedValue({
    index_templates: [
      {
        name: 'logs-nginx.access@namespace.production',
        index_template: {
          composed_of: composedOf,
          index_patterns: ['logs-nginx.access-production.*'],
          priority: 250,
          template: { settings: {}, mappings: {} },
          data_stream: {},
          _meta: {},
        },
      },
    ],
  } as any);
  return esClient;
}

// ---------------------------------------------------------------------------
// syncIlmPolicy — set path
// ---------------------------------------------------------------------------

describe('syncIlmPolicy — set', () => {
  const soClient = savedObjectsClientMock.create();

  beforeEach(() => {
    jest.clearAllMocks();
    mockedAppContextService.getLogger.mockReturnValue({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as any);
    mockedAppContextService.getExperimentalFeatures.mockReturnValue({} as any);
    mockedUpdateCurrentWriteIndices.mockResolvedValue(undefined);
    mockedUpdateEsAssetReferences.mockResolvedValue([]);
  });

  it('skips when the package is not installed', async () => {
    mockedGetInstalledPackageWithAssets.mockResolvedValue(undefined);
    const esClient = elasticsearchServiceMock.createElasticsearchClient();

    const summary = await syncIlmPolicy({
      soClient,
      esClient,
      packageName: 'nginx',
      namespace: 'production',
      ilmPolicy: 'my-policy',
    });

    expect(summary.skipped).toBe(true);
    expect(esClient.cluster.putComponentTemplate).not.toHaveBeenCalled();
  });

  it('creates the ILM component template with the correct settings', async () => {
    mockInstalledPackage();
    mockedGetInstallation.mockResolvedValue({ installed_es: [] } as any);
    const esClient = makeEsClientWithNamespaceTemplate();

    await syncIlmPolicy({
      soClient,
      esClient,
      packageName: 'nginx',
      namespace: 'production',
      ilmPolicy: 'my-policy',
    });

    expect(esClient.cluster.putComponentTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'logs-nginx.access@namespace.production',
        template: expect.objectContaining({
          settings: expect.objectContaining({
            'index.lifecycle.name': 'my-policy',
          }),
        }),
      })
    );
  });

  it('patches the namespace index template composed_of to include the component template', async () => {
    mockInstalledPackage();
    mockedGetInstallation.mockResolvedValue({ installed_es: [] } as any);
    const esClient = makeEsClientWithNamespaceTemplate();

    await syncIlmPolicy({
      soClient,
      esClient,
      packageName: 'nginx',
      namespace: 'production',
      ilmPolicy: 'my-policy',
    });

    const putCalls = (esClient.indices.putIndexTemplate as unknown as jest.Mock).mock.calls;
    expect(putCalls).toHaveLength(1);
    const [putArgs] = putCalls;
    expect(putArgs[0].name).toBe('logs-nginx.access@namespace.production');
    expect(putArgs[0].composed_of).toContain('logs-nginx.access@namespace.production');
    // The ILM entry should come after production@custom
    const composedOf: string[] = putArgs[0].composed_of;
    expect(composedOf.indexOf('logs-nginx.access@namespace.production')).toBeGreaterThan(
      composedOf.indexOf('production@custom')
    );
  });

  it('tracks the component template in installed_es', async () => {
    mockInstalledPackage();
    mockedGetInstallation.mockResolvedValue({ installed_es: [] } as any);
    const esClient = makeEsClientWithNamespaceTemplate();

    await syncIlmPolicy({
      soClient,
      esClient,
      packageName: 'nginx',
      namespace: 'production',
      ilmPolicy: 'my-policy',
    });

    expect(mockedUpdateEsAssetReferences).toHaveBeenCalledWith(
      soClient,
      'nginx',
      [],
      expect.objectContaining({
        assetsToAdd: [
          {
            id: 'logs-nginx.access@namespace.production',
            type: ElasticsearchAssetType.componentTemplate,
          },
        ],
      })
    );
  });

  it('returns the updated template names in the summary', async () => {
    mockInstalledPackage();
    mockedGetInstallation.mockResolvedValue({ installed_es: [] } as any);
    const esClient = makeEsClientWithNamespaceTemplate();

    const summary = await syncIlmPolicy({
      soClient,
      esClient,
      packageName: 'nginx',
      namespace: 'production',
      ilmPolicy: 'my-policy',
    });

    expect(summary.updatedTemplates).toEqual(['logs-nginx.access@namespace.production']);
  });

  it('does not call putIndexTemplate when namespace index template is not found', async () => {
    mockInstalledPackage();
    mockedGetInstallation.mockResolvedValue({ installed_es: [] } as any);
    const esClient = elasticsearchServiceMock.createElasticsearchClient();
    esClient.indices.getIndexTemplate.mockRejectedValue({ meta: { statusCode: 404 } });

    await syncIlmPolicy({
      soClient,
      esClient,
      packageName: 'nginx',
      namespace: 'production',
      ilmPolicy: 'my-policy',
    });

    expect(esClient.indices.putIndexTemplate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// syncIlmPolicy — clear path
// ---------------------------------------------------------------------------

describe('syncIlmPolicy — clear', () => {
  const soClient = savedObjectsClientMock.create();

  beforeEach(() => {
    jest.clearAllMocks();
    mockedAppContextService.getLogger.mockReturnValue({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as any);
    mockedAppContextService.getExperimentalFeatures.mockReturnValue({} as any);
    mockedUpdateCurrentWriteIndices.mockResolvedValue(undefined);
    mockedDeleteComponentTemplates.mockResolvedValue(undefined);
    mockedUpdateEsAssetReferences.mockResolvedValue([]);
  });

  const ilmComposedOf = [
    ...BASE_COMPOSED_OF.slice(0, -1),
    'logs-nginx.access@namespace.production',
    'logs-nginx.access@custom',
  ];

  it('deletes the ILM component templates', async () => {
    mockInstalledPackage();
    mockedGetInstallation.mockResolvedValue({ installed_es: [] } as any);
    const esClient = makeEsClientWithNamespaceTemplate(ilmComposedOf);

    await syncIlmPolicy({
      soClient,
      esClient,
      packageName: 'nginx',
      namespace: 'production',
      ilmPolicy: undefined,
    });

    expect(mockedDeleteComponentTemplates).toHaveBeenCalledWith(esClient, [
      'logs-nginx.access@namespace.production',
    ]);
  });

  it('removes the ILM entry from the namespace index template composed_of', async () => {
    mockInstalledPackage();
    mockedGetInstallation.mockResolvedValue({ installed_es: [] } as any);
    const esClient = makeEsClientWithNamespaceTemplate(ilmComposedOf);

    await syncIlmPolicy({
      soClient,
      esClient,
      packageName: 'nginx',
      namespace: 'production',
      ilmPolicy: undefined,
    });

    const putCalls = (esClient.indices.putIndexTemplate as unknown as jest.Mock).mock.calls;
    expect(putCalls).toHaveLength(1);
    expect(putCalls[0][0].composed_of).not.toContain('logs-nginx.access@namespace.production');
  });

  it('removes the component templates from installed_es', async () => {
    mockInstalledPackage();
    mockedGetInstallation.mockResolvedValue({ installed_es: [] } as any);
    const esClient = makeEsClientWithNamespaceTemplate(ilmComposedOf);

    await syncIlmPolicy({
      soClient,
      esClient,
      packageName: 'nginx',
      namespace: 'production',
      ilmPolicy: undefined,
    });

    expect(mockedUpdateEsAssetReferences).toHaveBeenCalledWith(
      soClient,
      'nginx',
      [],
      expect.objectContaining({
        assetsToRemove: [
          {
            id: 'logs-nginx.access@namespace.production',
            type: ElasticsearchAssetType.componentTemplate,
          },
        ],
      })
    );
  });
});

// ---------------------------------------------------------------------------
// handleIlmSettingsRestoreAfterPackageInstall
// ---------------------------------------------------------------------------

describe('handleIlmSettingsRestoreAfterPackageInstall', () => {
  const soClient = savedObjectsClientMock.create();

  beforeEach(() => {
    jest.clearAllMocks();
    mockedAppContextService.getLogger.mockReturnValue({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as any);
    mockedAppContextService.getExperimentalFeatures.mockReturnValue({} as any);
    mockedUpdateCurrentWriteIndices.mockResolvedValue(undefined);
    mockedUpdateEsAssetReferences.mockResolvedValue([]);
  });

  it('is a no-op when no namespace has an ILM policy', async () => {
    mockedGetInstallation.mockResolvedValue({
      namespace_customization_settings: {},
    } as any);
    const esClient = elasticsearchServiceMock.createElasticsearchClient();

    await handleIlmSettingsRestoreAfterPackageInstall({
      soClient,
      esClient,
      packageName: 'nginx',
    });

    expect(esClient.cluster.putComponentTemplate).not.toHaveBeenCalled();
  });

  it('re-creates ILM component templates for each namespace with an ilm_policy', async () => {
    mockedGetInstallation
      .mockResolvedValueOnce({
        namespace_customization_settings: {
          production: { ilm_policy: 'my-policy' },
          staging: { ilm_policy: 'hot-warm' },
        },
        installed_es: [],
      } as any)
      .mockResolvedValue({ installed_es: [] } as any);

    mockInstalledPackage();
    const esClient = makeEsClientWithNamespaceTemplate();

    await handleIlmSettingsRestoreAfterPackageInstall({
      soClient,
      esClient,
      packageName: 'nginx',
    });

    const putCalls = (esClient.cluster.putComponentTemplate as unknown as jest.Mock).mock.calls;
    const names = putCalls.map((c: any) => c[0].name).sort();
    expect(names).toEqual([
      'logs-nginx.access@namespace.production',
      'logs-nginx.access@namespace.staging',
    ]);
  });
});
