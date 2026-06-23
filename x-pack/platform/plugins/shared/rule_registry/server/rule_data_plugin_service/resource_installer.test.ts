/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { Subject, ReplaySubject, of } from 'rxjs';
import { ResourceInstaller } from './resource_installer';
import { loggerMock } from '@kbn/logging-mocks';
import { AlertConsumers } from '@kbn/rule-data-utils';
import type {
  IndicesGetDataStreamResponse,
  IndicesDataStreamIndex,
  IndicesDataStream,
} from '@elastic/elasticsearch/lib/api/types';

import { Dataset } from './index_options';
import { IndexInfo } from './index_info';
import { ECS_COMPONENT_TEMPLATE_NAME } from '@kbn/alerting-plugin/server';
import type { DataStreamAdapter } from '@kbn/alerting-plugin/server';
import { getDataStreamAdapter } from '@kbn/alerting-plugin/server/alerts_service/lib/data_stream_adapter';

import type { ElasticsearchClientMock } from '@kbn/core/server/mocks';
import { elasticsearchServiceMock } from '@kbn/core/server/mocks';
import { TECHNICAL_COMPONENT_TEMPLATE_NAME } from '../../common/assets';

const frameworkAlertsService = {
  enabled: () => false,
  getContextInitializationPromise: async () => ({ result: false, error: `failed` }),
};

const GetAliasResponse = {
  '.internal.alerts-test.alerts-default-000001': {
    aliases: {
      alias_1: {
        is_hidden: true,
      },
      alias_2: {
        is_hidden: true,
      },
    },
  },
};

const GetDataStreamResponse: IndicesGetDataStreamResponse = {
  data_streams: [
    {
      name: 'ignored',
      generation: 1,
      timestamp_field: { name: 'ignored' },
      hidden: true,
      indices: [{ index_name: 'ignored', index_uuid: 'ignored' } as IndicesDataStreamIndex],
      status: 'green',
      template: 'ignored',
    } as IndicesDataStream,
  ],
};

