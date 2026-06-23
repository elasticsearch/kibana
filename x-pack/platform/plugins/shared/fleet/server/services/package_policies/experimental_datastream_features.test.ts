/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { elasticsearchServiceMock } from '@kbn/core-elasticsearch-server-mocks';
import { savedObjectsClientMock } from '@kbn/core-saved-objects-api-server-mocks';
import { securityMock } from '@kbn/security-plugin/server/mocks';

import type { NewPackagePolicy, PackagePolicy } from '../../types';
import { appContextService } from '../app_context';
import { updateCurrentWriteIndices } from '../epm/elasticsearch/template/template';
import { getInstalledPackageWithAssets } from '../epm/packages/get';

import { handleExperimentalDatastreamFeatureOptIn } from './experimental_datastream_features';

const mockedUpdateCurrentWriteIndices = updateCurrentWriteIndices as jest.MockedFunction<
  typeof updateCurrentWriteIndices
>;

jest.mock('../epm/packages', () => {
  return {
    getInstallation: jest.fn(),
    getPackageInfo: jest.fn().mockResolvedValue({
      data_streams: [
        {
          dataset: 'test',
          type: 'metrics',
        },
      ],
    }),
  };
});

function mockGetInstalledPackageWithAssets(installation: any) {
  jest.mocked(getInstalledPackageWithAssets).mockResolvedValue({
    packageInfo: {
      name: 'test',
      data_streams: [
        {
          dataset: 'test',
          type: 'metrics',
        },
      ],
    },
    installation,
  } as any);
}

jest.mock('../epm/packages/get', () => ({
  getInstalledPackageWithAssets: jest.fn().mockResolvedValue({
    packageInfo: {
      name: 'test',
      data_streams: [
        {
          dataset: 'test',
          type: 'metrics',
        },
      ],
    },
  }),
}));

jest.mock('../app_context');
const mockedAppContextService = appContextService as jest.Mocked<typeof appContextService>;
mockedAppContextService.getSecuritySetup.mockImplementation(() => ({
  ...securityMock.createSetup(),
}));

jest.mock('../epm/elasticsearch/template/template', () => ({
  updateCurrentWriteIndices: jest.fn(),
  isTotalFieldsLimitError: (err: any): boolean => {
    const reason: string = err?.body?.error?.reason ?? '';
    return reason.includes('Limit of total fields') && reason.includes('has been exceeded');
  },
}));
jest.mock('../epm/elasticsearch/template/install', () => {
  return {
    prepareDataStreamTemplates: jest.fn().mockResolvedValue([
      {
        componentTemplates: {
          'metrics-test.test@package': {
            template: {
              mappings: {
                properties: {
                  sequence: {
                    type: 'long',
                  },
                  name: {
                    type: 'keyword',
                    index: false,
                  },
                },
              },
            },
          },
        },
        indexTemplate: {},
      },
    ]),
  };
});

function getNewTestPackagePolicy({
  isSyntheticSourceEnabled,
  isTSDBEnabled,
  isDocValueOnlyNumeric,
  isDocValueOnlyOther,
}: {
  isSyntheticSourceEnabled: boolean;
  isTSDBEnabled: boolean;
  isDocValueOnlyNumeric: boolean;
  isDocValueOnlyOther: boolean;
}): NewPackagePolicy {
  const packagePolicy: NewPackagePolicy = {
    name: 'Test policy',
    policy_id: 'agent-policy',
    policy_ids: ['agent-policy'],
    description: 'Test policy description',
    namespace: 'default',
    enabled: true,
    inputs: [],
    package: {
      name: 'test',
      title: 'Test',
      version: '0.0.1',
      experimental_data_stream_features: [
        {
          data_stream: 'metrics-test.test',
          features: {
            synthetic_source: isSyntheticSourceEnabled,
            tsdb: isTSDBEnabled,
            doc_value_only_numeric: isDocValueOnlyNumeric,
            doc_value_only_other: isDocValueOnlyOther,
          },
        },
      ],
    },
  };

  return packagePolicy;
}

