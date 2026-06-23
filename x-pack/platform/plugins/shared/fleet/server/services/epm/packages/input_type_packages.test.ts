/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { savedObjectsClientMock } from '@kbn/core/server/mocks';
import type { ElasticsearchClient } from '@kbn/core/server';

import { appContextService } from '../../app_context';
import { PackageNotFoundError } from '../../../errors';

import { dataStreamService } from '../../data_streams';

import { getInstalledPackageWithAssets, getInstallation } from './get';
import { installIndexTemplatesAndPipelines } from './install_index_template_pipeline';
import { optimisticallyAddEsAssetReferences } from './es_assets_reference';
import {
  installAssetsForInputPackagePolicy,
  installAssetsForCustomDatasetPolicy,
  getCustomDatasetStreams,
  removeAssetsForInputPackagePolicy,
  isInputPackageDatasetUsedByMultiplePolicies,
} from './input_type_packages';
import { cleanupAssets } from './remove';

jest.mock('../../data_streams');
jest.mock('./get');
jest.mock('./install_index_template_pipeline');
jest.mock('./es_assets_reference');
jest.mock('./remove');

const cleanupAssetsMock = cleanupAssets as jest.MockedFunction<typeof cleanupAssets>;

jest.mock('../../app_context', () => {
  const logger = { error: jest.fn(), debug: jest.fn(), warn: jest.fn(), info: jest.fn() };
  const mockedSavedObjectTagging = {
    createInternalAssignmentService: jest.fn(),
    createTagClient: jest.fn(),
  };

  return {
    appContextService: {
      getLogger: jest.fn(() => {
        return logger;
      }),
      getTelemetryEventsSender: jest.fn(),
      getSavedObjects: jest.fn(() => ({
        createImporter: jest.fn(),
      })),
      getConfig: jest.fn(() => ({})),
      getSavedObjectsTagging: jest.fn(() => mockedSavedObjectTagging),
      getInternalUserSOClientForSpaceId: jest.fn(),
      getExperimentalFeatures: jest.fn(),
    },
  };
});