describe('resourceInstaller', () => {
  let pluginStop$: Subject<void>;
  let dataStreamAdapter: DataStreamAdapter;
  const elasticsearchAndSOAvailability$ = of(true);

  for (const useDataStreamForAlerts of [false, true]) {
    const label = useDataStreamForAlerts ? 'data streams' : 'aliases';

    describe(`using ${label} for alert indices`, () => {
      beforeEach(() => {
        pluginStop$ = new ReplaySubject(1);
        dataStreamAdapter = getDataStreamAdapter({ useDataStreamForAlerts });
      });

      afterEach(() => {
        pluginStop$.next();
        pluginStop$.complete();
      });

      describe('if write is disabled', () => {
        it('should not install common resources', async () => {
          const mockClusterClient = elasticsearchServiceMock.createElasticsearchClient();
          const getClusterClient = jest.fn(() => Promise.resolve(mockClusterClient));
          const installer = new ResourceInstaller({
            logger: loggerMock.create(),
            isWriteEnabled: false,
            disabledRegistrationContexts: [],
            getResourceName: jest.fn(),
            getClusterClient,
            frameworkAlerts: frameworkAlertsService,
            pluginStop$,
            dataStreamAdapter,
            elasticsearchAndSOAvailability$,
          });
          await installer.installCommonResources();
          expect(getClusterClient).not.toHaveBeenCalled();
        });

        it('should not install index level resources', async () => {
          const mockClusterClient = elasticsearchServiceMock.createElasticsearchClient();
          const getClusterClient = jest.fn(() => Promise.resolve(mockClusterClient));

          const installer = new ResourceInstaller({
            logger: loggerMock.create(),
            isWriteEnabled: false,
            disabledRegistrationContexts: [],
            getResourceName: jest.fn(),
            getClusterClient,
            frameworkAlerts: frameworkAlertsService,
            pluginStop$,
            dataStreamAdapter,
            elasticsearchAndSOAvailability$,
          });
          const indexOptions = {
            feature: AlertConsumers.LOGS,
            registrationContext: 'observability.logs',
            dataset: Dataset.alerts,
            componentTemplateRefs: [],
            componentTemplates: [
              {
                name: 'mappings',
              },
            ],
          };
          const indexInfo = new IndexInfo({ indexOptions, kibanaVersion: '8.1.0' });

          await installer.installIndexLevelResources(indexInfo);
          expect(mockClusterClient.cluster.putComponentTemplate).not.toHaveBeenCalled();
        });
      });

      describe('if write is enabled', () => {
        it('should install common resources', async () => {
          const mockClusterClient = elasticsearchServiceMock.createElasticsearchClient();
          const getClusterClient = jest.fn(() => Promise.resolve(mockClusterClient));
          const installer = new ResourceInstaller({
            logger: loggerMock.create(),
            isWriteEnabled: true,
            disabledRegistrationContexts: [],
            getResourceName: jest.fn(),
            getClusterClient,
            frameworkAlerts: frameworkAlertsService,
            pluginStop$,
            dataStreamAdapter,
            elasticsearchAndSOAvailability$,
          });

          await installer.installCommonResources();

          expect(mockClusterClient.ilm.putLifecycle).toHaveBeenCalledTimes(
            useDataStreamForAlerts ? 0 : 1
          );
          expect(mockClusterClient.cluster.putComponentTemplate).toHaveBeenCalledTimes(2);
          expect(mockClusterClient.cluster.putComponentTemplate).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({ name: ECS_COMPONENT_TEMPLATE_NAME })
          );
          expect(mockClusterClient.cluster.putComponentTemplate).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({ name: TECHNICAL_COMPONENT_TEMPLATE_NAME })
          );
        });

        it('should not install common resources if ES is not ready', async () => {
          const mockClusterClient = elasticsearchServiceMock.createElasticsearchClient();
          const getClusterClient = jest.fn(() => Promise.resolve(mockClusterClient));
          const test$ = new Subject<boolean>();

          const installer = new ResourceInstaller({
            logger: loggerMock.create(),
            isWriteEnabled: true,
            disabledRegistrationContexts: [],
            getResourceName: jest.fn(),
            getClusterClient,
            frameworkAlerts: frameworkAlertsService,
            pluginStop$,
            dataStreamAdapter,
            elasticsearchAndSOAvailability$: test$,
          });

          const install = installer.installCommonResources();
          const timeout = new Promise((resolve) => {
            setTimeout(resolve, 250);
          });

          await Promise.race([install, timeout]);

          expect(mockClusterClient.cluster.putComponentTemplate).not.toHaveBeenCalled();
        });

        it('should install subset of common resources when framework alerts are enabled', async () => {
          const mockClusterClient = elasticsearchServiceMock.createElasticsearchClient();
          const getClusterClient = jest.fn(() => Promise.resolve(mockClusterClient));
          const installer = new ResourceInstaller({
            logger: loggerMock.create(),
            isWriteEnabled: true,
            disabledRegistrationContexts: [],
            getResourceName: jest.fn(),
            getClusterClient,
            frameworkAlerts: {
              ...frameworkAlertsService,
              enabled: () => true,
            },
            pluginStop$,
            dataStreamAdapter,
            elasticsearchAndSOAvailability$,
          });

          await installer.installCommonResources();

          // ILM policy should be handled by framework
          expect(mockClusterClient.ilm.putLifecycle).not.toHaveBeenCalled();
          // ECS component template should be handled by framework
          expect(mockClusterClient.cluster.putComponentTemplate).toHaveBeenCalledTimes(1);
          expect(mockClusterClient.cluster.putComponentTemplate).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({ name: TECHNICAL_COMPONENT_TEMPLATE_NAME })
          );
        });

        it('should install index level resources', async () => {
          const mockClusterClient = elasticsearchServiceMock.createElasticsearchClient();
          const getClusterClient = jest.fn(() => Promise.resolve(mockClusterClient));
          const installer = new ResourceInstaller({
            logger: loggerMock.create(),
            isWriteEnabled: true,
            disabledRegistrationContexts: [],
            getResourceName: jest.fn(),
            getClusterClient,
            frameworkAlerts: frameworkAlertsService,
            pluginStop$,
            dataStreamAdapter,
            elasticsearchAndSOAvailability$,
          });

          const indexOptions = {
            feature: AlertConsumers.LOGS,
            registrationContext: 'observability.logs',
            dataset: Dataset.alerts,
            componentTemplateRefs: [],
            componentTemplates: [
              {
                name: 'mappings',
              },
            ],
          };
          const indexInfo = new IndexInfo({ indexOptions, kibanaVersion: '8.1.0' });

          await installer.installIndexLevelResources(indexInfo);
          expect(mockClusterClient.cluster.putComponentTemplate).toHaveBeenCalledWith(
            expect.objectContaining({ name: '.alerts-observability.logs.alerts-mappings' })
          );
        });

        it('should not install index level component template when framework alerts are enabled', async () => {
          const mockClusterClient = elasticsearchServiceMock.createElasticsearchClient();
          const getClusterClient = jest.fn(() => Promise.resolve(mockClusterClient));
          const installer = new ResourceInstaller({
            logger: loggerMock.create(),
            isWriteEnabled: true,
            disabledRegistrationContexts: [],
            getResourceName: jest.fn(),
            getClusterClient,
            frameworkAlerts: {
              ...frameworkAlertsService,
              enabled: () => true,
            },
            pluginStop$,
            dataStreamAdapter,
            elasticsearchAndSOAvailability$,
          });

          const indexOptions = {
            feature: AlertConsumers.LOGS,
            registrationContext: 'observability.logs',
            dataset: Dataset.alerts,
            componentTemplateRefs: [],
            componentTemplates: [
              {
                name: 'mappings',
              },
            ],
          };
          const indexInfo = new IndexInfo({ indexOptions, kibanaVersion: '8.1.0' });

          await installer.installIndexLevelResources(indexInfo);
          expect(mockClusterClient.cluster.putComponentTemplate).not.toHaveBeenCalled();
        });

        it('should install namespace level resources for the default space', async () => {
          const mockClusterClient = elasticsearchServiceMock.createElasticsearchClient();
          mockClusterClient.indices.simulateTemplate.mockImplementation(async () => ({
            template: {
              aliases: {
                alias_name_1: {
                  is_hidden: true,
                },
                alias_name_2: {
                  is_hidden: true,
                },
              },
              mappings: { enabled: false },
              settings: {},
            },
          }));
          mockClusterClient.indices.getAlias.mockImplementation(async () => ({}));
          mockClusterClient.indices.getDataStream.mockImplementation(async () => ({
            data_streams: [],
          }));
          const getClusterClient = jest.fn(() => Promise.resolve(mockClusterClient));
          const installer = new ResourceInstaller({
            logger: loggerMock.create(),
            isWriteEnabled: true,
            disabledRegistrationContexts: [],
            getResourceName: jest.fn(),
            getClusterClient,
            frameworkAlerts: frameworkAlertsService,
            pluginStop$,
            dataStreamAdapter,
            elasticsearchAndSOAvailability$,
          });

          const indexOptions = {
            feature: AlertConsumers.LOGS,
            registrationContext: 'observability.logs',
            dataset: Dataset.alerts,
            componentTemplateRefs: [],
            componentTemplates: [
              {
                name: 'mappings',
              },
            ],
          };
          const indexInfo = new IndexInfo({ indexOptions, kibanaVersion: '8.1.0' });

          await installer.installAndUpdateNamespaceLevelResources(indexInfo, 'default');
          expect(mockClusterClient.indices.simulateTemplate).toHaveBeenCalledWith(
            expect.objectContaining({
              name: '.alerts-observability.logs.alerts-default-index-template',
            })
          );
          expect(mockClusterClient.indices.putIndexTemplate).toHaveBeenCalledWith(
            expect.objectContaining({
              name: '.alerts-observability.logs.alerts-default-index-template',
            })
          );
          if (useDataStreamForAlerts) {
            expect(mockClusterClient.indices.getDataStream).toHaveBeenCalledWith(
              expect.objectContaining({
                name: '.alerts-observability.logs.alerts-default',
                expand_wildcards: 'all',
              })
            );
            expect(mockClusterClient.indices.createDataStream).toHaveBeenCalledWith(
              expect.objectContaining({
                name: '.alerts-observability.logs.alerts-default',
              })
            );
          } else {
            expect(mockClusterClient.indices.getAlias).toHaveBeenCalledWith(
              expect.objectContaining({ name: '.alerts-observability.logs.alerts-default' })
            );
            expect(mockClusterClient.indices.create).toHaveBeenCalledWith(
              expect.objectContaining({
                index: '.internal.alerts-observability.logs.alerts-default-000001',
              })
            );
          }
        });

        it('should not install namespace level resources for the default space when framework alerts are available', async () => {
          const mockClusterClient = elasticsearchServiceMock.createElasticsearchClient();
          const getClusterClient = jest.fn(() => Promise.resolve(mockClusterClient));
          const installer = new ResourceInstaller({
            logger: loggerMock.create(),
            isWriteEnabled: true,
            disabledRegistrationContexts: [],
            getResourceName: jest.fn(),
            getClusterClient,
            frameworkAlerts: {
              ...frameworkAlertsService,
              enabled: () => true,
              getContextInitializationPromise: async () => ({ result: true }),
            },
            pluginStop$,
            dataStreamAdapter,
            elasticsearchAndSOAvailability$,
          });

          const indexOptions = {
            feature: AlertConsumers.LOGS,
            registrationContext: 'observability.logs',
            dataset: Dataset.alerts,
            componentTemplateRefs: [],
            componentTemplates: [
              {
                name: 'mappings',
              },
            ],
          };
          const indexInfo = new IndexInfo({ indexOptions, kibanaVersion: '8.1.0' });

          await installer.installAndUpdateNamespaceLevelResources(indexInfo, 'default');
          expect(mockClusterClient.indices.simulateTemplate).not.toHaveBeenCalled();
          expect(mockClusterClient.indices.putIndexTemplate).not.toHaveBeenCalled();
          expect(mockClusterClient.indices.getAlias).not.toHaveBeenCalled();
          expect(mockClusterClient.indices.create).not.toHaveBeenCalled();
        });

        it('should throw error if framework was unable to install namespace level resources', async () => {
          const mockClusterClient = elasticsearchServiceMock.createElasticsearchClient();
          const getClusterClient = jest.fn(() => Promise.resolve(mockClusterClient));
          const installer = new ResourceInstaller({
            logger: loggerMock.create(),
            isWriteEnabled: true,
            disabledRegistrationContexts: [],
            getResourceName: jest.fn(),
            getClusterClient,
            frameworkAlerts: {
              ...frameworkAlertsService,
              enabled: () => true,
            },
            pluginStop$,
            dataStreamAdapter,
            elasticsearchAndSOAvailability$,
          });

          const indexOptions = {
            feature: AlertConsumers.LOGS,
            registrationContext: 'observability.logs',
            dataset: Dataset.alerts,
            componentTemplateRefs: [],
            componentTemplates: [
              {
                name: 'mappings',
              },
            ],
          };
          const indexInfo = new IndexInfo({ indexOptions, kibanaVersion: '8.1.0' });

          await expect(
            installer.installAndUpdateNamespaceLevelResources(indexInfo, 'default')
          ).rejects.toThrowErrorMatchingInlineSnapshot(
            `"There was an error in the framework installing namespace-level resources and creating concrete indices for .alerts-observability.logs.alerts-default - failed"`
          );
          expect(mockClusterClient.indices.simulateTemplate).not.toHaveBeenCalled();
          expect(mockClusterClient.indices.putIndexTemplate).not.toHaveBeenCalled();
          expect(mockClusterClient.indices.getAlias).not.toHaveBeenCalled();
          expect(mockClusterClient.indices.create).not.toHaveBeenCalled();
        });

        it('should not install namespace level resources for non-default space when framework alerts are available', async () => {
          const mockClusterClient = elasticsearchServiceMock.createElasticsearchClient();
          const getClusterClient = jest.fn(() => Promise.resolve(mockClusterClient));
          const installer = new ResourceInstaller({
            logger: loggerMock.create(),
            isWriteEnabled: true,
            disabledRegistrationContexts: [],
            getResourceName: jest.fn(),
            getClusterClient,
            frameworkAlerts: {
              ...frameworkAlertsService,
              enabled: () => true,
              getContextInitializationPromise: async () => ({ result: true }),
            },
            pluginStop$,
            dataStreamAdapter,
            elasticsearchAndSOAvailability$,
          });

          const indexOptions = {
            feature: AlertConsumers.LOGS,
            registrationContext: 'observability.logs',
            dataset: Dataset.alerts,
            componentTemplateRefs: [],
            componentTemplates: [
              {
                name: 'mappings',
              },
            ],
          };
          const indexInfo = new IndexInfo({ indexOptions, kibanaVersion: '8.1.0' });

          await installer.installAndUpdateNamespaceLevelResources(indexInfo, 'my-staging-space');
          expect(mockClusterClient.indices.simulateTemplate).not.toHaveBeenCalled();
          expect(mockClusterClient.indices.putIndexTemplate).not.toHaveBeenCalled();
          expect(mockClusterClient.indices.getAlias).not.toHaveBeenCalled();
          expect(mockClusterClient.indices.create).not.toHaveBeenCalled();
        });

        it('should install namespace level resources when additionalPrefix is defined', async () => {
          const mockClusterClient = elasticsearchServiceMock.createElasticsearchClient();
          mockClusterClient.ilm.getLifecycle.mockResolvedValue({
            '.customPrefix.alerts-observability.logs.alerts-policy': {
              version: 1,
              modified_date: '2025-10-02T15:05:30.113Z',
              policy: {
                phases: {
                  hot: {
                    min_age: '0ms',
                    actions: { rollover: { max_age: '1d', max_primary_shard_size: '50gb' } },
                  },
                  delete: {
                    min_age: '1d',
                    actions: { delete: { delete_searchable_snapshot: true } },
                  },
                },
              },
            },
          });
          mockClusterClient.indices.simulateTemplate.mockImplementation(async () => ({
            template: {
              aliases: {
                alias_name_1: {
                  is_hidden: true,
                },
                alias_name_2: {
                  is_hidden: true,
                },
              },
              mappings: { enabled: false },
              settings: {},
            },
          }));
          mockClusterClient.indices.getAlias.mockImplementation(async () => ({}));
          mockClusterClient.indices.getDataStream.mockImplementation(async () => ({
            data_streams: [],
          }));
          const getClusterClient = jest.fn(() => Promise.resolve(mockClusterClient));
          const installer = new ResourceInstaller({
            logger: loggerMock.create(),
            isWriteEnabled: true,
            disabledRegistrationContexts: [],
            getResourceName: jest.fn(),
            getClusterClient,
            frameworkAlerts: frameworkAlertsService,
            pluginStop$,
            dataStreamAdapter,
            elasticsearchAndSOAvailability$,
          });

          const indexOptions = {
            additionalPrefix: '.customPrefix',
            feature: AlertConsumers.LOGS,
            registrationContext: 'observability.logs',
            dataset: Dataset.alerts,
            componentTemplateRefs: [],
            componentTemplates: [
              {
                name: 'mappings',
              },
            ],
          };
          const indexInfo = new IndexInfo({ indexOptions, kibanaVersion: '8.1.0' });

          await installer.installAndUpdateNamespaceLevelResources(indexInfo, 'default');
          if (useDataStreamForAlerts) {
            expect(mockClusterClient.indices.simulateTemplate).toHaveBeenCalledWith(
              expect.objectContaining({
                name: '.customPrefix.alerts-observability.logs.alerts-default-index-template',
                template: expect.objectContaining({
                  settings: {
                    auto_expand_replicas: '0-1',
                    hidden: true,
                    'index.mapping.ignore_malformed': true,
                    'index.mapping.total_fields.ignore_dynamic_beyond_limit': true,
                    'index.mapping.total_fields.limit': 2800,
                  },
                }),
              })
            );
            expect(mockClusterClient.indices.putIndexTemplate).toHaveBeenCalledWith(
              expect.objectContaining({
                name: '.customPrefix.alerts-observability.logs.alerts-default-index-template',
                template: expect.objectContaining({
                  settings: {
                    auto_expand_replicas: '0-1',
                    hidden: true,
                    'index.mapping.ignore_malformed': true,
                    'index.mapping.total_fields.ignore_dynamic_beyond_limit': true,
                    'index.mapping.total_fields.limit': 2800,
                  },
                }),
              })
            );
            expect(mockClusterClient.indices.getDataStream).toHaveBeenCalledWith(
              expect.objectContaining({
                name: '.customPrefix.alerts-observability.logs.alerts-default',
                expand_wildcards: 'all',
              })
            );
            expect(mockClusterClient.indices.createDataStream).toHaveBeenCalledWith(
              expect.objectContaining({
                name: '.customPrefix.alerts-observability.logs.alerts-default',
              })
            );
          } else {
            expect(mockClusterClient.indices.simulateTemplate).toHaveBeenCalledWith(
              expect.objectContaining({
                name: '.customPrefix.alerts-observability.logs.alerts-default-index-template',
                template: expect.objectContaining({
                  settings: {
                    'index.lifecycle': {
                      name: '.customPrefix.alerts-observability.logs.alerts-policy',
                      rollover_alias: '.customPrefix.alerts-observability.logs.alerts-default',
                    },
                    auto_expand_replicas: '0-1',
                    hidden: true,
                    'index.mapping.ignore_malformed': true,
                    'index.mapping.total_fields.ignore_dynamic_beyond_limit': true,
                    'index.mapping.total_fields.limit': 2800,
                  },
                }),
              })
            );
            expect(mockClusterClient.indices.putIndexTemplate).toHaveBeenCalledWith(
              expect.objectContaining({
                name: '.customPrefix.alerts-observability.logs.alerts-default-index-template',
                template: expect.objectContaining({
                  settings: {
                    'index.lifecycle': {
                      name: '.customPrefix.alerts-observability.logs.alerts-policy',
                      rollover_alias: '.customPrefix.alerts-observability.logs.alerts-default',
                    },
                    auto_expand_replicas: '0-1',
                    hidden: true,
                    'index.mapping.ignore_malformed': true,
                    'index.mapping.total_fields.ignore_dynamic_beyond_limit': true,
                    'index.mapping.total_fields.limit': 2800,
                  },
                }),
              })
            );
            expect(mockClusterClient.indices.getAlias).toHaveBeenCalledWith(
              expect.objectContaining({
                name: '.customPrefix.alerts-observability.logs.alerts-default',
              })
            );
            expect(mockClusterClient.ilm.getLifecycle).toHaveBeenCalledWith({
              name: '.customPrefix.alerts-observability.logs.alerts-policy',
            });
            expect(mockClusterClient.indices.create).toHaveBeenCalledWith(
              expect.objectContaining({
                index: '.internal.customPrefix.alerts-observability.logs.alerts-default-000001',
              })
            );
          }
        });

        it('should use default alert policy if additionalPrefix is defined but no matching ILM policy exists', async () => {
          const mockClusterClient = elasticsearchServiceMock.createElasticsearchClient();
          mockClusterClient.ilm.getLifecycle.mockImplementation(() => {
            throw new Error('No matching policy found');
          });
          mockClusterClient.indices.simulateTemplate.mockImplementation(async () => ({
            template: {
              aliases: {
                alias_name_1: {
                  is_hidden: true,
                },
                alias_name_2: {
                  is_hidden: true,
                },
              },
              mappings: { enabled: false },
              settings: {},
            },
          }));
          mockClusterClient.indices.getAlias.mockImplementation(async () => ({}));
          mockClusterClient.indices.getDataStream.mockImplementation(async () => ({
            data_streams: [],
          }));
          const getClusterClient = jest.fn(() => Promise.resolve(mockClusterClient));
          const installer = new ResourceInstaller({
            logger: loggerMock.create(),
            isWriteEnabled: true,
            disabledRegistrationContexts: [],
            getResourceName: jest.fn(),
            getClusterClient,
            frameworkAlerts: frameworkAlertsService,
            pluginStop$,
            dataStreamAdapter,
            elasticsearchAndSOAvailability$,
          });

          const indexOptions = {
            additionalPrefix: '.customPrefix',
            feature: AlertConsumers.LOGS,
            registrationContext: 'observability.logs',
            dataset: Dataset.alerts,
            componentTemplateRefs: [],
            componentTemplates: [
              {
                name: 'mappings',
              },
            ],
          };
          const indexInfo = new IndexInfo({ indexOptions, kibanaVersion: '8.1.0' });

          await installer.installAndUpdateNamespaceLevelResources(indexInfo, 'default');
          if (useDataStreamForAlerts) {
            expect(mockClusterClient.indices.simulateTemplate).toHaveBeenCalledWith(
              expect.objectContaining({
                name: '.customPrefix.alerts-observability.logs.alerts-default-index-template',
                template: expect.objectContaining({
                  settings: {
                    auto_expand_replicas: '0-1',
                    hidden: true,
                    'index.mapping.ignore_malformed': true,
                    'index.mapping.total_fields.ignore_dynamic_beyond_limit': true,
                    'index.mapping.total_fields.limit': 2800,
                  },
                }),
              })
            );
            expect(mockClusterClient.indices.putIndexTemplate).toHaveBeenCalledWith(
              expect.objectContaining({
                name: '.customPrefix.alerts-observability.logs.alerts-default-index-template',
                template: expect.objectContaining({
                  settings: {
                    auto_expand_replicas: '0-1',
                    hidden: true,
                    'index.mapping.ignore_malformed': true,
                    'index.mapping.total_fields.ignore_dynamic_beyond_limit': true,
                    'index.mapping.total_fields.limit': 2800,
                  },
                }),
              })
            );
            expect(mockClusterClient.indices.getDataStream).toHaveBeenCalledWith(
              expect.objectContaining({
                name: '.customPrefix.alerts-observability.logs.alerts-default',
                expand_wildcards: 'all',
              })
            );
            expect(mockClusterClient.indices.createDataStream).toHaveBeenCalledWith(
              expect.objectContaining({
                name: '.customPrefix.alerts-observability.logs.alerts-default',
              })
            );
          } else {
            expect(mockClusterClient.indices.simulateTemplate).toHaveBeenCalledWith(
              expect.objectContaining({
                name: '.customPrefix.alerts-observability.logs.alerts-default-index-template',
                template: expect.objectContaining({
                  settings: {
                    'index.lifecycle': {
                      name: '.alerts-ilm-policy',
                      rollover_alias: '.customPrefix.alerts-observability.logs.alerts-default',
                    },
                    auto_expand_replicas: '0-1',
                    hidden: true,
                    'index.mapping.ignore_malformed': true,
                    'index.mapping.total_fields.ignore_dynamic_beyond_limit': true,
                    'index.mapping.total_fields.limit': 2800,
                  },
                }),
              })
            );
            expect(mockClusterClient.indices.putIndexTemplate).toHaveBeenCalledWith(
              expect.objectContaining({
                name: '.customPrefix.alerts-observability.logs.alerts-default-index-template',
                template: expect.objectContaining({
                  settings: {
                    'index.lifecycle': {
                      name: '.alerts-ilm-policy',
                      rollover_alias: '.customPrefix.alerts-observability.logs.alerts-default',
                    },
                    auto_expand_replicas: '0-1',
                    hidden: true,
                    'index.mapping.ignore_malformed': true,
                    'index.mapping.total_fields.ignore_dynamic_beyond_limit': true,
                    'index.mapping.total_fields.limit': 2800,
                  },
                }),
              })
            );
            expect(mockClusterClient.indices.getAlias).toHaveBeenCalledWith(
              expect.objectContaining({
                name: '.customPrefix.alerts-observability.logs.alerts-default',
              })
            );
            expect(mockClusterClient.ilm.getLifecycle).toHaveBeenCalledWith({
              name: '.customPrefix.alerts-observability.logs.alerts-policy',
            });
            expect(mockClusterClient.indices.create).toHaveBeenCalledWith(
              expect.objectContaining({
                index: '.internal.customPrefix.alerts-observability.logs.alerts-default-000001',
              })
            );
          }
        });
      });

      // These tests only test the updateAliasWriteIndexMapping()
      // method of ResourceInstaller, however to test that, you
      // have to call installAndUpdateNamespaceLevelResources().
      // So there's a bit of setup.  But the only real difference
      // with the tests is what the es client simulateIndexTemplate()
      // mock returns, as set in the test.
      describe('updateAliasWriteIndexMapping()', () => {
        const SimulateTemplateResponse = {
          template: {
            aliases: {
              alias_name_1: {
                is_hidden: true,
              },
              alias_name_2: {
                is_hidden: true,
              },
            },
            mappings: { enabled: false },
            settings: {},
          },
        };

        function setup(mockClusterClient: ElasticsearchClientMock) {
          mockClusterClient.indices.simulateTemplate.mockImplementation(
            async () => SimulateTemplateResponse
          );
          mockClusterClient.indices.getAlias.mockImplementation(async () => GetAliasResponse);
          mockClusterClient.indices.getDataStream.mockImplementation(
            async () => GetDataStreamResponse
          );

          const logger = loggerMock.create();
          const resourceInstallerParams = {
            logger,
            isWriteEnabled: true,
            disabledRegistrationContexts: [],
            getResourceName: jest.fn(),
            getClusterClient: async () => mockClusterClient,
            frameworkAlerts: frameworkAlertsService,
            pluginStop$,
            dataStreamAdapter,
            elasticsearchAndSOAvailability$,
          };
          const indexOptions = {
            feature: AlertConsumers.OBSERVABILITY,
            registrationContext: 'observability.metrics',
            dataset: Dataset.alerts,
            componentTemplateRefs: [],
            componentTemplates: [
              {
                name: 'mappings',
              },
            ],
          };

          const installer = new ResourceInstaller(resourceInstallerParams);
          const indexInfo = new IndexInfo({ indexOptions, kibanaVersion: '8.4.0' });

          return { installer, indexInfo, logger };
        }

        it('succeeds on the happy path', async () => {
          const mockClusterClient = elasticsearchServiceMock.createElasticsearchClient();
          mockClusterClient.indices.simulateIndexTemplate.mockImplementation(
            async () => SimulateTemplateResponse
          );

          const { installer, indexInfo } = setup(mockClusterClient);

          let error: string | undefined;
          try {
            await installer.installAndUpdateNamespaceLevelResources(indexInfo, 'default');
          } catch (err) {
            error = err.message;
          }
          expect(error).toBeFalsy();
        });

        it('gracefully fails on error simulating mappings', async () => {
          const mockClusterClient = elasticsearchServiceMock.createElasticsearchClient();
          mockClusterClient.indices.simulateIndexTemplate.mockImplementation(async () => {
            throw new Error('expecting simulateIndexTemplate() to throw');
          });

          const { installer, indexInfo, logger } = setup(mockClusterClient);

          let error: string | undefined;
          try {
            await installer.installAndUpdateNamespaceLevelResources(indexInfo, 'default');
          } catch (err) {
            error = err.message;
          }
          expect(error).toBeFalsy();

          const errorMessages = loggerMock.collect(logger).error;
          if (useDataStreamForAlerts) {
            expect(errorMessages).toMatchInlineSnapshot(`
            Array [
              Array [
                "Ignored PUT mappings for .alerts-observability.metrics.alerts-default; error generating simulated mappings: expecting simulateIndexTemplate() to throw",
              ],
              Array [
                "Failed to update mappings for data stream: .alerts-observability.metrics.alerts-default, updating write index (ignored) mappings instead",
              ],
              Array [
                "Failed to update mappings for write index of data stream: .alerts-observability.metrics.alerts-default, rolling over instead",
              ],
            ]
          `);
          } else {
            expect(errorMessages).toMatchInlineSnapshot(`
            Array [
              Array [
                "Ignored PUT mappings for .internal.alerts-test.alerts-default-000001; error generating simulated mappings: expecting simulateIndexTemplate() to throw",
              ],
              Array [
                "Failed to update mappings for concrete indices matching: .internal.alerts-observability.metrics.alerts-default-*",
              ],
              Array [
                "Failed to update mappings for write index of alias: alias_2, rolling over instead",
              ],
            ]
          `);
          }
        });

        it('gracefully fails on empty mappings', async () => {
          const mockClusterClient = elasticsearchServiceMock.createElasticsearchClient();
          // @ts-expect-error wrong response type
          mockClusterClient.indices.simulateIndexTemplate.mockImplementation(async () => ({}));

          const { installer, indexInfo, logger } = setup(mockClusterClient);

          let error: string | undefined;
          try {
            await installer.installAndUpdateNamespaceLevelResources(indexInfo, 'default');
          } catch (err) {
            error = err.message;
          }
          expect(error).toBeFalsy();
          const errorMessages = loggerMock.collect(logger).error;
          if (useDataStreamForAlerts) {
            expect(errorMessages).toMatchInlineSnapshot(`
            Array [
              Array [
                "Ignored PUT mappings for .alerts-observability.metrics.alerts-default; simulated mappings were empty",
              ],
              Array [
                "Failed to update mappings for data stream: .alerts-observability.metrics.alerts-default, updating write index (ignored) mappings instead",
              ],
              Array [
                "Failed to update mappings for write index of data stream: .alerts-observability.metrics.alerts-default, rolling over instead",
              ],
            ]
          `);
          } else {
            expect(errorMessages).toMatchInlineSnapshot(`
            Array [
              Array [
                "Ignored PUT mappings for .internal.alerts-test.alerts-default-000001; simulated mappings were empty",
              ],
              Array [
                "Failed to update mappings for concrete indices matching: .internal.alerts-observability.metrics.alerts-default-*",
              ],
              Array [
                "Failed to update mappings for write index of alias: alias_2, rolling over instead",
              ],
            ]
          `);
          }
        });
      });
    });
  }
});