function getExistingTestPackagePolicy({
  isSyntheticSourceEnabled,
  isTSDBEnabled,
  isDocValueOnlyNumeric,
  isDocValueOnlyOther,
}: {
  isSyntheticSourceEnabled: boolean;
  isTSDBEnabled: boolean;
  isDocValueOnlyNumeric: boolean;
  isDocValueOnlyOther: boolean;
}): PackagePolicy {
  const packagePolicy: PackagePolicy = {
    id: 'test-policy',
    name: 'Test policy',
    policy_id: 'agent-policy',
    policy_ids: ['agent-policy'],
    description: 'Test policy description',
    namespace: 'default',
    enabled: true,
    inputs: [],
    package: {
      name: 'test',
      title: 'Test',
      version: '0.0.1',
      experimental_data_stream_features: [
        {
          data_stream: 'metrics-test.test',
          features: {
            synthetic_source: isSyntheticSourceEnabled,
            tsdb: isTSDBEnabled,
            doc_value_only_numeric: isDocValueOnlyNumeric,
            doc_value_only_other: isDocValueOnlyOther,
          },
        },
      ],
    },
    revision: 1,
    created_by: 'system',
    created_at: '2022-01-01T00:00:00.000Z',
    updated_by: 'system',
    updated_at: '2022-01-01T00:00:00.000Z',
  };

  return packagePolicy;
}