describe('installAssetsForInputPackagePolicy', () => {
  beforeEach(() => {
    jest.mocked(optimisticallyAddEsAssetReferences).mockReset();
    jest.mocked(installIndexTemplatesAndPipelines).mockClear();
    const mockedLogger = jest.mocked(appContextService.getLogger());
    mockedLogger.debug.mockClear();
    mockedLogger.error.mockClear();
    mockedLogger.warn.mockClear();
    mockedLogger.info.mockClear();
  });

  it('should do nothing for non input package', async () => {
    const mockedLogger = jest.mocked(appContextService.getLogger());
    await installAssetsForInputPackagePolicy({
      pkgInfo: {
        type: 'integration',
      } as any,
      soClient: savedObjectsClientMock.create(),
      esClient: {} as ElasticsearchClient,
      force: false,
      logger: mockedLogger,
      packagePolicy: {} as any,
    });
    expect(jest.mocked(optimisticallyAddEsAssetReferences)).not.toBeCalled();
  });

  const TEST_PKG_INFO_INPUT = {
    type: 'input',
    name: 'test',
    version: '1.0.0',
    policy_templates: [
      {
        name: 'log',
        type: 'log',
      },
    ],
  };

  it('should throw for input package if package is not installed', async () => {
    jest.mocked(dataStreamService).getMatchingDataStreams.mockResolvedValue([]);
    jest.mocked(getInstalledPackageWithAssets).mockResolvedValue(undefined);
    const mockedLogger = jest.mocked(appContextService.getLogger());

    await expect(() =>
      installAssetsForInputPackagePolicy({
        pkgInfo: TEST_PKG_INFO_INPUT as any,
        soClient: savedObjectsClientMock.create(),
        esClient: {} as ElasticsearchClient,
        force: false,
        logger: mockedLogger,
        packagePolicy: {
          inputs: [
            {
              type: 'log',
              streams: [
                {
                  data_stream: { type: 'log' },
                  vars: { 'data_stream.dataset': { value: 'test.tata' } },
                },
              ],
            },
          ],
        } as any,
      })
    ).rejects.toThrowError(PackageNotFoundError);
  });

  it('should skip index template creation when existing data stream is owned by different package with force true', async () => {
    jest.mocked(getInstalledPackageWithAssets).mockResolvedValue({
      installation: { name: 'filestream', version: '2.0.0' },
      packageInfo: { ...TEST_PKG_INFO_INPUT, name: 'filestream', version: '2.0.0' },
      assetsMap: new Map(),
      paths: [],
    } as any);

    jest.mocked(dataStreamService).getMatchingDataStreams.mockResolvedValue([
      {
        name: 'logs-my_dataset-default',
        _meta: { package: { name: 'other_package' } },
      },
    ] as any);
    jest.mocked(dataStreamService).getMatchingIndexTemplate.mockResolvedValue(null);

    const mockedLogger = jest.mocked(appContextService.getLogger());

    await installAssetsForInputPackagePolicy({
      pkgInfo: { ...TEST_PKG_INFO_INPUT, name: 'filestream', version: '2.0.0' } as any,
      soClient: savedObjectsClientMock.create(),
      esClient: {} as ElasticsearchClient,
      force: true,
      logger: mockedLogger,
      packagePolicy: {
        inputs: [
          {
            name: 'log',
            type: 'log',
            streams: [
              {
                data_stream: { type: 'logs' },
                vars: { 'data_stream.dataset': { value: 'my_dataset' } },
              },
            ],
          },
        ],
      } as any,
    });

    expect(jest.mocked(installIndexTemplatesAndPipelines)).not.toHaveBeenCalled();
  });

  it('should skip index template creation when existing index template is owned by different package with force true', async () => {
    jest.mocked(getInstalledPackageWithAssets).mockResolvedValue({
      installation: { name: 'filestream', version: '2.0.0' },
      packageInfo: { ...TEST_PKG_INFO_INPUT, name: 'filestream', version: '2.0.0' },
      assetsMap: new Map(),
      paths: [],
    } as any);

    jest.mocked(dataStreamService).getMatchingDataStreams.mockResolvedValue([]);
    jest.mocked(dataStreamService).getMatchingIndexTemplate.mockResolvedValue({
      name: 'logs-my_dataset',
      _meta: { package: { name: 'other_package' } },
    } as any);

    const mockedLogger = jest.mocked(appContextService.getLogger());

    await installAssetsForInputPackagePolicy({
      pkgInfo: { ...TEST_PKG_INFO_INPUT, name: 'filestream', version: '2.0.0' } as any,
      soClient: savedObjectsClientMock.create(),
      esClient: {} as ElasticsearchClient,
      force: true,
      logger: mockedLogger,
      packagePolicy: {
        inputs: [
          {
            name: 'log',
            type: 'log',
            streams: [
              {
                data_stream: { type: 'logs' },
                vars: { 'data_stream.dataset': { value: 'my_dataset' } },
              },
            ],
          },
        ],
      } as any,
    });

    expect(jest.mocked(installIndexTemplatesAndPipelines)).not.toHaveBeenCalled();
  });

  it('should install templates when existing data stream has no _meta field', async () => {
    jest.mocked(getInstalledPackageWithAssets).mockResolvedValue({
      installation: { name: 'filestream', version: '2.0.0' },
      packageInfo: { ...TEST_PKG_INFO_INPUT, name: 'filestream', version: '2.0.0' },
      assetsMap: new Map(),
      paths: [],
    } as any);

    jest.mocked(dataStreamService).getMatchingDataStreams.mockResolvedValue([
      {
        name: 'logs-my_dataset-default',
      },
    ] as any);
    jest.mocked(dataStreamService).getMatchingIndexTemplate.mockResolvedValue(null);

    const mockedLogger = jest.mocked(appContextService.getLogger());

    await installAssetsForInputPackagePolicy({
      pkgInfo: { ...TEST_PKG_INFO_INPUT, name: 'filestream', version: '2.0.0' } as any,
      soClient: savedObjectsClientMock.create(),
      esClient: {} as ElasticsearchClient,
      force: true,
      logger: mockedLogger,
      packagePolicy: {
        inputs: [
          {
            name: 'log',
            type: 'log',
            streams: [
              {
                data_stream: { type: 'logs' },
                vars: { 'data_stream.dataset': { value: 'my_dataset' } },
              },
            ],
          },
        ],
      } as any,
    });

    expect(jest.mocked(installIndexTemplatesAndPipelines)).toHaveBeenCalled();
  });

  it('should install es index patterns for input package if package is installed', async () => {
    jest.mocked(dataStreamService).getMatchingDataStreams.mockResolvedValue([]);
    jest.mocked(dataStreamService).getMatchingIndexTemplate.mockResolvedValue(null);

    jest.mocked(getInstalledPackageWithAssets).mockResolvedValue({
      installation: {
        name: 'test',
        version: '1.0.0',
      },
      packageInfo: TEST_PKG_INFO_INPUT,
      assetsMap: new Map(),
      paths: [],
    } as any);

    const mockedLogger = jest.mocked(appContextService.getLogger());

    await installAssetsForInputPackagePolicy({
      pkgInfo: TEST_PKG_INFO_INPUT as any,

      soClient: savedObjectsClientMock.create(),
      esClient: {} as ElasticsearchClient,
      force: false,
      logger: mockedLogger,
      packagePolicy: {
        inputs: [
          {
            name: 'log',
            type: 'log',
            streams: [
              {
                data_stream: { type: 'log' },
                vars: { 'data_stream.dataset': { value: 'test.tata' } },
              },
            ],
          },
        ],
      } as any,
    });

    expect(jest.mocked(optimisticallyAddEsAssetReferences)).toBeCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      {
        'test.tata': 'log-test.tata-*',
      }
    );
  });

  it('should remove time_series index mode for non-metrics data stream types', async () => {
    jest.mocked(dataStreamService).getMatchingDataStreams.mockResolvedValue([]);

    const pkgInfoWithTimeSeries = {
      ...TEST_PKG_INFO_INPUT,
      elasticsearch: {
        index_mode: 'time_series',
        'index_template.mappings': {},
      },
    };

    jest.mocked(getInstalledPackageWithAssets).mockResolvedValue({
      installation: {
        name: 'test',
        version: '1.0.0',
      },
      packageInfo: pkgInfoWithTimeSeries,
      assetsMap: new Map(),
      paths: [],
    } as any);

    const mockedLogger = jest.mocked(appContextService.getLogger());

    await installAssetsForInputPackagePolicy({
      pkgInfo: pkgInfoWithTimeSeries as any,
      soClient: savedObjectsClientMock.create(),
      esClient: {} as ElasticsearchClient,
      force: false,
      logger: mockedLogger,
      packagePolicy: {
        inputs: [
          {
            name: 'log',
            type: 'log',
            streams: [
              {
                data_stream: { type: 'logs' },
                vars: { 'data_stream.dataset': { value: 'test.tata' } },
              },
            ],
          },
        ],
      } as any,
    });

    expect(mockedLogger.debug).toHaveBeenCalledWith(
      expect.stringContaining('Ignoring time_series index mode')
    );

    // Verify index_mode was actually removed
    const installCall = jest.mocked(installIndexTemplatesAndPipelines).mock.calls[0];
    const dataStreams = installCall?.[0]?.onlyForDataStreams;
    expect(dataStreams?.[0]?.elasticsearch?.index_mode).toBeUndefined();
  });

  it('should preserve time_series index mode for metrics data stream type', async () => {
    jest.mocked(dataStreamService).getMatchingDataStreams.mockResolvedValue([]);
    jest.mocked(dataStreamService).getMatchingIndexTemplate.mockResolvedValue(null);

    const pkgInfoWithTimeSeries = {
      type: 'input',
      name: 'test',
      version: '1.0.0',
      policy_templates: [
        {
          name: 'metrics',
          type: 'metrics',
        },
      ],
      elasticsearch: {
        index_mode: 'time_series',
        'index_template.mappings': {},
      },
    };

    jest.mocked(getInstalledPackageWithAssets).mockResolvedValue({
      installation: {
        name: 'test',
        version: '1.0.0',
      },
      packageInfo: pkgInfoWithTimeSeries,
      assetsMap: new Map(),
      paths: [],
    } as any);

    const mockedLogger = jest.mocked(appContextService.getLogger());

    await installAssetsForInputPackagePolicy({
      pkgInfo: pkgInfoWithTimeSeries as any,
      soClient: savedObjectsClientMock.create(),
      esClient: {} as ElasticsearchClient,
      force: false,
      logger: mockedLogger,
      packagePolicy: {
        inputs: [
          {
            name: 'metrics',
            type: 'metrics',
            streams: [
              {
                data_stream: { type: 'metrics' },
                vars: { 'data_stream.dataset': { value: 'test.metrics' } },
              },
            ],
          },
        ],
      } as any,
    });

    expect(mockedLogger.debug).not.toHaveBeenCalledWith(
      expect.stringContaining('Ignoring time_series index mode')
    );

    // Verify index_mode was preserved
    const installCall = jest.mocked(installIndexTemplatesAndPipelines).mock.calls[0];
    const dataStreams = installCall?.[0]?.onlyForDataStreams;
    expect(dataStreams?.[0]?.elasticsearch?.index_mode).toBe('time_series');
  });

  it('should use data_stream_type var when provided', async () => {
    jest.mocked(dataStreamService).getMatchingDataStreams.mockResolvedValue([]);

    const pkgInfoWithTimeSeries = {
      ...TEST_PKG_INFO_INPUT,
      elasticsearch: {
        index_mode: 'time_series',
        'index_template.mappings': {},
      },
    };

    jest.mocked(getInstalledPackageWithAssets).mockResolvedValue({
      installation: {
        name: 'test',
        version: '1.0.0',
      },
      packageInfo: pkgInfoWithTimeSeries,
      assetsMap: new Map(),
      paths: [],
    } as any);

    const mockedLogger = jest.mocked(appContextService.getLogger());

    await installAssetsForInputPackagePolicy({
      pkgInfo: pkgInfoWithTimeSeries as any,
      soClient: savedObjectsClientMock.create(),
      esClient: {} as ElasticsearchClient,
      force: false,
      logger: mockedLogger,
      packagePolicy: {
        inputs: [
          {
            name: 'traces',
            type: 'traces',
            streams: [
              {
                data_stream: { type: 'logs' },
                vars: {
                  'data_stream.dataset': { value: 'test.traces' },
                  'data_stream.type': { value: 'traces' },
                },
              },
            ],
          },
        ],
      } as any,
    });

    expect(mockedLogger.debug).toHaveBeenCalledWith(
      expect.stringContaining('Ignoring time_series index mode')
    );
    expect(mockedLogger.debug).toHaveBeenCalledWith(
      expect.stringContaining('data stream type is "traces"')
    );

    // Verify index_mode was removed
    const installCall = jest.mocked(installIndexTemplatesAndPipelines).mock.calls[0];
    const dataStreams = installCall?.[0]?.onlyForDataStreams;
    expect(dataStreams?.[0]?.elasticsearch?.index_mode).toBeUndefined();
  });

  it('should add time_series index mode for OTel metrics data streams when not present', async () => {
    jest.mocked(dataStreamService).getMatchingDataStreams.mockResolvedValue([]);
    jest.mocked(dataStreamService).getMatchingIndexTemplate.mockResolvedValue(null);

    const pkgInfoWithoutTimeSeries = {
      type: 'input',
      name: 'otel',
      version: '1.0.0',
      policy_templates: [
        {
          name: 'metrics',
          type: 'metrics',
        },
      ],
      // No elasticsearch config with index_mode
    };

    jest.mocked(getInstalledPackageWithAssets).mockResolvedValue({
      installation: {
        name: 'otel',
        version: '1.0.0',
      },
      packageInfo: pkgInfoWithoutTimeSeries,
      assetsMap: new Map(),
      paths: [],
    } as any);

    const mockedLogger = jest.mocked(appContextService.getLogger());

    await installAssetsForInputPackagePolicy({
      pkgInfo: pkgInfoWithoutTimeSeries as any,
      soClient: savedObjectsClientMock.create(),
      esClient: {} as ElasticsearchClient,
      force: false,
      logger: mockedLogger,
      packagePolicy: {
        inputs: [
          {
            name: 'otelcol',
            type: 'otelcol',
            streams: [
              {
                data_stream: { type: 'metrics' },
                vars: { 'data_stream.dataset': { value: 'otel.metrics' } },
              },
            ],
          },
        ],
      } as any,
    });

    expect(mockedLogger.debug).toHaveBeenCalledWith(
      expect.stringContaining('Adding time_series index mode for OTel package')
    );
    expect(mockedLogger.debug).toHaveBeenCalledWith(
      expect.stringContaining('data stream type is "metrics"')
    );

    // Verify index_mode was added
    const installCall = jest.mocked(installIndexTemplatesAndPipelines).mock.calls[0];
    const dataStreams = installCall?.[0]?.onlyForDataStreams;
    expect(dataStreams?.[0]?.elasticsearch?.index_mode).toBe('time_series');
  });

  it('should preserve existing time_series index mode for OTel metrics data streams', async () => {
    jest.mocked(dataStreamService).getMatchingDataStreams.mockResolvedValue([]);
    jest.mocked(dataStreamService).getMatchingIndexTemplate.mockResolvedValue(null);

    const pkgInfoWithTimeSeries = {
      type: 'input',
      name: 'otel',
      version: '1.0.0',
      policy_templates: [
        {
          name: 'metrics',
          type: 'metrics',
        },
      ],
      elasticsearch: {
        index_mode: 'time_series',
        'index_template.mappings': {},
      },
    };

    jest.mocked(getInstalledPackageWithAssets).mockResolvedValue({
      installation: {
        name: 'otel',
        version: '1.0.0',
      },
      packageInfo: pkgInfoWithTimeSeries,
      assetsMap: new Map(),
      paths: [],
    } as any);

    const mockedLogger = jest.mocked(appContextService.getLogger());

    await installAssetsForInputPackagePolicy({
      pkgInfo: pkgInfoWithTimeSeries as any,
      soClient: savedObjectsClientMock.create(),
      esClient: {} as ElasticsearchClient,
      force: false,
      logger: mockedLogger,
      packagePolicy: {
        inputs: [
          {
            name: 'otelcol',
            type: 'otelcol',
            streams: [
              {
                data_stream: { type: 'metrics' },
                vars: { 'data_stream.dataset': { value: 'otel.metrics' } },
              },
            ],
          },
        ],
      } as any,
    });

    // Should not log about ignoring or adding time_series
    expect(mockedLogger.debug).not.toHaveBeenCalledWith(
      expect.stringContaining('Ignoring time_series index mode')
    );
    expect(mockedLogger.debug).not.toHaveBeenCalledWith(
      expect.stringContaining('Adding time_series index mode')
    );

    // Verify index_mode was preserved
    const installCall = jest.mocked(installIndexTemplatesAndPipelines).mock.calls[0];
    const dataStreams = installCall?.[0]?.onlyForDataStreams;
    expect(dataStreams?.[0]?.elasticsearch?.index_mode).toBe('time_series');
  });

  it('should not add time_series index mode for non-OTel metrics data streams without it', async () => {
    jest.mocked(dataStreamService).getMatchingDataStreams.mockResolvedValue([]);

    const pkgInfoWithoutTimeSeries = {
      type: 'input',
      name: 'test',
      version: '1.0.0',
      policy_templates: [
        {
          name: 'metrics',
          type: 'metrics',
        },
      ],
      // No elasticsearch config with index_mode
    };

    jest.mocked(getInstalledPackageWithAssets).mockResolvedValue({
      installation: {
        name: 'test',
        version: '1.0.0',
      },
      packageInfo: pkgInfoWithoutTimeSeries,
      assetsMap: new Map(),
      paths: [],
    } as any);

    const mockedLogger = jest.mocked(appContextService.getLogger());

    await installAssetsForInputPackagePolicy({
      pkgInfo: pkgInfoWithoutTimeSeries as any,
      soClient: savedObjectsClientMock.create(),
      esClient: {} as ElasticsearchClient,
      force: false,
      logger: mockedLogger,
      packagePolicy: {
        inputs: [
          {
            name: 'log',
            type: 'log',
            streams: [
              {
                data_stream: { type: 'metrics' },
                vars: { 'data_stream.dataset': { value: 'test.metrics' } },
              },
            ],
          },
        ],
      } as any,
    });

    expect(mockedLogger.debug).not.toHaveBeenCalledWith(
      expect.stringContaining('Adding time_series index mode')
    );

    // Verify index_mode was not added
    const installCall = jest.mocked(installIndexTemplatesAndPipelines).mock.calls[0];
    const dataStreams = installCall?.[0]?.onlyForDataStreams;
    expect(dataStreams?.[0]?.elasticsearch?.index_mode).toBeUndefined();
  });

  describe('with dynamic_signal_types', () => {
    const OTEL_PKG_INFO_DYNAMIC_SIGNAL_TYPES = {
      type: 'input',
      name: 'otel',
      version: '1.0.0',
      policy_templates: [
        {
          name: 'otel',
          type: 'logs',
          input: 'otelcol',
          dynamic_signal_types: true,
        },
      ],
    };

    const OTEL_PKG_INFO_DYNAMIC_SIGNAL_TYPES_NO_TYPE = {
      type: 'input',
      name: 'otel',
      version: '1.0.0',
      policy_templates: [
        {
          name: 'otel',
          input: 'otelcol',
          template_path: 'otel/otel.hbl',
          dynamic_signal_types: true,
        },
      ],
    };

    const OTEL_PKG_INFO_NO_DYNAMIC_SIGNAL_TYPES = {
      type: 'input',
      name: 'otel',
      version: '1.0.0',
      policy_templates: [
        {
          name: 'otel',
          type: 'logs',
          input: 'otelcol',
          dynamic_signal_types: false,
        },
      ],
    };

    const OTEL_PKG_INFO_WITHOUT_FLAG = {
      type: 'input',
      name: 'otel',
      version: '1.0.0',
      policy_templates: [
        {
          name: 'otel',
          type: 'logs',
          input: 'otelcol',
        },
      ],
    };

    beforeEach(() => {
      jest.mocked(installIndexTemplatesAndPipelines).mockReset();
      jest.mocked(dataStreamService).getMatchingDataStreams.mockResolvedValue([]);
      jest.mocked(dataStreamService).getMatchingIndexTemplate.mockResolvedValue(null);
    });

    it('should install index templates for all signal types when dynamic_signal_types is true', async () => {
      jest.mocked(getInstalledPackageWithAssets).mockResolvedValue({
        installation: {
          name: 'otel',
          version: '1.0.0',
        },
        packageInfo: OTEL_PKG_INFO_DYNAMIC_SIGNAL_TYPES,
        assetsMap: new Map(),
        paths: [],
      } as any);
      const mockedLogger = jest.mocked(appContextService.getLogger());

      await installAssetsForInputPackagePolicy({
        pkgInfo: OTEL_PKG_INFO_DYNAMIC_SIGNAL_TYPES as any,
        soClient: savedObjectsClientMock.create(),
        esClient: {} as ElasticsearchClient,
        force: false,
        logger: mockedLogger,
        packagePolicy: {
          inputs: [
            {
              name: 'otel',
              type: 'otelcol',
              streams: [
                {
                  data_stream: { type: 'logs' },
                  vars: { 'data_stream.dataset': { value: 'otel.test' } },
                },
              ],
            },
          ],
        } as any,
      });

      // Should be called 3 times (once for each signal type: logs, metrics, traces)
      expect(jest.mocked(installIndexTemplatesAndPipelines)).toHaveBeenCalledTimes(3);

      // Verify it was called for logs
      expect(jest.mocked(installIndexTemplatesAndPipelines)).toHaveBeenCalledWith(
        expect.objectContaining({
          onlyForDataStreams: [
            expect.objectContaining({
              type: 'logs',
              dataset: 'otel.test',
            }),
          ],
        })
      );

      // Verify it was called for metrics
      expect(jest.mocked(installIndexTemplatesAndPipelines)).toHaveBeenCalledWith(
        expect.objectContaining({
          onlyForDataStreams: [
            expect.objectContaining({
              type: 'metrics',
              dataset: 'otel.test',
            }),
          ],
        })
      );

      // Verify it was called for traces
      expect(jest.mocked(installIndexTemplatesAndPipelines)).toHaveBeenCalledWith(
        expect.objectContaining({
          onlyForDataStreams: [
            expect.objectContaining({
              type: 'traces',
              dataset: 'otel.test',
            }),
          ],
        })
      );
    });

    it('should install index templates for all signal types when dynamic_signal_types is true and policy template has no type', async () => {
      jest.mocked(getInstalledPackageWithAssets).mockResolvedValue({
        installation: {
          name: 'otel',
          version: '1.0.0',
        },
        packageInfo: OTEL_PKG_INFO_DYNAMIC_SIGNAL_TYPES_NO_TYPE,
        assetsMap: new Map(),
        paths: [],
      } as any);
      const mockedLogger = jest.mocked(appContextService.getLogger());

      await installAssetsForInputPackagePolicy({
        pkgInfo: OTEL_PKG_INFO_DYNAMIC_SIGNAL_TYPES_NO_TYPE as any,
        soClient: savedObjectsClientMock.create(),
        esClient: {} as ElasticsearchClient,
        force: false,
        logger: mockedLogger,
        packagePolicy: {
          inputs: [
            {
              name: 'otel',
              type: 'otelcol',
              streams: [
                {
                  data_stream: { type: 'logs' },
                  vars: { 'data_stream.dataset': { value: 'otel.test' } },
                },
              ],
            },
          ],
        } as any,
      });

      expect(jest.mocked(installIndexTemplatesAndPipelines)).toHaveBeenCalledTimes(3);
      const calls = jest.mocked(installIndexTemplatesAndPipelines).mock.calls;
      const types = calls.map((c) => c[0]?.onlyForDataStreams?.[0]?.type);
      expect(types.sort()).toEqual(['logs', 'metrics', 'traces']);
    });

    it('should install index template for single signal type when dynamic_signal_types is false', async () => {
      jest.mocked(getInstalledPackageWithAssets).mockResolvedValue({
        installation: {
          name: 'otel',
          version: '1.0.0',
        },
        packageInfo: OTEL_PKG_INFO_NO_DYNAMIC_SIGNAL_TYPES,
        assetsMap: new Map(),
        paths: [],
      } as any);
      const mockedLogger = jest.mocked(appContextService.getLogger());

      await installAssetsForInputPackagePolicy({
        pkgInfo: OTEL_PKG_INFO_NO_DYNAMIC_SIGNAL_TYPES as any,
        soClient: savedObjectsClientMock.create(),
        esClient: {} as ElasticsearchClient,
        force: false,
        logger: mockedLogger,
        packagePolicy: {
          inputs: [
            {
              name: 'otel',
              type: 'otelcol',
              streams: [
                {
                  data_stream: { type: 'logs' },
                  vars: { 'data_stream.dataset': { value: 'otel.test' } },
                },
              ],
            },
          ],
        } as any,
      });

      // Should only be called once for the single signal type
      expect(jest.mocked(installIndexTemplatesAndPipelines)).toHaveBeenCalledTimes(1);

      // Verify it was called only for logs
      expect(jest.mocked(installIndexTemplatesAndPipelines)).toHaveBeenCalledWith(
        expect.objectContaining({
          onlyForDataStreams: [
            expect.objectContaining({
              type: 'logs',
              dataset: 'otel.test',
            }),
          ],
        })
      );
    });

    it('should install index template for single signal type when dynamic_signal_types is not defined (backward compatibility)', async () => {
      jest.mocked(getInstalledPackageWithAssets).mockResolvedValue({
        installation: {
          name: 'otel',
          version: '1.0.0',
        },
        packageInfo: OTEL_PKG_INFO_WITHOUT_FLAG,
        assetsMap: new Map(),
        paths: [],
      } as any);
      const mockedLogger = jest.mocked(appContextService.getLogger());

      await installAssetsForInputPackagePolicy({
        pkgInfo: OTEL_PKG_INFO_WITHOUT_FLAG as any,
        soClient: savedObjectsClientMock.create(),
        esClient: {} as ElasticsearchClient,
        force: false,
        logger: mockedLogger,
        packagePolicy: {
          inputs: [
            {
              name: 'otel',
              type: 'otelcol',
              streams: [
                {
                  data_stream: { type: 'metrics' },
                  vars: { 'data_stream.dataset': { value: 'otel.test' } },
                },
              ],
            },
          ],
        } as any,
      });

      // Should only be called once for the single signal type
      expect(jest.mocked(installIndexTemplatesAndPipelines)).toHaveBeenCalledTimes(1);

      // Verify it was called only for metrics
      expect(jest.mocked(installIndexTemplatesAndPipelines)).toHaveBeenCalledWith(
        expect.objectContaining({
          onlyForDataStreams: [
            expect.objectContaining({
              type: 'metrics',
              dataset: 'otel.test',
            }),
          ],
        })
      );
    });

    it('should not install any index templates for a profiles input package', async () => {
      const OTEL_PKG_INFO_PROFILES = {
        type: 'input',
        name: 'profiling_otel',
        version: '1.0.0',
        policy_templates: [
          {
            name: 'profilingreceiver',
            type: 'profiles',
            input: 'otelcol',
          },
        ],
      };
      jest.mocked(getInstalledPackageWithAssets).mockResolvedValue({
        installation: {
          name: 'profiling_otel',
          version: '1.0.0',
        },
        packageInfo: OTEL_PKG_INFO_PROFILES,
        assetsMap: new Map(),
        paths: [],
      } as any);
      const mockedLogger = jest.mocked(appContextService.getLogger());

      await installAssetsForInputPackagePolicy({
        pkgInfo: OTEL_PKG_INFO_PROFILES as any,
        soClient: savedObjectsClientMock.create(),
        esClient: {} as ElasticsearchClient,
        force: false,
        logger: mockedLogger,
        packagePolicy: {
          inputs: [
            {
              name: 'profilingreceiver',
              type: 'otelcol',
              streams: [
                {
                  data_stream: { type: 'profiles' },
                  vars: { 'data_stream.dataset': { value: 'profilingreceiver' } },
                },
              ],
            },
          ],
        } as any,
      });

      // profiles is owned end-to-end by Universal Profiling; Fleet must not create data streams
      // for it (elastic/package-spec#1191).
      expect(jest.mocked(installIndexTemplatesAndPipelines)).not.toHaveBeenCalled();
    });

    it('should respect data_stream.type var when dynamic_signal_types is true', async () => {
      jest.mocked(getInstalledPackageWithAssets).mockResolvedValue({
        installation: {
          name: 'otel',
          version: '1.0.0',
        },
        packageInfo: OTEL_PKG_INFO_DYNAMIC_SIGNAL_TYPES,
        assetsMap: new Map(),
        paths: [],
      } as any);
      const mockedLogger = jest.mocked(appContextService.getLogger());

      await installAssetsForInputPackagePolicy({
        pkgInfo: OTEL_PKG_INFO_DYNAMIC_SIGNAL_TYPES as any,
        soClient: savedObjectsClientMock.create(),
        esClient: {} as ElasticsearchClient,
        force: false,
        logger: mockedLogger,
        packagePolicy: {
          inputs: [
            {
              name: 'otel',
              type: 'otelcol',
              streams: [
                {
                  data_stream: { type: 'logs' },
                  vars: {
                    'data_stream.dataset': { value: 'otel.custom' },
                    'data_stream.type': { value: 'traces' },
                  },
                },
              ],
            },
          ],
        } as any,
      });

      // Should still create all 3 templates with the custom dataset
      expect(jest.mocked(installIndexTemplatesAndPipelines)).toHaveBeenCalledTimes(3);

      const calls = jest.mocked(installIndexTemplatesAndPipelines).mock.calls;
      const datasets = calls.map((call) => call[0]?.onlyForDataStreams?.[0]).filter(Boolean);

      expect(datasets).toEqual([
        expect.objectContaining({ type: 'logs', dataset: 'otel.custom' }),
        expect.objectContaining({ type: 'metrics', dataset: 'otel.custom' }),
        expect.objectContaining({ type: 'traces', dataset: 'otel.custom' }),
      ]);
    });

    it('should skip existing data streams for each signal type', async () => {
      jest.mocked(getInstalledPackageWithAssets).mockResolvedValue({
        installation: {
          name: 'otel',
          version: '1.0.0',
        },
        packageInfo: OTEL_PKG_INFO_DYNAMIC_SIGNAL_TYPES,
        assetsMap: new Map(),
        paths: [],
      } as any);

      // Mock that logs data stream already exists (from same package)
      jest
        .mocked(dataStreamService)
        .getMatchingDataStreams.mockImplementation(async (esClient, params) => {
          if (params.type === 'logs') {
            return [
              {
                name: 'logs-otel.test-default',
                _meta: {
                  package: {
                    name: 'otel',
                  },
                },
              },
            ] as any;
          }
          return [];
        });

      const mockedLogger = jest.mocked(appContextService.getLogger());

      await installAssetsForInputPackagePolicy({
        pkgInfo: OTEL_PKG_INFO_DYNAMIC_SIGNAL_TYPES as any,
        soClient: savedObjectsClientMock.create(),
        esClient: {} as ElasticsearchClient,
        force: false,
        logger: mockedLogger,
        packagePolicy: {
          inputs: [
            {
              name: 'otel',
              type: 'otelcol',
              streams: [
                {
                  data_stream: { type: 'logs' },
                  vars: { 'data_stream.dataset': { value: 'otel.test' } },
                },
              ],
            },
          ],
        } as any,
      });

      // Should only be called 2 times (metrics and traces, logs skipped because it already exists)
      expect(jest.mocked(installIndexTemplatesAndPipelines)).toHaveBeenCalledTimes(2);

      // Verify logs was skipped
      const calls = jest.mocked(installIndexTemplatesAndPipelines).mock.calls;
      const types = calls.map((call) => call[0]?.onlyForDataStreams?.[0]?.type).filter(Boolean);
      expect(types).not.toContain('logs');
      expect(types).toContain('metrics');
      expect(types).toContain('traces');
    });

    it('should install new asset structure when force is true and index template already exists (e.g. upgrade from integration 1.x to input 2.x)', async () => {
      jest.mocked(getInstalledPackageWithAssets).mockResolvedValue({
        installation: {
          name: 'filestream',
          version: '2.0.0',
        },
        packageInfo: { ...TEST_PKG_INFO_INPUT, name: 'filestream', version: '2.0.0' },
        assetsMap: new Map(),
        paths: [],
      } as any);

      jest.mocked(dataStreamService).getMatchingDataStreams.mockResolvedValue([]);
      // Legacy index template from 1.x exists
      jest.mocked(dataStreamService).getMatchingIndexTemplate.mockResolvedValue({
        name: 'logs-filestream.generic',
        _meta: { package: { name: 'filestream' } },
      } as any);

      const mockedLogger = jest.mocked(appContextService.getLogger());

      await installAssetsForInputPackagePolicy({
        pkgInfo: { ...TEST_PKG_INFO_INPUT, name: 'filestream', version: '2.0.0' } as any,
        soClient: savedObjectsClientMock.create(),
        esClient: {} as ElasticsearchClient,
        force: true,
        logger: mockedLogger,
        packagePolicy: {
          inputs: [
            {
              name: 'log',
              type: 'log',
              streams: [
                {
                  data_stream: { type: 'logs' },
                  vars: { 'data_stream.dataset': { value: 'my_dataset' } },
                },
              ],
            },
          ],
        } as any,
      });

      // Should install new component templates and ingest pipelines (not skip)
      expect(jest.mocked(installIndexTemplatesAndPipelines)).toHaveBeenCalledTimes(1);
    });
  });
});