describe('experimental_datastream_features', () => {
  beforeEach(() => {
    soClient.get.mockClear();
    mockedUpdateCurrentWriteIndices.mockReset();
    esClient.cluster.getComponentTemplate.mockClear();
    esClient.cluster.putComponentTemplate.mockClear();
    mockedAppContextService.getLogger.mockReturnValue({
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
      error: jest.fn(),
    } as any);

    esClient.cluster.getComponentTemplate.mockResolvedValueOnce({
      component_templates: [
        {
          name: 'metrics-test.test@package',
          component_template: {
            template: {
              settings: {},
              mappings: {
                _source: {},
                properties: {
                  test_dimension: {
                    type: 'keyword',
                    time_series_dimension: true,
                  },
                  sequence: {
                    type: 'long',
                  },
                  name: {
                    type: 'keyword',
                  },
                  '@timestamp': {
                    type: 'date',
                  },
                },
              },
            },
          },
        },
      ],
    });

    esClient.indices.getIndexTemplate.mockResolvedValueOnce({
      index_templates: [
        {
          name: 'metrics-test.test',
          index_template: {
            template: {
              settings: {},
              mappings: {},
            },
            composed_of: [],
            index_patterns: '',
          },
        },
      ],
    });

    esClient.indices.getIndexTemplate.mockClear();
  });

  const soClient = savedObjectsClientMock.create();
  const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;

  describe('when package policy does not exist (create)', () => {
    beforeEach(() => {
      mockGetInstalledPackageWithAssets({
        experimental_data_stream_features: [
          {
            data_stream: 'metrics-test.test',
            features: {
              synthetic_source: false,
              tsdb: false,
              doc_value_only_numeric: false,
              doc_value_only_other: false,
            },
          },
        ],
      });
    });
    it('updates component template', async () => {
      const packagePolicy = getNewTestPackagePolicy({
        isSyntheticSourceEnabled: true,
        isTSDBEnabled: false,
        isDocValueOnlyNumeric: false,
        isDocValueOnlyOther: false,
      });

      await handleExperimentalDatastreamFeatureOptIn({ soClient, esClient, packagePolicy });

      expect(esClient.cluster.getComponentTemplate).toHaveBeenCalled();
      expect(esClient.cluster.putComponentTemplate).toHaveBeenCalledWith(
        expect.objectContaining({
          template: expect.objectContaining({
            settings: expect.objectContaining({
              index: expect.objectContaining({
                mapping: expect.objectContaining({ source: { mode: 'synthetic' } }),
              }),
            }),
          }),
          _meta: { has_experimental_data_stream_indexing_features: true },
        })
      );
    });

    it('updates component template number fields', async () => {
      const packagePolicy = getNewTestPackagePolicy({
        isSyntheticSourceEnabled: false,
        isTSDBEnabled: false,
        isDocValueOnlyNumeric: true,
        isDocValueOnlyOther: false,
      });

      await handleExperimentalDatastreamFeatureOptIn({ soClient, esClient, packagePolicy });

      expect(esClient.cluster.getComponentTemplate).toHaveBeenCalled();
      expect(esClient.cluster.putComponentTemplate).toHaveBeenCalledWith(
        expect.objectContaining({
          template: expect.objectContaining({
            mappings: expect.objectContaining({
              properties: expect.objectContaining({
                sequence: {
                  type: 'long',
                  index: false,
                },
              }),
            }),
          }),
          _meta: { has_experimental_data_stream_indexing_features: true },
        })
      );
    });

    it('updates component template other fields', async () => {
      const packagePolicy = getNewTestPackagePolicy({
        isSyntheticSourceEnabled: false,
        isTSDBEnabled: false,
        isDocValueOnlyNumeric: false,
        isDocValueOnlyOther: true,
      });

      await handleExperimentalDatastreamFeatureOptIn({ soClient, esClient, packagePolicy });

      expect(esClient.cluster.getComponentTemplate).toHaveBeenCalled();
      expect(esClient.cluster.putComponentTemplate).toHaveBeenCalledWith(
        expect.objectContaining({
          template: expect.objectContaining({
            mappings: expect.objectContaining({
              properties: expect.objectContaining({
                name: {
                  type: 'keyword',
                  index: false,
                },
              }),
            }),
          }),
          _meta: { has_experimental_data_stream_indexing_features: true },
        })
      );
    });

    it('should not set index:false on @timestamp field', async () => {
      const packagePolicy = getNewTestPackagePolicy({
        isSyntheticSourceEnabled: false,
        isTSDBEnabled: false,
        isDocValueOnlyNumeric: false,
        isDocValueOnlyOther: true,
      });

      await handleExperimentalDatastreamFeatureOptIn({ soClient, esClient, packagePolicy });

      expect(esClient.cluster.getComponentTemplate).toHaveBeenCalled();
      expect(esClient.cluster.putComponentTemplate).toHaveBeenCalledWith(
        expect.objectContaining({
          template: expect.objectContaining({
            mappings: expect.objectContaining({
              properties: expect.objectContaining({
                '@timestamp': {
                  type: 'date',
                },
              }),
            }),
          }),
          _meta: { has_experimental_data_stream_indexing_features: true },
        })
      );
    });

    it('should update index template', async () => {
      const packagePolicy = getNewTestPackagePolicy({
        isSyntheticSourceEnabled: false,
        isTSDBEnabled: true,
        isDocValueOnlyNumeric: false,
        isDocValueOnlyOther: false,
      });

      await handleExperimentalDatastreamFeatureOptIn({ soClient, esClient, packagePolicy });

      expect(esClient.indices.getIndexTemplate).toHaveBeenCalled();
      expect(esClient.indices.putIndexTemplate).toHaveBeenCalledWith(
        expect.objectContaining({
          template: expect.objectContaining({
            settings: expect.objectContaining({
              index: { mode: 'time_series' },
            }),
          }),
          _meta: { has_experimental_data_stream_indexing_features: true },
        })
      );
    });
  });

  describe('when package policy exists (update)', () => {
    describe('when opt in status in unchanged', () => {
      it('does not update component template', async () => {
        const packagePolicy = getExistingTestPackagePolicy({
          isSyntheticSourceEnabled: true,
          isTSDBEnabled: false,
          isDocValueOnlyNumeric: false,
          isDocValueOnlyOther: false,
        });

        mockGetInstalledPackageWithAssets({
          experimental_data_stream_features: [
            {
              data_stream: 'metrics-test.test',
              features: {
                synthetic_source: true,
                tsdb: false,
                doc_value_only_numeric: false,
                doc_value_only_other: false,
              },
            },
          ],
        });

        await handleExperimentalDatastreamFeatureOptIn({ soClient, esClient, packagePolicy });

        expect(esClient.cluster.getComponentTemplate).not.toHaveBeenCalled();
        expect(esClient.cluster.putComponentTemplate).not.toHaveBeenCalled();
      });

      it('does not update write indices', async () => {
        const packagePolicy = getExistingTestPackagePolicy({
          isSyntheticSourceEnabled: true,
          isTSDBEnabled: false,
          isDocValueOnlyNumeric: false,
          isDocValueOnlyOther: false,
        });

        mockGetInstalledPackageWithAssets({
          experimental_data_stream_features: [
            {
              data_stream: 'metrics-test.test',
              features: {
                synthetic_source: true,
                tsdb: false,
                doc_value_only_numeric: false,
                doc_value_only_other: false,
              },
            },
          ],
        });

        await handleExperimentalDatastreamFeatureOptIn({ soClient, esClient, packagePolicy });

        expect(mockedUpdateCurrentWriteIndices).not.toHaveBeenCalled();
      });
    });

    describe('when opt in status is changed', () => {
      beforeEach(() => {
        mockGetInstalledPackageWithAssets({
          experimental_data_stream_features: [
            {
              data_stream: 'metrics-test.test',
              features: {
                synthetic_source: false,
                tsdb: false,
                doc_value_only_numeric: false,
                doc_value_only_other: true,
              },
            },
          ],
        });
      });
      it('updates component template', async () => {
        const packagePolicy = getExistingTestPackagePolicy({
          isSyntheticSourceEnabled: true,
          isTSDBEnabled: false,
          isDocValueOnlyNumeric: false,
          isDocValueOnlyOther: true,
        });

        await handleExperimentalDatastreamFeatureOptIn({ soClient, esClient, packagePolicy });

        expect(esClient.cluster.getComponentTemplate).toHaveBeenCalled();
        expect(esClient.cluster.putComponentTemplate).toHaveBeenCalledWith(
          expect.objectContaining({
            template: expect.objectContaining({
              settings: expect.objectContaining({
                index: expect.objectContaining({
                  mapping: expect.objectContaining({ source: { mode: 'synthetic' } }),
                }),
              }),
            }),
            _meta: { has_experimental_data_stream_indexing_features: true },
          })
        );
      });

      it('updates component template number fields', async () => {
        const packagePolicy = getExistingTestPackagePolicy({
          isSyntheticSourceEnabled: false,
          isTSDBEnabled: false,
          isDocValueOnlyNumeric: true,
          isDocValueOnlyOther: true,
        });

        await handleExperimentalDatastreamFeatureOptIn({ soClient, esClient, packagePolicy });

        expect(esClient.cluster.getComponentTemplate).toHaveBeenCalled();
        expect(esClient.cluster.putComponentTemplate).toHaveBeenCalledWith(
          expect.objectContaining({
            template: expect.objectContaining({
              mappings: expect.objectContaining({
                properties: expect.objectContaining({
                  sequence: {
                    type: 'long',
                    index: false,
                  },
                }),
              }),
            }),
            _meta: { has_experimental_data_stream_indexing_features: true },
          })
        );
      });

      it('should not remove index:false from a field that has it in package spec', async () => {
        const packagePolicy = getExistingTestPackagePolicy({
          isSyntheticSourceEnabled: false,
          isTSDBEnabled: false,
          isDocValueOnlyNumeric: false,
          isDocValueOnlyOther: false,
        });

        await handleExperimentalDatastreamFeatureOptIn({ soClient, esClient, packagePolicy });

        expect(esClient.cluster.getComponentTemplate).toHaveBeenCalled();
        expect(esClient.cluster.putComponentTemplate).toHaveBeenCalledWith(
          expect.objectContaining({
            template: expect.objectContaining({
              mappings: expect.objectContaining({
                properties: expect.objectContaining({
                  name: {
                    type: 'keyword',
                    index: false,
                  },
                }),
              }),
            }),
            _meta: { has_experimental_data_stream_indexing_features: false },
          })
        );
      });

      it('should update index template', async () => {
        const packagePolicy = getExistingTestPackagePolicy({
          isSyntheticSourceEnabled: false,
          isTSDBEnabled: true,
          isDocValueOnlyNumeric: false,
          isDocValueOnlyOther: false,
        });

        esClient.indices.getIndexTemplate.mockResolvedValueOnce({
          index_templates: [
            {
              name: 'metrics-test.test',
              index_template: {
                template: {
                  settings: {},
                  mappings: {},
                },
                composed_of: [],
                index_patterns: '',
              },
            },
          ],
        });

        await handleExperimentalDatastreamFeatureOptIn({ soClient, esClient, packagePolicy });

        expect(esClient.indices.getIndexTemplate).toHaveBeenCalled();
        expect(esClient.indices.putIndexTemplate).toHaveBeenCalledWith(
          expect.objectContaining({
            template: expect.objectContaining({
              settings: expect.objectContaining({
                index: { mode: 'time_series' },
              }),
            }),
            _meta: { has_experimental_data_stream_indexing_features: true },
          })
        );
      });

      it('should not throw when updateCurrentWriteIndices rejects with a total_fields limit error', async () => {
        const packagePolicy = getExistingTestPackagePolicy({
          isSyntheticSourceEnabled: false,
          isTSDBEnabled: true,
          isDocValueOnlyNumeric: false,
          isDocValueOnlyOther: false,
        });

        esClient.indices.getIndexTemplate.mockResolvedValueOnce({
          index_templates: [
            {
              name: 'metrics-test.test',
              index_template: {
                template: { settings: {}, mappings: {} },
                composed_of: [],
                index_patterns: '',
              },
            },
          ],
        });

        const totalFieldsError = Object.assign(new Error('ResponseError'), {
          statusCode: 400,
          body: {
            error: {
              type: 'illegal_argument_exception',
              reason: 'Limit of total fields [2500] has been exceeded',
            },
          },
        });
        mockedUpdateCurrentWriteIndices.mockRejectedValueOnce(totalFieldsError);

        // total_fields errors are non-fatal — the rollover wouldn't have helped anyway
        await expect(
          handleExperimentalDatastreamFeatureOptIn({ soClient, esClient, packagePolicy })
        ).resolves.not.toThrow();
      });

      it('should throw when updateCurrentWriteIndices rejects with an unexpected error', async () => {
        const packagePolicy = getExistingTestPackagePolicy({
          isSyntheticSourceEnabled: false,
          isTSDBEnabled: true,
          isDocValueOnlyNumeric: false,
          isDocValueOnlyOther: false,
        });

        esClient.indices.getIndexTemplate.mockResolvedValueOnce({
          index_templates: [
            {
              name: 'metrics-test.test',
              index_template: {
                template: { settings: {}, mappings: {} },
                composed_of: [],
                index_patterns: '',
              },
            },
          ],
        });

        const unexpectedError = new Error('unexpected mapping error');
        mockedUpdateCurrentWriteIndices.mockRejectedValueOnce(unexpectedError);

        await expect(
          handleExperimentalDatastreamFeatureOptIn({ soClient, esClient, packagePolicy })
        ).rejects.toThrow(unexpectedError);
      });

      it('should update existing write indices', async () => {
        const packagePolicy = getExistingTestPackagePolicy({
          isSyntheticSourceEnabled: false,
          isTSDBEnabled: true,
          isDocValueOnlyNumeric: false,
          isDocValueOnlyOther: false,
        });

        esClient.indices.getIndexTemplate.mockResolvedValueOnce({
          index_templates: [
            {
              name: 'metrics-test.test',
              index_template: {
                template: {
                  settings: {},
                  mappings: {},
                },
                composed_of: [],
                index_patterns: '',
              },
            },
          ],
        });

        await handleExperimentalDatastreamFeatureOptIn({ soClient, esClient, packagePolicy });

        expect(mockedUpdateCurrentWriteIndices).toHaveBeenCalledTimes(1);
        expect(
          mockedUpdateCurrentWriteIndices.mock.calls[0][2].map(({ templateName }) => templateName)
        ).toEqual(['metrics-test.test']);
      });
    });
  });
});