describe('removeAssetsForInputPackagePolicy', () => {
  beforeEach(() => {
    jest.mocked(cleanupAssetsMock).mockReset();
  });

  it('should clean up assets for integration packages with status = installed', async () => {
    const mockedLogger = jest.mocked(appContextService.getLogger());
    const installation = {
      name: 'my-integration',
      version: '1.0.0',
      installed_kibana: [],
      installed_es: [
        {
          id: 'logs-my-integration.custom_dataset',
          type: 'index_template',
        },
        {
          id: 'logs-my-integration.custom_dataset@package',
          type: 'component_template',
        },
      ],
      es_index_patterns: {
        custom_dataset: 'logs-my-integration.custom_dataset-*',
      },
    } as any;
    jest.mocked(getInstallation).mockResolvedValue(installation);

    await removeAssetsForInputPackagePolicy({
      packageInfo: {
        type: 'integration',
        status: 'installed',
        name: 'my-integration',
        version: '1.0.0',
      } as any,
      datasetName: 'custom_dataset',
      savedObjectsClient: savedObjectsClientMock.create(),
      esClient: {} as ElasticsearchClient,
      logger: mockedLogger,
    });
    expect(cleanupAssetsMock).toBeCalledWith(
      'custom_dataset',
      {
        es_index_patterns: { custom_dataset: 'logs-my-integration.custom_dataset-*' },
        installed_es: [
          { id: 'logs-my-integration.custom_dataset', type: 'index_template' },
          { id: 'logs-my-integration.custom_dataset@package', type: 'component_template' },
        ],
        installed_kibana: [],
        name: 'my-integration',
        package_assets: [],
        version: '1.0.0',
      },
      installation,
      expect.anything(),
      expect.anything()
    );
  });

  it('should do nothing for packages with status !== installed', async () => {
    const mockedLogger = jest.mocked(appContextService.getLogger());
    await removeAssetsForInputPackagePolicy({
      packageInfo: {
        type: 'input',
        status: 'not_installed',
      } as any,
      datasetName: 'test',
      savedObjectsClient: savedObjectsClientMock.create(),
      esClient: {} as ElasticsearchClient,
      logger: mockedLogger,
    });
    expect(cleanupAssetsMock).not.toBeCalled();
  });

  it('should clean up assets for input packages with status = installed', async () => {
    const mockedLogger = jest.mocked(appContextService.getLogger());
    const installation = {
      name: 'logs',
      version: '1.0.0',
      installed_kibana: [],
      installed_es: [
        {
          id: 'logs@custom',
          type: 'component_template',
        },
        {
          id: 'udp@custom',
          type: 'component_template',
        },
        {
          id: 'logs-udp.test',
          type: 'index_template',
        },
        {
          id: 'logs-udp.test@package',
          type: 'component_template',
        },
      ],
      es_index_patterns: {
        generic: 'logs-udp.generic-*',
        test: 'logs-udp.test-*',
      },
    } as any;
    jest.mocked(getInstallation).mockResolvedValue(installation);

    await removeAssetsForInputPackagePolicy({
      packageInfo: {
        type: 'input',
        status: 'installed',
        name: 'logs',
        version: '1.0.0',
      } as any,
      datasetName: 'test',
      savedObjectsClient: savedObjectsClientMock.create(),
      esClient: {} as ElasticsearchClient,
      logger: mockedLogger,
    });
    expect(cleanupAssetsMock).toBeCalledWith(
      'test',
      {
        es_index_patterns: { test: 'logs-udp.test-*' },
        installed_es: [
          { id: 'logs-udp.test', type: 'index_template' },
          { id: 'logs-udp.test@package', type: 'component_template' },
        ],
        installed_kibana: [],
        name: 'logs',
        package_assets: [],
        version: '1.0.0',
      },
      installation,
      expect.anything(),
      expect.anything()
    );
  });

  it('should clean up assets matching exactly the datasetName', async () => {
    const mockedLogger = jest.mocked(appContextService.getLogger());
    const installation = {
      name: 'logs',
      version: '1.0.0',
      installed_kibana: [],
      installed_es: [
        {
          id: 'logs-udp.test',
          type: 'index_template',
        },
        {
          id: 'logs-udp.test@package',
          type: 'component_template',
        },
        {
          id: 'logs-udp.test1',
          type: 'index_template',
        },
        {
          id: 'logs-udp.test1@package',
          type: 'component_template',
        },
      ],
    } as any;
    jest.mocked(getInstallation).mockResolvedValue(installation);

    await removeAssetsForInputPackagePolicy({
      packageInfo: {
        type: 'input',
        status: 'installed',
        name: 'logs',
        version: '1.0.0',
      } as any,
      datasetName: 'test',
      savedObjectsClient: savedObjectsClientMock.create(),
      esClient: {} as ElasticsearchClient,
      logger: mockedLogger,
    });
    expect(cleanupAssetsMock).toBeCalledWith(
      'test',
      {
        installed_es: [
          { id: 'logs-udp.test', type: 'index_template' },
          { id: 'logs-udp.test@package', type: 'component_template' },
        ],
        installed_kibana: [],
        es_index_patterns: {},
        name: 'logs',
        package_assets: [],
        version: '1.0.0',
      },
      installation,
      expect.anything(),
      expect.anything()
    );
  });

  it('should not clean up assets for input packages with status not installed', async () => {
    const mockedLogger = jest.mocked(appContextService.getLogger());
    jest.mocked(getInstallation).mockResolvedValue(undefined);

    await removeAssetsForInputPackagePolicy({
      packageInfo: {
        type: 'input',
        status: 'installed',
        name: 'logs',
        version: '1.0.0',
      } as any,
      datasetName: 'test',
      savedObjectsClient: savedObjectsClientMock.create(),
      esClient: {} as ElasticsearchClient,
      logger: mockedLogger,
    });
    expect(cleanupAssetsMock).not.toBeCalled();
  });

  it('should log error if cleanupAssets failed', async () => {
    const mockedLogger = jest.mocked(appContextService.getLogger());
    jest.mocked(getInstallation).mockResolvedValue({
      name: 'logs',
      version: '1.0.0',
    } as any);

    cleanupAssetsMock.mockRejectedValueOnce('error');

    await removeAssetsForInputPackagePolicy({
      packageInfo: {
        type: 'input',
        status: 'installed',
        name: 'logs',
        version: '1.0.0',
      } as any,
      datasetName: 'test',
      savedObjectsClient: savedObjectsClientMock.create(),
      esClient: {} as ElasticsearchClient,
      logger: mockedLogger,
    });
    expect(mockedLogger.error).toBeCalled();
  });

  describe('isInputPackageDatasetUsedByMultiplePolicies', () => {
    const policy1 = {
      id: 'policy1',
      name: 'Policy',
      policy_ids: ['agent-policy'],
      description: 'Policy description',
      namespace: 'default',
      inputs: [],
      package: {
        name: 'logs',
        title: 'Test',
        version: '1.0.0',
        type: 'input',
      },
    };
    const policy2 = {
      id: 'test-package-policy',
      name: 'Test policy',
      policy_ids: ['agent-policy'],
      description: 'Test policy description',
      namespace: 'default',
      inputs: [],
      package: {
        name: 'logs',
        title: 'Test',
        version: '1.0.0',
        type: 'input',
      },
    };

    it('should return false if there are no other policies using the dataset', async () => {
      const res = isInputPackageDatasetUsedByMultiplePolicies(
        [policy1, policy2] as any,
        'generic',
        'logs'
      );
      expect(res).toEqual(false);
    });

    it('should return true if there other policies using the same dataset', async () => {
      const res = isInputPackageDatasetUsedByMultiplePolicies(
        [
          {
            ...policy1,
            inputs: [
              {
                streams: [
                  { vars: { 'data_stream.dataset': { value: 'udp.generic', type: 'text' } } },
                ],
              },
            ],
            namespace: 'another',
          },
          {
            ...policy2,
            inputs: [
              {
                streams: [
                  { vars: { 'data_stream.dataset': { value: 'udp.generic', type: 'text' } } },
                ],
              },
            ],
          },
        ] as any,
        'udp.generic',
        'logs'
      );
      expect(res).toEqual(true);
    });

    it('should return false when the only matching policy is excluded', () => {
      const res = isInputPackageDatasetUsedByMultiplePolicies(
        [
          {
            ...policy1,
            inputs: [
              {
                streams: [
                  { vars: { 'data_stream.dataset': { value: 'udp.generic', type: 'text' } } },
                ],
              },
            ],
          },
        ] as any,
        'udp.generic',
        'logs',
        'policy1'
      );
      expect(res).toEqual(false);
    });

    it('should return true when another policy uses the dataset even with exclusion', () => {
      const res = isInputPackageDatasetUsedByMultiplePolicies(
        [
          {
            ...policy1,
            inputs: [
              {
                streams: [
                  { vars: { 'data_stream.dataset': { value: 'udp.generic', type: 'text' } } },
                ],
              },
            ],
          },
          {
            ...policy2,
            inputs: [
              {
                streams: [
                  { vars: { 'data_stream.dataset': { value: 'udp.generic', type: 'text' } } },
                ],
              },
            ],
          },
        ] as any,
        'udp.generic',
        'logs',
        'policy1'
      );
      expect(res).toEqual(true);
    });

    it('should not false-positive when one policy has the dataset on multiple inputs', () => {
      const res = isInputPackageDatasetUsedByMultiplePolicies(
        [
          {
            ...policy1,
            inputs: [
              {
                streams: [{ vars: { 'data_stream.dataset': { value: 'custom', type: 'text' } } }],
              },
              {
                streams: [{ vars: { 'data_stream.dataset': { value: 'custom', type: 'text' } } }],
              },
            ],
          },
        ] as any,
        'custom',
        'logs',
        'policy1'
      );
      expect(res).toEqual(false);
    });
  });

  describe('getCustomDatasetStreams', () => {
    it('should return empty for input package without dataset var', () => {
      const result = getCustomDatasetStreams(
        { inputs: [{ type: 'log', streams: [{ data_stream: { type: 'logs' } }] }] } as any,
        { type: 'input', policy_templates: [{ name: 'log', type: 'logs' }] } as any
      );
      expect(result).toEqual([]);
    });

    it('should return single stream for input package with custom dataset', () => {
      const result = getCustomDatasetStreams(
        {
          inputs: [
            {
              type: 'log',
              streams: [
                {
                  data_stream: { type: 'logs' },
                  vars: { 'data_stream.dataset': { value: 'my_custom' } },
                },
              ],
            },
          ],
        } as any,
        { type: 'input', policy_templates: [{ name: 'log', type: 'logs' }] } as any
      );
      expect(result).toHaveLength(1);
      expect(result[0].datasetName).toBe('my_custom');
      expect(result[0].dataStreamType).toBe('logs');
      expect(result[0].inputType).toBe('log');
    });

    it('should return all signal types for input package with dynamic_signal_types', () => {
      const result = getCustomDatasetStreams(
        {
          inputs: [
            {
              type: 'otelcol',
              streams: [
                {
                  data_stream: { type: 'logs' },
                  vars: { 'data_stream.dataset': { value: 'my_otel' } },
                },
              ],
            },
          ],
        } as any,
        {
          type: 'input',
          policy_templates: [
            { name: 'otel', type: 'logs', input: 'otelcol', dynamic_signal_types: true },
          ],
        } as any
      );
      expect(result).toHaveLength(3);
      expect(result.map((s) => s.dataStreamType)).toEqual(['logs', 'metrics', 'traces']);
    });

    it('should return empty for integration package with no custom datasets', () => {
      const result = getCustomDatasetStreams(
        {
          inputs: [
            {
              enabled: true,
              type: 'nginx/metrics',
              streams: [
                {
                  enabled: true,
                  data_stream: { type: 'metrics', dataset: 'nginx.stubstatus' },
                  vars: {},
                },
              ],
            },
          ],
        } as any,
        {
          type: 'integration',
          data_streams: [{ dataset: 'nginx.stubstatus', type: 'metrics' }],
        } as any
      );
      expect(result).toEqual([]);
    });

    it('should return custom dataset streams for integration package', () => {
      const result = getCustomDatasetStreams(
        {
          inputs: [
            {
              enabled: true,
              type: 'logfile',
              streams: [
                {
                  enabled: true,
                  data_stream: { type: 'logs', dataset: 'nginx.access' },
                  vars: { 'data_stream.dataset': { value: 'my_custom_access' } },
                },
                {
                  enabled: true,
                  data_stream: { type: 'logs', dataset: 'nginx.error' },
                  vars: {},
                },
              ],
            },
          ],
        } as any,
        {
          type: 'integration',
          data_streams: [
            { dataset: 'nginx.access', type: 'logs', path: 'access' },
            { dataset: 'nginx.error', type: 'logs', path: 'error' },
          ],
        } as any
      );
      expect(result).toHaveLength(1);
      expect(result[0].datasetName).toBe('my_custom_access');
      expect(result[0].dataStreamType).toBe('logs');
      expect(result[0].resolvedDataStream).toEqual(
        expect.objectContaining({
          dataset: 'my_custom_access',
          path: 'access',
          type: 'logs',
        })
      );
    });

    it('should deduplicate streams with same custom dataset and type', () => {
      const result = getCustomDatasetStreams(
        {
          inputs: [
            {
              enabled: true,
              type: 'logfile',
              streams: [
                {
                  enabled: true,
                  data_stream: { type: 'logs', dataset: 'nginx.access' },
                  vars: { 'data_stream.dataset': { value: 'my_custom' } },
                },
              ],
            },
            {
              enabled: true,
              type: 'httpjson',
              streams: [
                {
                  enabled: true,
                  data_stream: { type: 'logs', dataset: 'nginx.access' },
                  vars: { 'data_stream.dataset': { value: 'my_custom' } },
                },
              ],
            },
          ],
        } as any,
        {
          type: 'integration',
          data_streams: [{ dataset: 'nginx.access', type: 'logs', path: 'access' }],
        } as any
      );
      expect(result).toHaveLength(1);
    });

    it('should skip disabled inputs and streams', () => {
      const result = getCustomDatasetStreams(
        {
          inputs: [
            {
              enabled: false,
              type: 'logfile',
              streams: [
                {
                  enabled: true,
                  data_stream: { type: 'logs', dataset: 'nginx.access' },
                  vars: { 'data_stream.dataset': { value: 'my_custom' } },
                },
              ],
            },
          ],
        } as any,
        {
          type: 'integration',
          data_streams: [{ dataset: 'nginx.access', type: 'logs', path: 'access' }],
        } as any
      );
      expect(result).toEqual([]);
    });
  });

  describe('installAssetsForCustomDatasetPolicy', () => {
    beforeEach(() => {
      jest.mocked(optimisticallyAddEsAssetReferences).mockReset();
      jest.mocked(installIndexTemplatesAndPipelines).mockClear();
      jest.mocked(dataStreamService).getMatchingDataStreams.mockReset();
      jest.mocked(dataStreamService).getMatchingIndexTemplate.mockReset();
    });

    it('should do nothing when there are no custom dataset streams', async () => {
      const mockedLogger = jest.mocked(appContextService.getLogger());
      await installAssetsForCustomDatasetPolicy({
        pkgInfo: {
          type: 'integration',
          data_streams: [{ dataset: 'nginx.access', type: 'logs' }],
        } as any,
        soClient: savedObjectsClientMock.create(),
        esClient: {} as ElasticsearchClient,
        force: false,
        logger: mockedLogger,
        packagePolicy: {
          inputs: [
            {
              enabled: true,
              type: 'logfile',
              streams: [
                {
                  enabled: true,
                  data_stream: { type: 'logs', dataset: 'nginx.access' },
                  vars: {},
                },
              ],
            },
          ],
        } as any,
      });
      expect(jest.mocked(installIndexTemplatesAndPipelines)).not.toBeCalled();
    });

    it('should install templates for integration package with custom dataset', async () => {
      jest.mocked(dataStreamService).getMatchingDataStreams.mockResolvedValue([]);
      jest.mocked(dataStreamService).getMatchingIndexTemplate.mockResolvedValue(null);
      jest.mocked(getInstalledPackageWithAssets).mockResolvedValue({
        installation: { name: 'nginx', version: '1.0.0', installed_es: [] },
        packageInfo: {
          type: 'integration',
          name: 'nginx',
          version: '1.0.0',
          data_streams: [{ dataset: 'nginx.access', type: 'logs', path: 'access' }],
        },
        assetsMap: new Map(),
        paths: [],
      } as any);

      const mockedLogger = jest.mocked(appContextService.getLogger());
      await installAssetsForCustomDatasetPolicy({
        pkgInfo: {
          type: 'integration',
          name: 'nginx',
          version: '1.0.0',
          data_streams: [{ dataset: 'nginx.access', type: 'logs', path: 'access' }],
        } as any,
        soClient: savedObjectsClientMock.create(),
        esClient: {} as ElasticsearchClient,
        force: false,
        logger: mockedLogger,
        packagePolicy: {
          inputs: [
            {
              enabled: true,
              type: 'logfile',
              streams: [
                {
                  enabled: true,
                  data_stream: { type: 'logs', dataset: 'nginx.access' },
                  vars: { 'data_stream.dataset': { value: 'my_custom_access' } },
                },
              ],
            },
          ],
        } as any,
      });

      expect(jest.mocked(installIndexTemplatesAndPipelines)).toHaveBeenCalledTimes(1);
      const installCall = jest.mocked(installIndexTemplatesAndPipelines).mock.calls[0];
      const dataStreams = installCall?.[0]?.onlyForDataStreams;
      expect(dataStreams?.[0]?.dataset).toBe('my_custom_access');
      expect(dataStreams?.[0]?.type).toBe('logs');
      expect(dataStreams?.[0]?.path).toBe('access');

      expect(jest.mocked(optimisticallyAddEsAssetReferences)).toHaveBeenCalledTimes(1);
      const esPatternCall = jest.mocked(optimisticallyAddEsAssetReferences).mock.calls[0];
      const esIndexPatterns = esPatternCall?.[3];
      expect(esIndexPatterns).toHaveProperty('my_custom_access');
    });

    it('should pass customDataStreamOriginDataset and customDataStreamOriginType to installIndexTemplatesAndPipelines', async () => {
      jest.mocked(dataStreamService).getMatchingDataStreams.mockResolvedValue([]);
      jest.mocked(dataStreamService).getMatchingIndexTemplate.mockResolvedValue(null);
      jest.mocked(getInstalledPackageWithAssets).mockResolvedValue({
        installation: { name: 'nginx', version: '1.0.0', installed_es: [] },
        packageInfo: {
          type: 'integration',
          name: 'nginx',
          version: '1.0.0',
          data_streams: [{ dataset: 'nginx.access', type: 'logs', path: 'access' }],
        },
        assetsMap: new Map(),
        paths: [],
      } as any);

      const mockedLogger = jest.mocked(appContextService.getLogger());
      await installAssetsForCustomDatasetPolicy({
        pkgInfo: {
          type: 'integration',
          name: 'nginx',
          version: '1.0.0',
          data_streams: [{ dataset: 'nginx.access', type: 'logs', path: 'access' }],
        } as any,
        soClient: savedObjectsClientMock.create(),
        esClient: {} as ElasticsearchClient,
        force: false,
        logger: mockedLogger,
        packagePolicy: {
          inputs: [
            {
              enabled: true,
              type: 'logfile',
              streams: [
                {
                  enabled: true,
                  data_stream: { type: 'logs', dataset: 'nginx.access' },
                  vars: { 'data_stream.dataset': { value: 'my_custom_access' } },
                },
              ],
            },
          ],
        } as any,
      });

      expect(jest.mocked(installIndexTemplatesAndPipelines)).toHaveBeenCalledTimes(1);
      const installCall = jest.mocked(installIndexTemplatesAndPipelines).mock.calls[0][0];
      expect(installCall.customDataStreamOriginDataset).toBe('nginx.access');
      expect(installCall.customDataStreamOriginType).toBe('logs');
    });

    it('should not apply applyTimeSeriesIndexMode for integration packages', async () => {
      jest.mocked(dataStreamService).getMatchingDataStreams.mockResolvedValue([]);
      jest.mocked(dataStreamService).getMatchingIndexTemplate.mockResolvedValue(null);
      jest.mocked(getInstalledPackageWithAssets).mockResolvedValue({
        installation: { name: 'nginx', version: '1.0.0', installed_es: [] },
        packageInfo: {
          type: 'integration',
          name: 'nginx',
          version: '1.0.0',
          data_streams: [
            {
              dataset: 'nginx.stubstatus',
              type: 'metrics',
              path: 'stubstatus',
              elasticsearch: { index_mode: 'time_series' },
            },
          ],
        },
        assetsMap: new Map(),
        paths: [],
      } as any);

      const mockedLogger = jest.mocked(appContextService.getLogger());
      await installAssetsForCustomDatasetPolicy({
        pkgInfo: {
          type: 'integration',
          name: 'nginx',
          version: '1.0.0',
          data_streams: [
            {
              dataset: 'nginx.stubstatus',
              type: 'metrics',
              path: 'stubstatus',
              elasticsearch: { index_mode: 'time_series' },
            },
          ],
        } as any,
        soClient: savedObjectsClientMock.create(),
        esClient: {} as ElasticsearchClient,
        force: false,
        logger: mockedLogger,
        packagePolicy: {
          inputs: [
            {
              enabled: true,
              type: 'nginx/metrics',
              streams: [
                {
                  enabled: true,
                  data_stream: { type: 'metrics', dataset: 'nginx.stubstatus' },
                  vars: { 'data_stream.dataset': { value: 'my_custom_metrics' } },
                },
              ],
            },
          ],
        } as any,
      });

      expect(mockedLogger.debug).not.toHaveBeenCalledWith(
        expect.stringContaining('Ignoring time_series index mode')
      );
      expect(mockedLogger.debug).not.toHaveBeenCalledWith(
        expect.stringContaining('Adding time_series index mode')
      );
    });
  });
});
