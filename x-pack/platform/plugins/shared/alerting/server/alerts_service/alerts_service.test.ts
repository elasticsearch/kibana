/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { elasticsearchServiceMock, loggingSystemMock } from '@kbn/core/server/mocks';
import { elasticsearchClientMock } from '@kbn/core-elasticsearch-client-server-mocks';
import type {
  IndicesGetDataStreamResponse,
  IndicesDataStreamIndex,
  IndicesDataStream,
} from '@elastic/elasticsearch/lib/api/types';
import { errors as EsErrors } from '@elastic/elasticsearch';
import { ReplaySubject, Subject, of } from 'rxjs';
import { AlertsService } from './alerts_service';
import type { IRuleTypeAlerts } from '../types';
import { RecoveredActionGroup } from '../types';
import { retryUntil } from './test_utils';
import { DEFAULT_NAMESPACE_STRING } from '@kbn/core-saved-objects-utils-server';
import type { UntypedNormalizedRuleType } from '../rule_type_registry';
import { AlertsClient } from '../alerts_client';
import { alertsClientMock } from '../alerts_client/alerts_client.mock';
import { getDataStreamAdapter } from './lib/data_stream_adapter';
import { maintenanceWindowsServiceMock } from '../task_runner/maintenance_windows/maintenance_windows_service.mock';
import type { KibanaRequest } from '@kbn/core/server';
import { alertingEventLoggerMock } from '../lib/alerting_event_logger/alerting_event_logger.mock';

jest.mock('../alerts_client');

const maintenanceWindowsService = maintenanceWindowsServiceMock.create();
const alertingEventLogger = alertingEventLoggerMock.create();

let logger: ReturnType<(typeof loggingSystemMock)['createLogger']>;
const clusterClient = elasticsearchServiceMock.createClusterClient().asInternalUser;

const fakeRequest = {
  headers: {},
  getBasePath: () => '',
  path: '/',
  route: { settings: {} },
  url: {
    href: '/',
  },
  raw: {
    req: {
      url: '/',
    },
  },
  getSavedObjectsClient: jest.fn(),
} as unknown as KibanaRequest;

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
interface HTTPError extends Error {
  statusCode: number;
}

interface EsError extends Error {
  meta: {
    body: {
      error: {
        type: string;
      };
    };
  };
}

const GetAliasResponse = {
  '.internal.alerts-test.alerts-default-000001': {
    aliases: {
      '.alerts-test.alerts-default': {
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
      next_generation_managed_by: 'Index Lifecycle Management',
      prefer_ilm: false,
      rollover_on_write: false,
    } as Partial<IndicesDataStream> as IndicesDataStream,
  ],
};

const IlmPutBody = {
  policy: {
    _meta: {
      managed: true,
    },
    phases: {
      hot: {
        actions: {
          rollover: {
            max_age: '30d',
            max_primary_shard_size: '50gb',
          },
        },
      },
    },
  },
  name: '.alerts-ilm-policy',
};

interface GetIndexTemplatePutBodyOpts {
  context?: string;
  namespace?: string;
  useLegacyAlerts?: boolean;
  useEcs?: boolean;
  secondaryAlias?: string;
  useDataStream?: boolean;
}
const getIndexTemplatePutBody = (opts?: GetIndexTemplatePutBodyOpts) => {
  const context = opts ? opts.context : undefined;
  const namespace = (opts ? opts.namespace : undefined) ?? DEFAULT_NAMESPACE_STRING;
  const useLegacyAlerts = opts ? opts.useLegacyAlerts : undefined;
  const useEcs = opts ? opts.useEcs : undefined;
  const secondaryAlias = opts ? opts.secondaryAlias : undefined;
  const useDataStream = opts?.useDataStream ?? false;

  const indexPatterns = useDataStream
    ? [`.alerts-${context ? context : 'test'}.alerts-${namespace}`]
    : [
        `.internal.alerts-${context ? context : 'test'}.alerts-${namespace}-*`,
        `.reindexed-v8-internal.alerts-${context ? context : 'test'}.alerts-${namespace}-*`,
      ];
  return {
    name: `.alerts-${context ? context : 'test'}.alerts-${namespace}-index-template`,
    index_patterns: indexPatterns,
    composed_of: [
      ...(useEcs ? ['.alerts-ecs-mappings'] : []),
      `.alerts-${context ? `${context}.alerts` : 'test.alerts'}-mappings`,
      ...(useLegacyAlerts ? ['.alerts-legacy-alert-mappings'] : []),
      '.alerts-framework-mappings',
    ],
    ...(useDataStream ? { data_stream: { hidden: true } } : {}),
    priority: namespace.length,
    template: {
      settings: {
        auto_expand_replicas: '0-1',
        hidden: true,
        ...(useDataStream
          ? {}
          : {
              'index.lifecycle': {
                name: '.alerts-ilm-policy',
                rollover_alias: `.alerts-${context ? context : 'test'}.alerts-${namespace}`,
              },
            }),
        'index.mapping.ignore_malformed': true,
        'index.mapping.total_fields.limit': 2800,
        'index.mapping.total_fields.ignore_dynamic_beyond_limit': true,
      },
      mappings: {
        dynamic: false,
        _meta: {
          kibana: { version: '8.8.0' },
          managed: true,
          namespace,
        },
      },
      ...(secondaryAlias
        ? {
            aliases: {
              [`${secondaryAlias}-default`]: {
                is_write_index: false,
              },
            },
          }
        : {}),
    },
    _meta: {
      kibana: { version: '8.8.0' },
      managed: true,
      namespace,
    },
  };
};

const TestRegistrationContext: IRuleTypeAlerts = {
  context: 'test',
  mappings: { fieldMap: { field: { type: 'keyword', required: false } } },
  shouldWrite: true,
};

const getContextInitialized = async (
  alertsService: AlertsService,
  context: string = TestRegistrationContext.context,
  namespace: string = DEFAULT_NAMESPACE_STRING
) => {
  const { result } = await alertsService.getContextInitializationPromise(context, namespace);
  return result;
};

const alertsClient = alertsClientMock.create();
const ruleType: jest.Mocked<UntypedNormalizedRuleType> = {
  id: 'test.rule-type',
  name: 'My test rule',
  actionGroups: [{ id: 'default', name: 'Default' }, RecoveredActionGroup],
  defaultActionGroupId: 'default',
  minimumLicenseRequired: 'basic',
  isExportable: true,
  recoveryActionGroup: RecoveredActionGroup,
  executor: jest.fn(),
  category: 'test',
  producer: 'alerts',
  solution: 'stack',
  cancelAlertsOnRuleTimeout: true,
  ruleTaskTimeout: '5m',
  autoRecoverAlerts: true,
  validate: {
    params: { validate: (params) => params },
  },
  validLegacyConsumers: [],
};

const ruleTypeWithAlertDefinition: jest.Mocked<UntypedNormalizedRuleType> = {
  ...ruleType,
  alerts: TestRegistrationContext as IRuleTypeAlerts<{}>,
};

describe('Alerts Service', () => {
  let pluginStop$: Subject<void>;
  const elasticsearchAndSOAvailability$ = of(true);

  beforeEach(() => {
    jest.resetAllMocks();
    logger = loggingSystemMock.createLogger();
    pluginStop$ = new ReplaySubject(1);
    jest.spyOn(global.Math, 'random').mockReturnValue(0.01);
    clusterClient.indices.simulateTemplate.mockImplementation(async () => SimulateTemplateResponse);
    clusterClient.indices.simulateIndexTemplate.mockImplementation(
      async () => SimulateTemplateResponse
    );
    clusterClient.indices.getAlias.mockImplementation(async () => GetAliasResponse);
    clusterClient.indices.getDataStream.mockImplementation(async () => GetDataStreamResponse);
  });

  afterEach(() => {
    pluginStop$.next();
    pluginStop$.complete();
  });

  for (const useDataStreamForAlerts of [false, true]) {
    const label = useDataStreamForAlerts ? 'data streams' : 'aliases';
    const dataStreamAdapter = getDataStreamAdapter({ useDataStreamForAlerts });

    describe(`using ${label} for alert indices`, () => {
      describe('AlertsService()', () => {
        test('should correctly initialize common resources', async () => {
          const alertsService = new AlertsService({
            logger,
            elasticsearchClientPromise: Promise.resolve(clusterClient),
            pluginStop$,
            kibanaVersion: '8.8.0',
            dataStreamAdapter,
            elasticsearchAndSOAvailability$,
            isServerless: false,
          });

          await retryUntil(
            'alert service initialized',
            async () => alertsService.isInitialized() === true
          );

          expect(alertsService.isInitialized()).toEqual(true);
          expect(clusterClient.ilm.putLifecycle).toHaveBeenCalledTimes(
            useDataStreamForAlerts ? 0 : 1
          );
          if (!useDataStreamForAlerts) {
            expect(clusterClient.ilm.putLifecycle).toHaveBeenCalledWith(IlmPutBody);
          }
          expect(clusterClient.cluster.putComponentTemplate).toHaveBeenCalledTimes(3);

          const componentTemplate1 = clusterClient.cluster.putComponentTemplate.mock.calls[0][0];
          expect(componentTemplate1.name).toEqual('.alerts-framework-mappings');
          const componentTemplate2 = clusterClient.cluster.putComponentTemplate.mock.calls[1][0];
          expect(componentTemplate2.name).toEqual('.alerts-legacy-alert-mappings');
          const componentTemplate3 = clusterClient.cluster.putComponentTemplate.mock.calls[2][0];
          expect(componentTemplate3.name).toEqual('.alerts-ecs-mappings');
        });

        test('should not initialize common resources if ES is not ready', async () => {
          const test$ = new Subject<boolean>();
          const alertsService = new AlertsService({
            logger,
            elasticsearchClientPromise: Promise.resolve(clusterClient),
            pluginStop$,
            kibanaVersion: '8.8.0',
            dataStreamAdapter,
            elasticsearchAndSOAvailability$: test$,
            isServerless: false,
          });

          await retryUntil(
            'alert service initialized',
            async () => alertsService.isInitialized() === true
          );
          expect(alertsService.isInitialized()).toEqual(false);

          // ES is ready, should initialize the resources
          test$.next(true);
          await retryUntil(
            'alert service initialized',
            async () => alertsService.isInitialized() === true
          );
          expect(alertsService.isInitialized()).toEqual(true);
          expect(clusterClient.ilm.putLifecycle).toHaveBeenCalledTimes(
            useDataStreamForAlerts ? 0 : 1
          );
          if (!useDataStreamForAlerts) {
            expect(clusterClient.ilm.putLifecycle).toHaveBeenCalledWith(IlmPutBody);
          }
          expect(clusterClient.cluster.putComponentTemplate).toHaveBeenCalledTimes(3);

          const componentTemplate1 = clusterClient.cluster.putComponentTemplate.mock.calls[0][0];
          expect(componentTemplate1.name).toEqual('.alerts-framework-mappings');
          const componentTemplate2 = clusterClient.cluster.putComponentTemplate.mock.calls[1][0];
          expect(componentTemplate2.name).toEqual('.alerts-legacy-alert-mappings');
          const componentTemplate3 = clusterClient.cluster.putComponentTemplate.mock.calls[2][0];
          expect(componentTemplate3.name).toEqual('.alerts-ecs-mappings');
        });

        test('should log error and set initialized to false if adding ILM policy throws error', async () => {
          if (useDataStreamForAlerts) return;

          clusterClient.ilm.putLifecycle.mockRejectedValueOnce(new Error('fail'));
          const alertsService = new AlertsService({
            logger,
            elasticsearchClientPromise: Promise.resolve(clusterClient),
            pluginStop$,
            kibanaVersion: '8.8.0',
            dataStreamAdapter,
            elasticsearchAndSOAvailability$,
            isServerless: false,
          });

          await retryUntil('error log called', async () => logger.error.mock.calls.length > 0);

          expect(alertsService.isInitialized()).toEqual(false);

          expect(logger.error).toHaveBeenCalledWith(
            `Error installing ILM policy .alerts-ilm-policy - fail`
          );

          expect(clusterClient.ilm.putLifecycle).toHaveBeenCalledTimes(1);
        });

        test('should log error and set initialized to false if creating/updating common component template throws error', async () => {
          clusterClient.cluster.putComponentTemplate.mockRejectedValueOnce(new Error('fail'));
          const alertsService = new AlertsService({
            logger,
            elasticsearchClientPromise: Promise.resolve(clusterClient),
            pluginStop$,
            kibanaVersion: '8.8.0',
            dataStreamAdapter,
            elasticsearchAndSOAvailability$,
            isServerless: false,
          });

          await retryUntil('error log called', async () => logger.error.mock.calls.length > 0);

          expect(alertsService.isInitialized()).toEqual(false);
          expect(logger.error).toHaveBeenCalledWith(
            `Error installing component template .alerts-framework-mappings - fail`
          );

          expect(clusterClient.ilm.putLifecycle).toHaveBeenCalledTimes(
            useDataStreamForAlerts ? 0 : 1
          );
        });

        test('should update index template field limit and retry initialization if creating/updating common component template fails with field limit error', async () => {
          clusterClient.cluster.putComponentTemplate.mockRejectedValueOnce(
            new EsErrors.ResponseError(
              elasticsearchClientMock.createApiResponse({
                statusCode: 400,
                body: {
                  error: {
                    root_cause: [
                      {
                        type: 'illegal_argument_exception',
                        reason:
                          'updating component template [.alerts-ecs-mappings] results in invalid composable template [.alerts-security.alerts-default-index-template] after templates are merged',
                      },
                    ],
                    type: 'illegal_argument_exception',
                    reason:
                      'updating component template [.alerts-ecs-mappings] results in invalid composable template [.alerts-security.alerts-default-index-template] after templates are merged',
                    caused_by: {
                      type: 'illegal_argument_exception',
                      reason:
                        'composable template [.alerts-security.alerts-default-index-template] template after composition with component templates [.alerts-ecs-mappings, .alerts-security.alerts-mappings, .alerts-technical-mappings] is invalid',
                      caused_by: {
                        type: 'illegal_argument_exception',
                        reason:
                          'invalid composite mappings for [.alerts-security.alerts-default-index-template]',
                        caused_by: {
                          type: 'illegal_argument_exception',
                          reason: 'Limit of total fields [1900] has been exceeded',
                        },
                      },
                    },
                  },
                },
              })
            )
          );
          const existingIndexTemplate = {
            name: 'test-template',
            index_template: {
              index_patterns: ['test*'],
              composed_of: ['.alerts-framework-mappings'],
              template: {
                settings: {
                  auto_expand_replicas: '0-1',
                  hidden: true,
                  'index.lifecycle': {
                    name: '.alerts-ilm-policy',
                    rollover_alias: `.alerts-empty-default`,
                  },
                  'index.mapping.total_fields.limit': 1800,
                },
                mappings: {
                  dynamic: false,
                },
              },
            },
          };
          clusterClient.indices.getIndexTemplate.mockResolvedValueOnce({
            index_templates: [existingIndexTemplate],
          });
          const alertsService = new AlertsService({
            logger,
            elasticsearchClientPromise: Promise.resolve(clusterClient),
            pluginStop$,
            kibanaVersion: '8.8.0',
            dataStreamAdapter,
            elasticsearchAndSOAvailability$,
            isServerless: false,
          });

          await retryUntil(
            'alert service initialized',
            async () => alertsService.isInitialized() === true
          );

          expect(clusterClient.indices.getIndexTemplate).toHaveBeenCalledTimes(1);
          expect(clusterClient.indices.putIndexTemplate).toHaveBeenCalledTimes(1);
          expect(clusterClient.indices.putIndexTemplate).toHaveBeenCalledWith({
            name: existingIndexTemplate.name,
            ...existingIndexTemplate.index_template,
            template: {
              ...existingIndexTemplate.index_template.template,
              settings: {
                ...existingIndexTemplate.index_template.template?.settings,
                'index.mapping.total_fields.limit': 2800,
                'index.mapping.total_fields.ignore_dynamic_beyond_limit': true,
              },
            },
          });

          expect(clusterClient.ilm.putLifecycle).toHaveBeenCalledTimes(
            useDataStreamForAlerts ? 0 : 1
          );
          // 3x for framework, legacy-alert and ecs mappings, then 1 extra time to update component template
          // after updating index template field limit
          expect(clusterClient.cluster.putComponentTemplate).toHaveBeenCalledTimes(4);
        });
      });

      describe('register()', () => {
        let alertsService: AlertsService;
        beforeEach(async () => {
          alertsService = new AlertsService({
            logger,
            elasticsearchClientPromise: Promise.resolve(clusterClient),
            pluginStop$,
            kibanaVersion: '8.8.0',
            dataStreamAdapter,
            elasticsearchAndSOAvailability$,
            isServerless: false,
          });

          await retryUntil(
            'alert service initialized',
            async () => alertsService.isInitialized() === true
          );
        });

        test('should correctly install resources for context when common initialization is complete', async () => {
          alertsService.register(TestRegistrationContext);
          await retryUntil(
            'context initialized',
            async () => (await getContextInitialized(alertsService)) === true
          );

          if (!useDataStreamForAlerts) {
            expect(clusterClient.ilm.putLifecycle).toHaveBeenCalledWith(IlmPutBody);
          } else {
            expect(clusterClient.ilm.putLifecycle).not.toHaveBeenCalled();
          }

          expect(clusterClient.cluster.putComponentTemplate).toHaveBeenCalledTimes(4);
          const componentTemplate1 = clusterClient.cluster.putComponentTemplate.mock.calls[0][0];
          expect(componentTemplate1.name).toEqual('.alerts-framework-mappings');
          const componentTemplate2 = clusterClient.cluster.putComponentTemplate.mock.calls[1][0];
          expect(componentTemplate2.name).toEqual('.alerts-legacy-alert-mappings');
          const componentTemplate3 = clusterClient.cluster.putComponentTemplate.mock.calls[2][0];
          expect(componentTemplate3.name).toEqual('.alerts-ecs-mappings');
          const componentTemplate4 = clusterClient.cluster.putComponentTemplate.mock.calls[3][0];
          expect(componentTemplate4.name).toEqual('.alerts-test.alerts-mappings');

          expect(clusterClient.indices.putIndexTemplate).toHaveBeenCalledWith(
            getIndexTemplatePutBody({ useDataStream: useDataStreamForAlerts })
          );
          expect(clusterClient.indices.putSettings).toHaveBeenCalledTimes(1);
          expect(clusterClient.indices.simulateIndexTemplate).toHaveBeenCalledTimes(1);
          expect(clusterClient.indices.putMapping).toHaveBeenCalledTimes(1);

          if (useDataStreamForAlerts) {
            expect(clusterClient.indices.createDataStream).not.toHaveBeenCalled();
            expect(clusterClient.indices.getDataStream).toHaveBeenCalledWith({
              expand_wildcards: 'all',
              name: '.alerts-test.alerts-default',
            });
          } else {
            expect(clusterClient.indices.create).not.toHaveBeenCalled();
            expect(clusterClient.indices.getAlias).toHaveBeenCalledWith({
              index: [
                '.internal.alerts-test.alerts-default-*',
                `.reindexed-v8-internal.alerts-test.alerts-default-*`,
              ],
              name: '.alerts-test.alerts-default',
              expand_wildcards: ['open', 'hidden'],
            });
          }
        });

        test('should correctly install resources for context when useLegacyAlerts is true', async () => {
          alertsService.register({ ...TestRegistrationContext, useLegacyAlerts: true });
          await retryUntil(
            'context initialized',
            async () => (await getContextInitialized(alertsService)) === true
          );

          if (!useDataStreamForAlerts) {
            expect(clusterClient.ilm.putLifecycle).toHaveBeenCalledWith(IlmPutBody);
          } else {
            expect(clusterClient.ilm.putLifecycle).not.toHaveBeenCalled();
          }

          expect(clusterClient.cluster.putComponentTemplate).toHaveBeenCalledTimes(4);
          const componentTemplate1 = clusterClient.cluster.putComponentTemplate.mock.calls[0][0];
          expect(componentTemplate1.name).toEqual('.alerts-framework-mappings');
          const componentTemplate2 = clusterClient.cluster.putComponentTemplate.mock.calls[1][0];
          expect(componentTemplate2.name).toEqual('.alerts-legacy-alert-mappings');
          const componentTemplate3 = clusterClient.cluster.putComponentTemplate.mock.calls[2][0];
          expect(componentTemplate3.name).toEqual('.alerts-ecs-mappings');
          const componentTemplate4 = clusterClient.cluster.putComponentTemplate.mock.calls[3][0];
          expect(componentTemplate4.name).toEqual('.alerts-test.alerts-mappings');

          expect(clusterClient.indices.putIndexTemplate).toHaveBeenCalledWith(
            getIndexTemplatePutBody({
              useLegacyAlerts: true,
              useDataStream: useDataStreamForAlerts,
            })
          );
          expect(clusterClient.indices.putSettings).toHaveBeenCalledTimes(1);
          expect(clusterClient.indices.simulateIndexTemplate).toHaveBeenCalledTimes(1);
          expect(clusterClient.indices.putMapping).toHaveBeenCalledTimes(1);

          if (useDataStreamForAlerts) {
            expect(clusterClient.indices.createDataStream).not.toHaveBeenCalled();
            expect(clusterClient.indices.getDataStream).toHaveBeenCalledWith({
              expand_wildcards: 'all',
              name: '.alerts-test.alerts-default',
            });
          } else {
            expect(clusterClient.indices.create).not.toHaveBeenCalled();
            expect(clusterClient.indices.getAlias).toHaveBeenCalledWith({
              index: [
                '.internal.alerts-test.alerts-default-*',
                `.reindexed-v8-internal.alerts-test.alerts-default-*`,
              ],
              name: '.alerts-test.alerts-default',
              expand_wildcards: ['open', 'hidden'],
            });
          }
        });

        test('should correctly install resources for context when useEcs is true', async () => {
          alertsService.register({ ...TestRegistrationContext, useEcs: true });
          await retryUntil(
            'context initialized',
            async () => (await getContextInitialized(alertsService)) === true
          );

          if (!useDataStreamForAlerts) {
            expect(clusterClient.ilm.putLifecycle).toHaveBeenCalledWith(IlmPutBody);
          } else {
            expect(clusterClient.ilm.putLifecycle).not.toHaveBeenCalled();
          }

          expect(clusterClient.cluster.putComponentTemplate).toHaveBeenCalledTimes(4);
          const componentTemplate1 = clusterClient.cluster.putComponentTemplate.mock.calls[0][0];
          expect(componentTemplate1.name).toEqual('.alerts-framework-mappings');
          const componentTemplate2 = clusterClient.cluster.putComponentTemplate.mock.calls[1][0];
          expect(componentTemplate2.name).toEqual('.alerts-legacy-alert-mappings');
          const componentTemplate3 = clusterClient.cluster.putComponentTemplate.mock.calls[2][0];
          expect(componentTemplate3.name).toEqual('.alerts-ecs-mappings');
          const componentTemplate4 = clusterClient.cluster.putComponentTemplate.mock.calls[3][0];
          expect(componentTemplate4.name).toEqual('.alerts-test.alerts-mappings');

          expect(clusterClient.indices.putIndexTemplate).toHaveBeenCalledWith(
            getIndexTemplatePutBody({ useEcs: true, useDataStream: useDataStreamForAlerts })
          );
          expect(clusterClient.indices.putSettings).toHaveBeenCalledTimes(1);
          expect(clusterClient.indices.simulateIndexTemplate).toHaveBeenCalledTimes(1);
          expect(clusterClient.indices.putMapping).toHaveBeenCalledTimes(1);
          if (useDataStreamForAlerts) {
            expect(clusterClient.indices.createDataStream).not.toHaveBeenCalled();
            expect(clusterClient.indices.getDataStream).toHaveBeenNthCalledWith(1, {
              expand_wildcards: 'all',
              name: '.alerts-test.alerts-default',
            });
          } else {
            expect(clusterClient.indices.create).not.toHaveBeenCalled();
            expect(clusterClient.indices.getAlias).toHaveBeenCalledWith({
              index: [
                '.internal.alerts-test.alerts-default-*',
                `.reindexed-v8-internal.alerts-test.alerts-default-*`,
              ],
              name: '.alerts-test.alerts-default',
              expand_wildcards: ['open', 'hidden'],
            });
          }
        });

        test('should save the dynamic_templates', async () => {
          const dynamicTemplates = [
            {
              strings_as_keywords: {
                path_match: 'test-path',
                match_mapping_type: 'string',
                mapping: {
                  type: 'keyword',
                  ignore_above: 1024,
                },
              },
            },
          ] satisfies IRuleTypeAlerts['mappings']['dynamicTemplates'];

          alertsService.register({
            ...TestRegistrationContext,
            mappings: {
              ...TestRegistrationContext.mappings,
              dynamicTemplates,
            },
          });
          await retryUntil(
            'context initialized',
            async () => (await getContextInitialized(alertsService)) === true
          );

          const componentTemplate = clusterClient.cluster.putComponentTemplate.mock.calls[3][0];
          expect(componentTemplate.template.mappings?.dynamic_templates).toEqual(dynamicTemplates);
        });

        test('should correctly install resources for custom namespace on demand when isSpaceAware is true', async () => {
          alertsService.register({ ...TestRegistrationContext, isSpaceAware: true });
          await retryUntil(
            'context initialized',
            async () => (await getContextInitialized(alertsService)) === true
          );

          if (!useDataStreamForAlerts) {
            expect(clusterClient.ilm.putLifecycle).toHaveBeenCalledWith(IlmPutBody);
          } else {
            expect(clusterClient.ilm.putLifecycle).not.toHaveBeenCalled();
          }

          expect(clusterClient.cluster.putComponentTemplate).toHaveBeenCalledTimes(4);
          expect(clusterClient.indices.putIndexTemplate).toHaveBeenNthCalledWith(
            1,
            getIndexTemplatePutBody({ useDataStream: useDataStreamForAlerts })
          );
          if (useDataStreamForAlerts) {
            expect(clusterClient.indices.createDataStream).not.toHaveBeenCalled();
            expect(clusterClient.indices.getDataStream).toHaveBeenNthCalledWith(1, {
              expand_wildcards: 'all',
              name: '.alerts-test.alerts-default',
            });
          } else {
            expect(clusterClient.indices.create).not.toHaveBeenCalled();
            expect(clusterClient.indices.getAlias).toHaveBeenNthCalledWith(1, {
              index: [
                '.internal.alerts-test.alerts-default-*',
                `.reindexed-v8-internal.alerts-test.alerts-default-*`,
              ],
              name: '.alerts-test.alerts-default',
              expand_wildcards: ['open', 'hidden'],
            });
          }
          expect(clusterClient.indices.putSettings).toHaveBeenCalledTimes(1);
          expect(clusterClient.indices.simulateIndexTemplate).toHaveBeenCalledTimes(1);
          expect(clusterClient.indices.putMapping).toHaveBeenCalledTimes(1);

          clusterClient.indices.getDataStream.mockImplementationOnce(async () => ({
            data_streams: [],
          }));
          clusterClient.indices.getAlias.mockImplementationOnce(async () => ({}));

          await retryUntil(
            'context in namespace initialized',
            async () =>
              (await getContextInitialized(
                alertsService,
                TestRegistrationContext.context,
                'another-namespace'
              )) === true
          );

          expect(clusterClient.indices.putIndexTemplate).toHaveBeenNthCalledWith(
            2,
            getIndexTemplatePutBody({
              namespace: 'another-namespace',
              useDataStream: useDataStreamForAlerts,
            })
          );
          expect(clusterClient.indices.putSettings).toHaveBeenCalledTimes(1);
          expect(clusterClient.indices.simulateIndexTemplate).toHaveBeenCalledTimes(1);
          expect(clusterClient.indices.putMapping).toHaveBeenCalledTimes(1);
          if (useDataStreamForAlerts) {
            expect(clusterClient.indices.createDataStream).toHaveBeenNthCalledWith(1, {
              name: '.alerts-test.alerts-another-namespace',
            });
            expect(clusterClient.indices.getDataStream).toHaveBeenNthCalledWith(2, {
              expand_wildcards: 'all',
              name: '.alerts-test.alerts-another-namespace',
            });
          } else {
            expect(clusterClient.indices.create).toHaveBeenNthCalledWith(1, {
              index: '.internal.alerts-test.alerts-another-namespace-000001',
              aliases: {
                '.alerts-test.alerts-another-namespace': {
                  is_write_index: true,
                  is_hidden: true,
                },
              },
            });
            expect(clusterClient.indices.getAlias).toHaveBeenNthCalledWith(2, {
              index: [
                '.internal.alerts-test.alerts-another-namespace-*',
                '.reindexed-v8-internal.alerts-test.alerts-another-namespace-*',
              ],
              name: '.alerts-test.alerts-another-namespace',
              expand_wildcards: ['open', 'hidden'],
            });
          }
        });

        test('should correctly install resources for context when secondaryAlias is defined', async () => {
          if (useDataStreamForAlerts) return;

          alertsService.register({ ...TestRegistrationContext, secondaryAlias: 'another.alias' });
          await retryUntil(
            'context initialized',
            async () => (await getContextInitialized(alertsService)) === true
          );

          expect(clusterClient.ilm.putLifecycle).toHaveBeenCalledWith(IlmPutBody);

          expect(clusterClient.cluster.putComponentTemplate).toHaveBeenCalledTimes(4);
          const componentTemplate1 = clusterClient.cluster.putComponentTemplate.mock.calls[0][0];
          expect(componentTemplate1.name).toEqual('.alerts-framework-mappings');
          const componentTemplate2 = clusterClient.cluster.putComponentTemplate.mock.calls[1][0];
          expect(componentTemplate2.name).toEqual('.alerts-legacy-alert-mappings');
          const componentTemplate3 = clusterClient.cluster.putComponentTemplate.mock.calls[2][0];
          expect(componentTemplate3.name).toEqual('.alerts-ecs-mappings');
          const componentTemplate4 = clusterClient.cluster.putComponentTemplate.mock.calls[3][0];
          expect(componentTemplate4.name).toEqual('.alerts-test.alerts-mappings');

          expect(clusterClient.indices.putIndexTemplate).toHaveBeenCalledWith(
            getIndexTemplatePutBody({
              secondaryAlias: 'another.alias',
              useDataStream: useDataStreamForAlerts,
            })
          );
          expect(clusterClient.indices.getAlias).toHaveBeenCalledWith({
            index: [
              '.internal.alerts-test.alerts-default-*',
              '.reindexed-v8-internal.alerts-test.alerts-default-*',
            ],
            name: '.alerts-test.alerts-default',
            expand_wildcards: ['open', 'hidden'],
          });
          expect(clusterClient.indices.putSettings).toHaveBeenCalledTimes(1);
          expect(clusterClient.indices.simulateIndexTemplate).toHaveBeenCalledTimes(1);
          expect(clusterClient.indices.putMapping).toHaveBeenCalledTimes(1);
          expect(clusterClient.indices.create).not.toHaveBeenCalled();
        });

        test('should not install component template for context if fieldMap is empty', async () => {
          alertsService.register({
            context: 'empty',
            mappings: { fieldMap: {} },
          });
          await retryUntil(
            'context initialized',
            async () => (await getContextInitialized(alertsService, 'empty')) === true
          );

          if (!useDataStreamForAlerts) {
            expect(clusterClient.ilm.putLifecycle).toHaveBeenCalledWith(IlmPutBody);
          } else {
            expect(clusterClient.ilm.putLifecycle).not.toHaveBeenCalled();
          }

          expect(clusterClient.cluster.putComponentTemplate).toHaveBeenCalledTimes(3);
          const componentTemplate1 = clusterClient.cluster.putComponentTemplate.mock.calls[0][0];
          expect(componentTemplate1.name).toEqual('.alerts-framework-mappings');
          const componentTemplate2 = clusterClient.cluster.putComponentTemplate.mock.calls[1][0];
          expect(componentTemplate2.name).toEqual('.alerts-legacy-alert-mappings');
          const componentTemplate3 = clusterClient.cluster.putComponentTemplate.mock.calls[2][0];
          expect(componentTemplate3.name).toEqual('.alerts-ecs-mappings');

          const template = {
            name: `.alerts-empty.alerts-default-index-template`,
            index_patterns: useDataStreamForAlerts
              ? [`.alerts-empty.alerts-default`]
              : [
                  `.internal.alerts-empty.alerts-default-*`,
                  `.reindexed-v8-internal.alerts-empty.alerts-default-*`,
                ],
            composed_of: ['.alerts-framework-mappings'],
            ...(useDataStreamForAlerts ? { data_stream: { hidden: true } } : {}),
            priority: 7,
            template: {
              settings: {
                auto_expand_replicas: '0-1',
                hidden: true,
                ...(useDataStreamForAlerts
                  ? {}
                  : {
                      'index.lifecycle': {
                        name: '.alerts-ilm-policy',
                        rollover_alias: `.alerts-empty.alerts-default`,
                      },
                    }),
                'index.mapping.ignore_malformed': true,
                'index.mapping.total_fields.ignore_dynamic_beyond_limit': true,
                'index.mapping.total_fields.limit': 2800,
              },
              mappings: {
                _meta: {
                  kibana: { version: '8.8.0' },
                  managed: true,
                  namespace: 'default',
                },
                dynamic: false,
              },
            },
            _meta: {
              kibana: { version: '8.8.0' },
              managed: true,
              namespace: 'default',
            },
          };

          expect(clusterClient.indices.putIndexTemplate).toHaveBeenCalledWith(template);

          if (useDataStreamForAlerts) {
            expect(clusterClient.indices.createDataStream).not.toHaveBeenCalled();
            expect(clusterClient.indices.getDataStream).toHaveBeenCalledWith({
              expand_wildcards: 'all',
              name: '.alerts-empty.alerts-default',
            });
          } else {
            expect(clusterClient.indices.create).not.toHaveBeenCalled();
            expect(clusterClient.indices.getAlias).toHaveBeenCalledWith({
              index: [
                '.internal.alerts-empty.alerts-default-*',
                '.reindexed-v8-internal.alerts-empty.alerts-default-*',
              ],
              name: '.alerts-empty.alerts-default',
              expand_wildcards: ['open', 'hidden'],
            });
          }

          expect(clusterClient.indices.putSettings).toHaveBeenCalledTimes(1);
          expect(clusterClient.indices.simulateIndexTemplate).toHaveBeenCalledTimes(1);
          expect(clusterClient.indices.putMapping).toHaveBeenCalledTimes(1);
        });

        test('should skip initialization if context already exists', async () => {
          alertsService.register(TestRegistrationContext);
          alertsService.register(TestRegistrationContext);

          expect(logger.debug).toHaveBeenCalledWith(
            `Resources for context "test" have already been registered.`
          );
        });

        test('should throw error if context already exists and has been registered with a different field map', async () => {
          alertsService.register(TestRegistrationContext);
          expect(() => {
            alertsService.register({
              ...TestRegistrationContext,
              mappings: { fieldMap: { anotherField: { type: 'keyword', required: false } } },
            });
          }).toThrowErrorMatchingInlineSnapshot(
            `"test has already been registered with different options"`
          );
        });

        test('should throw error if context already exists and has been registered with a different options', async () => {
          alertsService.register(TestRegistrationContext);
          expect(() => {
            alertsService.register({
              ...TestRegistrationContext,
              useEcs: true,
            });
          }).toThrowErrorMatchingInlineSnapshot(
            `"test has already been registered with different options"`
          );
        });

        test('should allow same context with different "shouldWrite" option', async () => {
          alertsService.register(TestRegistrationContext);
          alertsService.register({
            ...TestRegistrationContext,
            shouldWrite: false,
          });

          expect(logger.debug).toHaveBeenCalledWith(
            `Resources for context "test" have already been registered.`
          );
        });

        test('should not update index template if simulating template throws error', async () => {
          clusterClient.indices.simulateTemplate.mockRejectedValueOnce(new Error('fail'));

          alertsService.register(TestRegistrationContext);
          await retryUntil(
            'context initialized',
            async () => (await getContextInitialized(alertsService)) === true
          );

          expect(logger.error).toHaveBeenCalledWith(
            `Failed to simulate index template mappings for .alerts-test.alerts-default-index-template; not applying mappings - fail`,
            expect.any(Error)
          );

          expect(clusterClient.ilm.putLifecycle).toHaveBeenCalledTimes(
            useDataStreamForAlerts ? 0 : 1
          );
          expect(clusterClient.cluster.putComponentTemplate).toHaveBeenCalledTimes(4);
          expect(clusterClient.indices.simulateTemplate).toHaveBeenCalled();
          // putIndexTemplate is skipped but other operations are called as expected
          expect(clusterClient.indices.putIndexTemplate).not.toHaveBeenCalled();
          expect(clusterClient.indices.putSettings).toHaveBeenCalled();
          expect(clusterClient.indices.simulateIndexTemplate).toHaveBeenCalled();
          expect(clusterClient.indices.putMapping).toHaveBeenCalled();

          if (useDataStreamForAlerts) {
            expect(clusterClient.indices.createDataStream).not.toHaveBeenCalled();
            expect(clusterClient.indices.getDataStream).toHaveBeenCalled();
          } else {
            expect(clusterClient.indices.create).not.toHaveBeenCalled();
            expect(clusterClient.indices.getAlias).toHaveBeenCalled();
          }
        });

        test('should log error and set initialized to false if simulating template returns empty mappings', async () => {
          clusterClient.indices.simulateTemplate.mockImplementationOnce(async () => ({
            ...SimulateTemplateResponse,
            template: {
              ...SimulateTemplateResponse.template,
              mappings: {},
            },
          }));

          alertsService.register(TestRegistrationContext);
          await retryUntil('error logger called', async () => logger.error.mock.calls.length > 0);
          expect(
            await alertsService.getContextInitializationPromise(
              TestRegistrationContext.context,
              DEFAULT_NAMESPACE_STRING
            )
          ).toEqual({
            result: false,
            error:
              'Failure during installation. No mappings would be generated for .alerts-test.alerts-default-index-template, possibly due to failed/misconfigured bootstrapping',
          });

          expect(logger.error).toHaveBeenCalledWith(
            new Error(
              `No mappings would be generated for .alerts-test.alerts-default-index-template, possibly due to failed/misconfigured bootstrapping`
            )
          );

          expect(clusterClient.ilm.putLifecycle).toHaveBeenCalledTimes(
            useDataStreamForAlerts ? 0 : 1
          );
          expect(clusterClient.cluster.putComponentTemplate).toHaveBeenCalledTimes(4);
          expect(clusterClient.indices.simulateTemplate).toHaveBeenCalled();
          expect(clusterClient.indices.putIndexTemplate).not.toHaveBeenCalled();
          expect(clusterClient.indices.getAlias).not.toHaveBeenCalled();
          expect(clusterClient.indices.putSettings).not.toHaveBeenCalled();
          expect(clusterClient.indices.simulateIndexTemplate).not.toHaveBeenCalled();
          expect(clusterClient.indices.putMapping).not.toHaveBeenCalled();
          expect(clusterClient.indices.create).not.toHaveBeenCalled();
        });

        test('should log error and set initialized to false if updating index template throws error', async () => {
          clusterClient.indices.putIndexTemplate.mockRejectedValueOnce(new Error('fail'));

          alertsService.register(TestRegistrationContext);
          await retryUntil('error logger called', async () => logger.error.mock.calls.length > 0);

          expect(
            await alertsService.getContextInitializationPromise(
              TestRegistrationContext.context,
              DEFAULT_NAMESPACE_STRING
            )
          ).toEqual({ error: 'Failure during installation. fail', result: false });

          expect(logger.error).toHaveBeenCalledWith(
            `Error installing index template .alerts-test.alerts-default-index-template - fail`,
            expect.any(Error)
          );

          expect(clusterClient.ilm.putLifecycle).toHaveBeenCalledTimes(
            useDataStreamForAlerts ? 0 : 1
          );
          expect(clusterClient.cluster.putComponentTemplate).toHaveBeenCalledTimes(4);
          expect(clusterClient.indices.simulateTemplate).toHaveBeenCalled();
          expect(clusterClient.indices.putIndexTemplate).toHaveBeenCalled();
          expect(clusterClient.indices.getAlias).not.toHaveBeenCalled();
          expect(clusterClient.indices.putSettings).not.toHaveBeenCalled();
          expect(clusterClient.indices.simulateIndexTemplate).not.toHaveBeenCalled();
          expect(clusterClient.indices.putMapping).not.toHaveBeenCalled();
          expect(clusterClient.indices.create).not.toHaveBeenCalled();
        });

        test('should log error and set initialized to false if checking for concrete write index throws error', async () => {
          clusterClient.indices.getAlias.mockRejectedValueOnce(new Error('fail'));
          clusterClient.indices.getDataStream.mockRejectedValueOnce(new Error('fail'));

          alertsService.register(TestRegistrationContext);
          await retryUntil('error logger called', async () => logger.error.mock.calls.length > 0);
          expect(
            await alertsService.getContextInitializationPromise(
              TestRegistrationContext.context,
              DEFAULT_NAMESPACE_STRING
            )
          ).toEqual({ error: 'Failure during installation. fail', result: false });

          expect(logger.error).toHaveBeenCalledWith(
            useDataStreamForAlerts
              ? `Error fetching data stream for .alerts-test.alerts-default - fail`
              : `Error fetching concrete indices for .internal.alerts-test.alerts-default-* pattern - fail`
          );

          expect(clusterClient.ilm.putLifecycle).toHaveBeenCalledTimes(
            useDataStreamForAlerts ? 0 : 1
          );
          expect(clusterClient.cluster.putComponentTemplate).toHaveBeenCalledTimes(4);
          expect(clusterClient.indices.simulateTemplate).toHaveBeenCalled();
          expect(clusterClient.indices.putIndexTemplate).toHaveBeenCalled();
          expect(clusterClient.indices.putSettings).not.toHaveBeenCalled();
          expect(clusterClient.indices.simulateIndexTemplate).not.toHaveBeenCalled();
          expect(clusterClient.indices.putMapping).not.toHaveBeenCalled();
          expect(clusterClient.indices.create).not.toHaveBeenCalled();
        });

        test('should not throw error if checking for concrete write index throws 404', async () => {
          const error = new Error(`index doesn't exist`) as HTTPError;
          error.statusCode = 404;
          clusterClient.indices.getAlias.mockRejectedValueOnce(error);
          clusterClient.indices.getDataStream.mockRejectedValueOnce(error);

          alertsService.register(TestRegistrationContext);
          await retryUntil(
            'context initialized',
            async () => (await getContextInitialized(alertsService)) === true
          );

          expect(clusterClient.ilm.putLifecycle).toHaveBeenCalledTimes(
            useDataStreamForAlerts ? 0 : 1
          );
          expect(clusterClient.cluster.putComponentTemplate).toHaveBeenCalledTimes(4);
          expect(clusterClient.indices.simulateTemplate).toHaveBeenCalled();
          expect(clusterClient.indices.putIndexTemplate).toHaveBeenCalled();
          expect(clusterClient.indices.putSettings).not.toHaveBeenCalled();
          expect(clusterClient.indices.simulateIndexTemplate).not.toHaveBeenCalled();
          expect(clusterClient.indices.putMapping).not.toHaveBeenCalled();

          if (useDataStreamForAlerts) {
            expect(clusterClient.indices.createDataStream).toHaveBeenCalled();
          } else {
            expect(clusterClient.indices.create).toHaveBeenCalled();
          }
        });

        test('should log error but set initialized to true if updating index settings for existing indices throws error', async () => {
          clusterClient.indices.putSettings.mockRejectedValue(new Error('fail'));

          alertsService.register(TestRegistrationContext);
          await retryUntil('error logger called', async () => logger.error.mock.calls.length > 0);

          expect(
            await alertsService.getContextInitializationPromise(
              TestRegistrationContext.context,
              DEFAULT_NAMESPACE_STRING
            )
          ).toEqual({ result: true });

          expect(logger.error).toHaveBeenCalledWith(
            `Failed to PUT index.mapping.total_fields.limit settings for .alerts-test.alerts-default: fail`
          );

          expect(clusterClient.ilm.putLifecycle).toHaveBeenCalledTimes(
            useDataStreamForAlerts ? 0 : 1
          );
          expect(clusterClient.cluster.putComponentTemplate).toHaveBeenCalledTimes(4);
          expect(clusterClient.indices.simulateTemplate).toHaveBeenCalled();
          expect(clusterClient.indices.putIndexTemplate).toHaveBeenCalled();
          expect(clusterClient.indices.putSettings).toHaveBeenCalled();
          expect(clusterClient.indices.simulateIndexTemplate).toHaveBeenCalled();
          expect(clusterClient.indices.putMapping).not.toHaveBeenCalled();

          if (useDataStreamForAlerts) {
            expect(clusterClient.indices.createDataStream).not.toHaveBeenCalled();
            expect(clusterClient.indices.getDataStream).toHaveBeenCalled();
          } else {
            expect(clusterClient.indices.create).not.toHaveBeenCalled();
            expect(clusterClient.indices.getAlias).toHaveBeenCalled();
          }
        });

        test('should skip updating index mapping for existing indices if simulate index template throws error', async () => {
          clusterClient.indices.simulateIndexTemplate.mockRejectedValueOnce(new Error('fail'));

          alertsService.register(TestRegistrationContext);
          await retryUntil(
            'context initialized',
            async () => (await getContextInitialized(alertsService)) === true
          );

          expect(logger.error).toHaveBeenCalledWith(
            useDataStreamForAlerts
              ? `Ignored PUT mappings for .alerts-test.alerts-default; error generating simulated mappings: fail`
              : `Ignored PUT mappings for .internal.alerts-test.alerts-default-000001; error generating simulated mappings: fail`
          );

          expect(clusterClient.ilm.putLifecycle).toHaveBeenCalledTimes(
            useDataStreamForAlerts ? 0 : 1
          );
          expect(clusterClient.cluster.putComponentTemplate).toHaveBeenCalledTimes(4);
          expect(clusterClient.indices.simulateTemplate).toHaveBeenCalled();
          expect(clusterClient.indices.putIndexTemplate).toHaveBeenCalled();
          expect(clusterClient.indices.putSettings).not.toHaveBeenCalled();
          expect(clusterClient.indices.simulateIndexTemplate).toHaveBeenCalled();

          if (useDataStreamForAlerts) {
            expect(clusterClient.indices.createDataStream).not.toHaveBeenCalled();
            expect(clusterClient.indices.getDataStream).toHaveBeenCalled();
          } else {
            expect(clusterClient.indices.create).not.toHaveBeenCalled();
            expect(clusterClient.indices.getAlias).toHaveBeenCalled();

            // this is called to update backing indices, so not used with data streams
            expect(clusterClient.indices.putMapping).not.toHaveBeenCalled();
          }
        });

        test('should log error but set initialized to true if updating index mappings for existing indices throws error', async () => {
          clusterClient.indices.putMapping.mockRejectedValueOnce(new Error('fail'));

          alertsService.register(TestRegistrationContext);
          await retryUntil('error logger called', async () => logger.error.mock.calls.length > 0);
          expect(
            await alertsService.getContextInitializationPromise(
              TestRegistrationContext.context,
              DEFAULT_NAMESPACE_STRING
            )
          ).toEqual({ result: true });

          expect(logger.error).toHaveBeenCalledWith(
            `Failed to PUT mapping for .alerts-test.alerts-default: fail`
          );

          expect(clusterClient.ilm.putLifecycle).toHaveBeenCalledTimes(
            useDataStreamForAlerts ? 0 : 1
          );
          expect(clusterClient.cluster.putComponentTemplate).toHaveBeenCalledTimes(4);
          expect(clusterClient.indices.simulateTemplate).toHaveBeenCalled();
          expect(clusterClient.indices.putIndexTemplate).toHaveBeenCalled();
          expect(clusterClient.indices.putSettings).toHaveBeenCalled();
          expect(clusterClient.indices.simulateIndexTemplate).toHaveBeenCalled();
          expect(clusterClient.indices.putMapping).toHaveBeenCalled();

          if (useDataStreamForAlerts) {
            expect(clusterClient.indices.createDataStream).not.toHaveBeenCalled();
            expect(clusterClient.indices.getDataStream).toHaveBeenCalled();
          } else {
            expect(clusterClient.indices.create).not.toHaveBeenCalled();
            expect(clusterClient.indices.getAlias).toHaveBeenCalled();
          }
        });

        test('should log error and set initialized to false if updating index mappings and rolling over both fail', async () => {
          clusterClient.indices.putMapping.mockRejectedValue(new Error('fail'));
          clusterClient.indices.rollover.mockRejectedValue(new Error('rollover failure'));

          alertsService.register(TestRegistrationContext);
          await retryUntil('error logger called', async () => logger.error.mock.calls.length > 0);
          expect(
            await alertsService.getContextInitializationPromise(
              TestRegistrationContext.context,
              DEFAULT_NAMESPACE_STRING
            )
          ).toEqual({ error: 'Failure during installation. rollover failure', result: false });

          expect(logger.error).toHaveBeenCalledWith(
            `Failed to PUT mapping for .alerts-test.alerts-default: fail`
          );
          expect(logger.error).toHaveBeenCalledWith(
            'Error initializing context test - Failure during installation. rollover failure'
          );

          expect(clusterClient.ilm.putLifecycle).toHaveBeenCalledTimes(
            useDataStreamForAlerts ? 0 : 1
          );
          expect(clusterClient.cluster.putComponentTemplate).toHaveBeenCalledTimes(4);
          expect(clusterClient.indices.simulateTemplate).toHaveBeenCalled();
          expect(clusterClient.indices.putIndexTemplate).toHaveBeenCalled();
          expect(clusterClient.indices.putSettings).toHaveBeenCalled();
          expect(clusterClient.indices.simulateIndexTemplate).toHaveBeenCalled();
          expect(clusterClient.indices.putMapping).toHaveBeenCalled();

          if (useDataStreamForAlerts) {
            expect(clusterClient.indices.createDataStream).not.toHaveBeenCalled();
            expect(clusterClient.indices.getDataStream).toHaveBeenCalled();
          } else {
            expect(clusterClient.indices.create).not.toHaveBeenCalled();
            expect(clusterClient.indices.getAlias).toHaveBeenCalled();
          }
        });

        test('does not update settings or mappings if no existing concrete indices', async () => {
          clusterClient.indices.getAlias.mockImplementationOnce(async () => ({}));
          clusterClient.indices.getDataStream.mockImplementationOnce(async () => ({
            data_streams: [],
          }));

          alertsService.register(TestRegistrationContext);
          await retryUntil(
            'context initialized',
            async () => (await getContextInitialized(alertsService)) === true
          );

          expect(clusterClient.ilm.putLifecycle).toHaveBeenCalledTimes(
            useDataStreamForAlerts ? 0 : 1
          );
          expect(clusterClient.cluster.putComponentTemplate).toHaveBeenCalledTimes(4);
          expect(clusterClient.indices.simulateTemplate).toHaveBeenCalled();
          expect(clusterClient.indices.putIndexTemplate).toHaveBeenCalled();
          expect(clusterClient.indices.putSettings).not.toHaveBeenCalled();
          expect(clusterClient.indices.simulateIndexTemplate).not.toHaveBeenCalled();
          expect(clusterClient.indices.putMapping).not.toHaveBeenCalled();

          if (useDataStreamForAlerts) {
            expect(clusterClient.indices.createDataStream).toHaveBeenCalled();
            expect(clusterClient.indices.getDataStream).toHaveBeenCalled();
          } else {
            expect(clusterClient.indices.create).toHaveBeenCalled();
            expect(clusterClient.indices.getAlias).toHaveBeenCalled();
          }
        });

        test('should log error and set initialized to false if concrete indices exist but none are write index', async () => {
          // not applicable for data streams
          if (useDataStreamForAlerts) return;

          clusterClient.indices.getAlias.mockImplementationOnce(async () => ({
            '.internal.alerts-test.alerts-default-0001': {
              aliases: {
                '.alerts-test.alerts-default': {
                  is_write_index: false,
                  is_hidden: true,
                },
                alias_2: {
                  is_write_index: false,
                  is_hidden: true,
                },
              },
            },
          }));

          alertsService.register(TestRegistrationContext);
          await retryUntil('error logger called', async () => logger.error.mock.calls.length > 0);
          expect(
            await alertsService.getContextInitializationPromise(
              TestRegistrationContext.context,
              DEFAULT_NAMESPACE_STRING
            )
          ).toEqual({ result: true });

          expect(logger.debug).toHaveBeenCalledWith(
            `Indices for alias .alerts-test.alerts-default exist but none are set as the write index`
          );

          expect(clusterClient.ilm.putLifecycle).toHaveBeenCalled();
          expect(clusterClient.cluster.putComponentTemplate).toHaveBeenCalledTimes(4);
          expect(clusterClient.indices.simulateTemplate).toHaveBeenCalled();
          expect(clusterClient.indices.putIndexTemplate).toHaveBeenCalled();
          expect(clusterClient.indices.getAlias).toHaveBeenCalled();
          expect(clusterClient.indices.putSettings).toHaveBeenCalled();
          expect(clusterClient.indices.simulateIndexTemplate).toHaveBeenCalled();
          expect(clusterClient.indices.putMapping).toHaveBeenCalled();
          expect(clusterClient.indices.create).not.toHaveBeenCalled();
        });

        test('does not create new index if concrete write index exists', async () => {
          // not applicable for data streams
          if (useDataStreamForAlerts) return;

          clusterClient.indices.getAlias.mockImplementationOnce(async () => ({
            '.internal.alerts-test.alerts-default-0001': {
              aliases: {
                '.alerts-test.alerts-default': {
                  is_write_index: true,
                  is_hidden: true,
                },
                alias_2: {
                  is_write_index: false,
                  is_hidden: true,
                },
              },
            },
          }));

          alertsService.register(TestRegistrationContext);
          await retryUntil(
            'context initialized',
            async () => (await getContextInitialized(alertsService)) === true
          );

          expect(clusterClient.ilm.putLifecycle).toHaveBeenCalled();
          expect(clusterClient.cluster.putComponentTemplate).toHaveBeenCalledTimes(4);
          expect(clusterClient.indices.simulateTemplate).toHaveBeenCalled();
          expect(clusterClient.indices.putIndexTemplate).toHaveBeenCalled();
          expect(clusterClient.indices.putSettings).toHaveBeenCalled();
          expect(clusterClient.indices.simulateIndexTemplate).toHaveBeenCalled();
          expect(clusterClient.indices.putMapping).toHaveBeenCalled();

          if (useDataStreamForAlerts) {
            expect(clusterClient.indices.createDataStream).not.toHaveBeenCalled();
            expect(clusterClient.indices.getDataStream).toHaveBeenCalled();
          } else {
            expect(clusterClient.indices.create).not.toHaveBeenCalled();
            expect(clusterClient.indices.getAlias).toHaveBeenCalled();
          }
        });

        test('should log error and set initialized to false if create concrete index throws error', async () => {
          // not applicable for data streams
          if (useDataStreamForAlerts) return;

          clusterClient.indices.getAlias.mockImplementationOnce(async () => ({}));

          clusterClient.indices.create.mockRejectedValueOnce(new Error('fail'));
          clusterClient.indices.createDataStream.mockRejectedValueOnce(new Error('fail'));

          alertsService.register(TestRegistrationContext);
          await retryUntil('error logger called', async () => logger.error.mock.calls.length > 0);

          expect(
            await alertsService.getContextInitializationPromise(
              TestRegistrationContext.context,
              DEFAULT_NAMESPACE_STRING
            )
          ).toEqual({ error: 'Failure during installation. fail', result: false });

          expect(logger.error).toHaveBeenCalledWith(`Error creating concrete write index - fail`);

          expect(clusterClient.ilm.putLifecycle).toHaveBeenCalled();
          expect(clusterClient.cluster.putComponentTemplate).toHaveBeenCalledTimes(4);
          expect(clusterClient.indices.simulateTemplate).toHaveBeenCalled();
          expect(clusterClient.indices.putIndexTemplate).toHaveBeenCalled();
          expect(clusterClient.indices.putSettings).not.toHaveBeenCalled();
          expect(clusterClient.indices.simulateIndexTemplate).not.toHaveBeenCalled();
          expect(clusterClient.indices.putMapping).not.toHaveBeenCalled();

          if (useDataStreamForAlerts) {
            expect(clusterClient.indices.createDataStream).toHaveBeenCalled();
            expect(clusterClient.indices.getDataStream).toHaveBeenCalled();
          } else {
            expect(clusterClient.indices.create).toHaveBeenCalled();
            expect(clusterClient.indices.getAlias).toHaveBeenCalled();
          }
        });

        test('should not throw error if create concrete index throws resource_already_exists_exception error and write index already exists', async () => {
          // not applicable for data streams
          if (useDataStreamForAlerts) return;

          clusterClient.indices.getAlias.mockImplementationOnce(async () => ({}));

          const error = new Error(`fail`) as EsError;
          error.meta = {
            body: {
              error: {
                type: 'resource_already_exists_exception',
              },
            },
          };
          clusterClient.indices.create.mockRejectedValueOnce(error);
          clusterClient.indices.get.mockImplementationOnce(async () => ({
            '.internal.alerts-test.alerts-default-000001': {
              aliases: { '.alerts-test.alerts-default': { is_write_index: true } },
            },
          }));

          alertsService.register(TestRegistrationContext);
          await retryUntil(
            'context initialized',
            async () => (await getContextInitialized(alertsService)) === true
          );

          expect(logger.error).toHaveBeenCalledWith(`Error creating concrete write index - fail`);

          expect(clusterClient.ilm.putLifecycle).toHaveBeenCalled();
          expect(clusterClient.cluster.putComponentTemplate).toHaveBeenCalledTimes(4);
          expect(clusterClient.indices.simulateTemplate).toHaveBeenCalled();
          expect(clusterClient.indices.putIndexTemplate).toHaveBeenCalled();
          expect(clusterClient.indices.getAlias).toHaveBeenCalled();
          expect(clusterClient.indices.putSettings).not.toHaveBeenCalled();
          expect(clusterClient.indices.simulateIndexTemplate).not.toHaveBeenCalled();
          expect(clusterClient.indices.putMapping).not.toHaveBeenCalled();
          expect(clusterClient.indices.get).toHaveBeenCalled();
          expect(clusterClient.indices.create).toHaveBeenCalled();
        });

        test('should log error and set initialized to false if create concrete index throws resource_already_exists_exception error and write index does not already exists', async () => {
          // not applicable for data streams
          if (useDataStreamForAlerts) return;

          clusterClient.indices.getAlias.mockImplementationOnce(async () => ({}));

          const error = new Error(`fail`) as EsError;
          error.meta = {
            body: {
              error: {
                type: 'resource_already_exists_exception',
              },
            },
          };
          clusterClient.indices.create.mockRejectedValueOnce(error);
          clusterClient.indices.get.mockImplementationOnce(async () => ({
            '.internal.alerts-test.alerts-default-000001': {
              aliases: { '.alerts-test.alerts-default': { is_write_index: false } },
            },
          }));

          alertsService.register(TestRegistrationContext);
          await retryUntil('error logger called', async () => logger.error.mock.calls.length > 0);
          expect(
            await alertsService.getContextInitializationPromise(
              TestRegistrationContext.context,
              DEFAULT_NAMESPACE_STRING
            )
          ).toEqual({
            error:
              'Failure during installation. Attempted to create index: .internal.alerts-test.alerts-default-000001 as the write index for alias: .alerts-test.alerts-default, but the index already exists and is not the write index for the alias',
            result: false,
          });

          expect(logger.error).toHaveBeenCalledWith(`Error creating concrete write index - fail`);

          expect(clusterClient.ilm.putLifecycle).toHaveBeenCalled();
          expect(clusterClient.cluster.putComponentTemplate).toHaveBeenCalledTimes(4);
          expect(clusterClient.indices.simulateTemplate).toHaveBeenCalled();
          expect(clusterClient.indices.putIndexTemplate).toHaveBeenCalled();
          expect(clusterClient.indices.getAlias).toHaveBeenCalled();
          expect(clusterClient.indices.putSettings).not.toHaveBeenCalled();
          expect(clusterClient.indices.simulateIndexTemplate).not.toHaveBeenCalled();
          expect(clusterClient.indices.putMapping).not.toHaveBeenCalled();
          expect(clusterClient.indices.get).toHaveBeenCalled();
          expect(clusterClient.indices.create).toHaveBeenCalled();
        });
      });

      describe('createAlertsClient()', () => {
        let alertsService: AlertsService;
        beforeEach(async () => {
          (AlertsClient as jest.Mock).mockImplementation(() => alertsClient);
        });

        test('should create new AlertsClient', async () => {
          alertsService = new AlertsService({
            logger,
            elasticsearchClientPromise: Promise.resolve(clusterClient),
            pluginStop$,
            kibanaVersion: '8.8.0',
            dataStreamAdapter,
            elasticsearchAndSOAvailability$,
            isServerless: true,
          });

          await retryUntil(
            'alert service initialized',
            async () => alertsService.isInitialized() === true
          );
          alertsService.register(TestRegistrationContext);
          await retryUntil(
            'context initialized',
            async () => (await getContextInitialized(alertsService)) === true
          );

          await alertsService.createAlertsClient({
            alertingEventLogger,
            logger,
            request: fakeRequest,
            ruleType: ruleTypeWithAlertDefinition,
            maintenanceWindowsService,
            namespace: 'default',
            spaceId: 'default',
            rule: {
              consumer: 'bar',
              executionId: '5f6aa57d-3e22-484e-bae8-cbed868f4d28',
              id: '1',
              name: 'rule-name',
              parameters: {
                bar: true,
              },
              revision: 0,
              spaceId: 'default',
              tags: ['rule-', '-tags'],
              alertDelay: 0,
              muteAll: false,
              mutedInstanceIds: [],
            },
          });

          expect(AlertsClient).toHaveBeenCalledWith({
            alertingEventLogger,
            logger,
            elasticsearchClientPromise: Promise.resolve(clusterClient),
            dataStreamAdapter,
            request: fakeRequest,
            ruleType: ruleTypeWithAlertDefinition,
            maintenanceWindowsService,
            namespace: 'default',
            spaceId: 'default',
            isServerless: true,
            rule: {
              muteAll: false,
              mutedInstanceIds: [],
              consumer: 'bar',
              executionId: '5f6aa57d-3e22-484e-bae8-cbed868f4d28',
              id: '1',
              name: 'rule-name',
              parameters: {
                bar: true,
              },
              revision: 0,
              spaceId: 'default',
              tags: ['rule-', '-tags'],
              alertDelay: 0,
            },
            kibanaVersion: '8.8.0',
          });
        });

        test('should return null if rule type has no alert definition', async () => {
          alertsService = new AlertsService({
            logger,
            elasticsearchClientPromise: Promise.resolve(clusterClient),
            pluginStop$,
            kibanaVersion: '8.8.0',
            dataStreamAdapter,
            elasticsearchAndSOAvailability$,
            isServerless: false,
          });

          await retryUntil(
            'alert service initialized',
            async () => alertsService.isInitialized() === true
          );
          const result = await alertsService.createAlertsClient({
            alertingEventLogger,
            logger,
            request: fakeRequest,
            ruleType,
            maintenanceWindowsService,
            namespace: 'default',
            spaceId: 'default',
            rule: {
              muteAll: false,
              mutedInstanceIds: [],
              consumer: 'bar',
              executionId: '5f6aa57d-3e22-484e-bae8-cbed868f4d28',
              id: '1',
              name: 'rule-name',
              parameters: {
                bar: true,
              },
              revision: 0,
              spaceId: 'default',
              tags: ['rule-', '-tags'],
              alertDelay: 0,
            },
          });

          expect(result).toBe(null);
          expect(AlertsClient).not.toHaveBeenCalled();
        });

        test('should retry initializing common resources if common resource initialization failed', async () => {
          clusterClient.cluster.putComponentTemplate.mockRejectedValueOnce(new Error('fail'));

          alertsService = new AlertsService({
            logger,
            elasticsearchClientPromise: Promise.resolve(clusterClient),
            pluginStop$,
            kibanaVersion: '8.8.0',
            dataStreamAdapter,
            elasticsearchAndSOAvailability$,
            isServerless: false,
          });
          alertsService.register(TestRegistrationContext);

          await retryUntil('error log called', async () => logger.error.mock.calls.length > 0);

          expect(alertsService.isInitialized()).toEqual(false);

          // Installing ILM policy failed so no calls to install context-specific resources
          // should be made
          expect(clusterClient.ilm.putLifecycle).toHaveBeenCalledTimes(
            useDataStreamForAlerts ? 0 : 1
          );
          expect(clusterClient.indices.putIndexTemplate).not.toHaveBeenCalled();
          expect(clusterClient.indices.getAlias).not.toHaveBeenCalled();
          expect(clusterClient.indices.putSettings).not.toHaveBeenCalled();
          expect(clusterClient.indices.create).not.toHaveBeenCalled();

          const result = await alertsService.createAlertsClient({
            alertingEventLogger,
            logger,
            request: fakeRequest,
            ruleType: ruleTypeWithAlertDefinition,
            maintenanceWindowsService,
            namespace: 'default',
            spaceId: 'default',
            rule: {
              muteAll: false,
              mutedInstanceIds: [],
              consumer: 'bar',
              executionId: '5f6aa57d-3e22-484e-bae8-cbed868f4d28',
              id: '1',
              name: 'rule-name',
              parameters: {
                bar: true,
              },
              revision: 0,
              spaceId: 'default',
              tags: ['rule-', '-tags'],
              alertDelay: 0,
            },
          });

          expect(clusterClient.ilm.putLifecycle).toHaveBeenCalledTimes(
            useDataStreamForAlerts ? 0 : 2
          );
          expect(clusterClient.indices.putIndexTemplate).toHaveBeenCalled();
          expect(clusterClient.indices.putSettings).toHaveBeenCalled();

          if (useDataStreamForAlerts) {
            expect(clusterClient.indices.createDataStream).not.toHaveBeenCalled();
            expect(clusterClient.indices.getDataStream).toHaveBeenCalled();
          } else {
            expect(clusterClient.indices.create).not.toHaveBeenCalled();
            expect(clusterClient.indices.getAlias).toHaveBeenCalled();
          }

          expect(AlertsClient).toHaveBeenCalledWith({
            alertingEventLogger,
            logger,
            elasticsearchClientPromise: Promise.resolve(clusterClient),
            dataStreamAdapter,
            request: fakeRequest,
            ruleType: ruleTypeWithAlertDefinition,
            maintenanceWindowsService,
            namespace: 'default',
            spaceId: 'default',
            isServerless: false,
            rule: {
              muteAll: false,
              mutedInstanceIds: [],
              consumer: 'bar',
              executionId: '5f6aa57d-3e22-484e-bae8-cbed868f4d28',
              id: '1',
              name: 'rule-name',
              parameters: {
                bar: true,
              },
              revision: 0,
              spaceId: 'default',
              tags: ['rule-', '-tags'],
              alertDelay: 0,
            },
            kibanaVersion: '8.8.0',
          });

          expect(result).not.toBe(null);
          expect(logger.info).toHaveBeenCalledWith(`Retrying common resource initialization`);
          expect(logger.info).toHaveBeenCalledWith(
            `Retrying resource initialization for context "test"`
          );
          expect(logger.info).toHaveBeenCalledWith(
            `Resource installation for "test" succeeded after retry`
          );
        });

        test('should not retry initializing common resources if common resource initialization is in progress', async () => {
          // this is the initial call that fails
          clusterClient.cluster.putComponentTemplate.mockRejectedValueOnce(new Error('fail'));

          // this is the retry call that we'll artificially inflate the duration of
          clusterClient.cluster.putComponentTemplate.mockImplementationOnce(async () => {
            await new Promise((r) => setTimeout(r, 1000));
            return { acknowledged: true };
          });

          alertsService = new AlertsService({
            logger,
            elasticsearchClientPromise: Promise.resolve(clusterClient),
            pluginStop$,
            kibanaVersion: '8.8.0',
            dataStreamAdapter,
            elasticsearchAndSOAvailability$,
            isServerless: false,
          });
          alertsService.register(TestRegistrationContext);

          await retryUntil('error log called', async () => logger.error.mock.calls.length > 0);

          expect(alertsService.isInitialized()).toEqual(false);

          // Installing ILM policy failed so no calls to install context-specific resources
          // should be made
          expect(clusterClient.ilm.putLifecycle).toHaveBeenCalledTimes(
            useDataStreamForAlerts ? 0 : 1
          );
          expect(clusterClient.indices.putIndexTemplate).not.toHaveBeenCalled();
          expect(clusterClient.indices.getAlias).not.toHaveBeenCalled();
          expect(clusterClient.indices.putSettings).not.toHaveBeenCalled();
          expect(clusterClient.indices.create).not.toHaveBeenCalled();

          // call createAlertsClient at the same time which will trigger the retries
          const result = await Promise.all([
            alertsService.createAlertsClient({
              alertingEventLogger,
              logger,
              request: fakeRequest,
              ruleType: ruleTypeWithAlertDefinition,
              maintenanceWindowsService,
              namespace: 'default',
              spaceId: 'default',
              rule: {
                muteAll: false,
                mutedInstanceIds: [],
                consumer: 'bar',
                executionId: '5f6aa57d-3e22-484e-bae8-cbed868f4d28',
                id: '1',
                name: 'rule-name',
                parameters: {
                  bar: true,
                },
                revision: 0,
                spaceId: 'default',
                tags: ['rule-', '-tags'],
                alertDelay: 0,
              },
            }),
            alertsService.createAlertsClient({
              alertingEventLogger,
              logger,
              request: fakeRequest,
              ruleType: ruleTypeWithAlertDefinition,
              maintenanceWindowsService,
              namespace: 'default',
              spaceId: 'default',
              rule: {
                muteAll: false,
                mutedInstanceIds: [],
                consumer: 'bar',
                executionId: '5f6aa57d-3e22-484e-bae8-cbed868f4d28',
                id: '1',
                name: 'rule-name',
                parameters: {
                  bar: true,
                },
                revision: 0,
                spaceId: 'default',
                tags: ['rule-', '-tags'],
                alertDelay: 0,
              },
            }),
          ]);

          expect(clusterClient.ilm.putLifecycle).toHaveBeenCalledTimes(
            useDataStreamForAlerts ? 0 : 2
          );
          expect(clusterClient.indices.putIndexTemplate).toHaveBeenCalled();
          expect(clusterClient.indices.putSettings).toHaveBeenCalled();

          if (useDataStreamForAlerts) {
            expect(clusterClient.indices.createDataStream).not.toHaveBeenCalled();
            expect(clusterClient.indices.getDataStream).toHaveBeenCalled();
          } else {
            expect(clusterClient.indices.create).not.toHaveBeenCalled();
            expect(clusterClient.indices.getAlias).toHaveBeenCalled();
          }
          expect(AlertsClient).toHaveBeenCalledWith({
            alertingEventLogger,
            logger,
            elasticsearchClientPromise: Promise.resolve(clusterClient),
            dataStreamAdapter,
            request: fakeRequest,
            ruleType: ruleTypeWithAlertDefinition,
            maintenanceWindowsService,
            namespace: 'default',
            spaceId: 'default',
            isServerless: false,
            rule: {
              muteAll: false,
              mutedInstanceIds: [],
              consumer: 'bar',
              executionId: '5f6aa57d-3e22-484e-bae8-cbed868f4d28',
              id: '1',
              name: 'rule-name',
              parameters: {
                bar: true,
              },
              revision: 0,
              spaceId: 'default',
              tags: ['rule-', '-tags'],
              alertDelay: 0,
            },
            kibanaVersion: '8.8.0',
          });

          expect(result[0]).not.toBe(null);
          expect(result[1]).not.toBe(null);
          expect(logger.info).toHaveBeenCalledWith(`Retrying common resource initialization`);
          expect(logger.info).toHaveBeenCalledWith(
            `Retrying resource initialization for context "test"`
          );
          expect(logger.info).toHaveBeenCalledWith(
            `Resource installation for "test" succeeded after retry`
          );
          expect(logger.info).toHaveBeenCalledWith(
            `Skipped retrying common resource initialization because it is already being retried.`
          );
        });

        test('should retry initializing context specific resources if context specific resource initialization failed', async () => {
          clusterClient.indices.simulateTemplate.mockImplementationOnce(async () => ({
            ...SimulateTemplateResponse,
            template: {
              ...SimulateTemplateResponse.template,
              mappings: {},
            },
          }));

          alertsService = new AlertsService({
            logger,
            elasticsearchClientPromise: Promise.resolve(clusterClient),
            pluginStop$,
            kibanaVersion: '8.8.0',
            dataStreamAdapter,
            elasticsearchAndSOAvailability$,
            isServerless: false,
          });
          alertsService.register(TestRegistrationContext);

          await retryUntil(
            'alert service initialized',
            async () => alertsService.isInitialized() === true
          );

          const result = await alertsService.createAlertsClient({
            alertingEventLogger,
            logger,
            request: fakeRequest,
            ruleType: ruleTypeWithAlertDefinition,
            maintenanceWindowsService,
            namespace: 'default',
            spaceId: 'default',
            rule: {
              muteAll: false,
              mutedInstanceIds: [],
              consumer: 'bar',
              executionId: '5f6aa57d-3e22-484e-bae8-cbed868f4d28',
              id: '1',
              name: 'rule-name',
              parameters: {
                bar: true,
              },
              revision: 0,
              spaceId: 'default',
              tags: ['rule-', '-tags'],
              alertDelay: 0,
            },
          });

          expect(AlertsClient).toHaveBeenCalledWith({
            alertingEventLogger,
            logger,
            elasticsearchClientPromise: Promise.resolve(clusterClient),
            dataStreamAdapter,
            request: fakeRequest,
            ruleType: ruleTypeWithAlertDefinition,
            maintenanceWindowsService,
            namespace: 'default',
            spaceId: 'default',
            isServerless: false,
            rule: {
              muteAll: false,
              mutedInstanceIds: [],
              consumer: 'bar',
              executionId: '5f6aa57d-3e22-484e-bae8-cbed868f4d28',
              id: '1',
              name: 'rule-name',
              parameters: {
                bar: true,
              },
              revision: 0,
              spaceId: 'default',
              tags: ['rule-', '-tags'],
              alertDelay: 0,
            },
            kibanaVersion: '8.8.0',
          });

          expect(result).not.toBe(null);
          expect(logger.info).not.toHaveBeenCalledWith(`Retrying common resource initialization`);
          expect(logger.info).toHaveBeenCalledWith(
            `Retrying resource initialization for context "test"`
          );
          expect(logger.info).toHaveBeenCalledWith(
            `Resource installation for "test" succeeded after retry`
          );
        });

        test('should not retry initializing context specific resources if context specific resource initialization is in progress', async () => {
          // this is the initial call that fails
          clusterClient.indices.simulateTemplate.mockImplementationOnce(async () => ({
            ...SimulateTemplateResponse,
            template: {
              ...SimulateTemplateResponse.template,
              mappings: {},
            },
          }));

          // this is the retry call that we'll artificially inflate the duration of
          clusterClient.indices.simulateTemplate.mockImplementationOnce(async () => {
            await new Promise((r) => setTimeout(r, 1000));
            return SimulateTemplateResponse;
          });

          alertsService = new AlertsService({
            logger,
            elasticsearchClientPromise: Promise.resolve(clusterClient),
            pluginStop$,
            kibanaVersion: '8.8.0',
            dataStreamAdapter,
            elasticsearchAndSOAvailability$,
            isServerless: false,
          });
          alertsService.register(TestRegistrationContext);

          await retryUntil(
            'alert service initialized',
            async () => alertsService.isInitialized() === true
          );

          const createAlertsClientWithDelay = async (delayMs: number | null) => {
            if (delayMs) {
              await new Promise((r) => setTimeout(r, delayMs));
            }

            return await alertsService.createAlertsClient({
              alertingEventLogger,
              logger,
              request: fakeRequest,
              ruleType: ruleTypeWithAlertDefinition,
              maintenanceWindowsService,
              namespace: 'default',
              spaceId: 'default',
              rule: {
                muteAll: false,
                mutedInstanceIds: [],
                consumer: 'bar',
                executionId: '5f6aa57d-3e22-484e-bae8-cbed868f4d28',
                id: '1',
                name: 'rule-name',
                parameters: {
                  bar: true,
                },
                revision: 0,
                spaceId: 'default',
                tags: ['rule-', '-tags'],
                alertDelay: 0,
              },
            });
          };

          const result = await Promise.all([
            createAlertsClientWithDelay(null),
            createAlertsClientWithDelay(1),
          ]);

          expect(AlertsClient).toHaveBeenCalledTimes(2);
          expect(AlertsClient).toHaveBeenCalledWith({
            alertingEventLogger,
            logger,
            elasticsearchClientPromise: Promise.resolve(clusterClient),
            dataStreamAdapter,
            request: fakeRequest,
            ruleType: ruleTypeWithAlertDefinition,
            maintenanceWindowsService,
            namespace: 'default',
            spaceId: 'default',
            isServerless: false,
            rule: {
              muteAll: false,
              mutedInstanceIds: [],
              consumer: 'bar',
              executionId: '5f6aa57d-3e22-484e-bae8-cbed868f4d28',
              id: '1',
              name: 'rule-name',
              parameters: {
                bar: true,
              },
              revision: 0,
              spaceId: 'default',
              tags: ['rule-', '-tags'],
              alertDelay: 0,
            },
            kibanaVersion: '8.8.0',
          });

          expect(result[0]).not.toBe(null);
          expect(result[1]).not.toBe(null);
          expect(logger.info).not.toHaveBeenCalledWith(`Retrying common resource initialization`);

          // Should only log the retry once because the second call should
          // leverage the outcome of the first retry
          expect(
            logger.info.mock.calls.filter(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (calls: any[]) => calls[0] === `Retrying resource initialization for context "test"`
            ).length
          ).toEqual(1);
          expect(
            logger.info.mock.calls.filter(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (calls: any[]) =>
                calls[0] === `Resource installation for "test" succeeded after retry`
            ).length
          ).toEqual(1);
        });

        test('should throttle retries of initializing context specific resources', async () => {
          // this is the initial call that fails
          clusterClient.indices.simulateTemplate.mockImplementation(async () => ({
            ...SimulateTemplateResponse,
            template: {
              ...SimulateTemplateResponse.template,
              mappings: {},
            },
          }));

          alertsService = new AlertsService({
            logger,
            elasticsearchClientPromise: Promise.resolve(clusterClient),
            pluginStop$,
            kibanaVersion: '8.8.0',
            dataStreamAdapter,
            elasticsearchAndSOAvailability$,
            isServerless: false,
          });
          alertsService.register(TestRegistrationContext);

          await retryUntil(
            'alert service initialized',
            async () => alertsService.isInitialized() === true
          );

          const createAlertsClientWithDelay = async (delayMs: number | null) => {
            if (delayMs) {
              await new Promise((r) => setTimeout(r, delayMs));
            }

            return await alertsService.createAlertsClient({
              alertingEventLogger,
              logger,
              request: fakeRequest,
              ruleType: ruleTypeWithAlertDefinition,
              maintenanceWindowsService,
              namespace: 'default',
              spaceId: 'default',
              rule: {
                muteAll: false,
                mutedInstanceIds: [],
                consumer: 'bar',
                executionId: '5f6aa57d-3e22-484e-bae8-cbed868f4d28',
                id: '1',
                name: 'rule-name',
                parameters: {
                  bar: true,
                },
                revision: 0,
                spaceId: 'default',
                tags: ['rule-', '-tags'],
                alertDelay: 0,
              },
            });
          };

          await Promise.all([
            createAlertsClientWithDelay(null),
            createAlertsClientWithDelay(1),
            createAlertsClientWithDelay(2),
          ]);

          expect(logger.info).not.toHaveBeenCalledWith(`Retrying common resource initialization`);

          // Should only log the retry once because the second and third retries should be throttled
          expect(
            logger.info.mock.calls.filter(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (calls: any[]) => calls[0] === `Retrying resource initialization for context "test"`
            ).length
          ).toEqual(1);
        });

        test('should return null if retrying common resources initialization fails again', async () => {
          let failCount = 0;
          clusterClient.cluster.putComponentTemplate.mockImplementation(() => {
            throw new Error(`fail ${++failCount}`);
          });

          alertsService = new AlertsService({
            logger,
            elasticsearchClientPromise: Promise.resolve(clusterClient),
            pluginStop$,
            kibanaVersion: '8.8.0',
            dataStreamAdapter,
            elasticsearchAndSOAvailability$,
            isServerless: false,
          });
          alertsService.register(TestRegistrationContext);

          await retryUntil('error log called', async () => logger.error.mock.calls.length > 0);

          expect(alertsService.isInitialized()).toEqual(false);

          // Installing ILM policy failed so no calls to install context-specific resources
          // should be made
          expect(clusterClient.ilm.putLifecycle).toHaveBeenCalledTimes(
            useDataStreamForAlerts ? 0 : 1
          );
          expect(clusterClient.indices.putIndexTemplate).not.toHaveBeenCalled();
          expect(clusterClient.indices.getAlias).not.toHaveBeenCalled();
          expect(clusterClient.indices.putSettings).not.toHaveBeenCalled();
          expect(clusterClient.indices.create).not.toHaveBeenCalled();

          const result = await alertsService.createAlertsClient({
            alertingEventLogger,
            logger,
            request: fakeRequest,
            ruleType: ruleTypeWithAlertDefinition,
            maintenanceWindowsService,
            namespace: 'default',
            spaceId: 'default',
            rule: {
              muteAll: false,
              mutedInstanceIds: [],
              consumer: 'bar',
              executionId: '5f6aa57d-3e22-484e-bae8-cbed868f4d28',
              id: '1',
              name: 'rule-name',
              parameters: {
                bar: true,
              },
              revision: 0,
              spaceId: 'default',
              tags: ['rule-', '-tags'],
              alertDelay: 0,
            },
          });

          expect(clusterClient.ilm.putLifecycle).toHaveBeenCalledTimes(
            useDataStreamForAlerts ? 0 : 2
          );
          expect(clusterClient.indices.putIndexTemplate).not.toHaveBeenCalled();
          expect(clusterClient.indices.getAlias).not.toHaveBeenCalled();
          expect(clusterClient.indices.putSettings).not.toHaveBeenCalled();
          expect(clusterClient.indices.create).not.toHaveBeenCalled();

          expect(result).toBe(null);
          expect(AlertsClient).not.toHaveBeenCalled();
          expect(logger.info).toHaveBeenCalledWith(`Retrying common resource initialization`);
          expect(logger.info).toHaveBeenCalledWith(
            `Retrying resource initialization for context "test"`
          );
          expect(logger.warn).toHaveBeenCalledWith(
            expect.stringMatching(
              /There was an error in the framework installing namespace-level resources and creating concrete indices for context "test" - Original error: Failure during installation\. fail \d+; Error after retry: Failure during installation\. fail \d+/
            )
          );
        });

        test('should return null if retrying common resources initialization fails again with same error', async () => {
          clusterClient.cluster.putComponentTemplate.mockRejectedValue(new Error('fail'));

          alertsService = new AlertsService({
            logger,
            elasticsearchClientPromise: Promise.resolve(clusterClient),
            pluginStop$,
            kibanaVersion: '8.8.0',
            dataStreamAdapter,
            elasticsearchAndSOAvailability$,
            isServerless: false,
          });
          alertsService.register(TestRegistrationContext);

          await retryUntil('error log called', async () => logger.error.mock.calls.length > 0);

          expect(alertsService.isInitialized()).toEqual(false);

          // Installing component template failed so no calls to install context-specific resources
          // should be made
          expect(clusterClient.ilm.putLifecycle).toHaveBeenCalledTimes(
            useDataStreamForAlerts ? 0 : 1
          );
          expect(clusterClient.indices.putIndexTemplate).not.toHaveBeenCalled();
          expect(clusterClient.indices.getAlias).not.toHaveBeenCalled();
          expect(clusterClient.indices.putSettings).not.toHaveBeenCalled();
          expect(clusterClient.indices.create).not.toHaveBeenCalled();

          const result = await alertsService.createAlertsClient({
            alertingEventLogger,
            logger,
            request: fakeRequest,
            ruleType: ruleTypeWithAlertDefinition,
            maintenanceWindowsService,
            namespace: 'default',
            spaceId: 'default',
            rule: {
              muteAll: false,
              mutedInstanceIds: [],
              consumer: 'bar',
              executionId: '5f6aa57d-3e22-484e-bae8-cbed868f4d28',
              id: '1',
              name: 'rule-name',
              parameters: {
                bar: true,
              },
              revision: 0,
              spaceId: 'default',
              tags: ['rule-', '-tags'],
              alertDelay: 0,
            },
          });

          expect(clusterClient.ilm.putLifecycle).toHaveBeenCalledTimes(
            useDataStreamForAlerts ? 0 : 2
          );
          expect(clusterClient.indices.putIndexTemplate).not.toHaveBeenCalled();
          expect(clusterClient.indices.getAlias).not.toHaveBeenCalled();
          expect(clusterClient.indices.putSettings).not.toHaveBeenCalled();
          expect(clusterClient.indices.create).not.toHaveBeenCalled();

          expect(result).toBe(null);
          expect(AlertsClient).not.toHaveBeenCalled();
          expect(logger.info).toHaveBeenCalledWith(`Retrying common resource initialization`);
          expect(logger.info).toHaveBeenCalledWith(
            `Retrying resource initialization for context "test"`
          );
          expect(logger.warn).toHaveBeenCalledWith(
            `There was an error in the framework installing namespace-level resources and creating concrete indices for context "test" - Retry failed with error: Failure during installation. fail`
          );
        });

        test('should return null if retrying context specific initialization fails again', async () => {
          clusterClient.indices.simulateTemplate.mockImplementationOnce(async () => ({
            ...SimulateTemplateResponse,
            template: {
              ...SimulateTemplateResponse.template,
              mappings: {},
            },
          }));
          clusterClient.indices.putIndexTemplate.mockRejectedValueOnce(
            new Error('fail index template')
          );

          alertsService = new AlertsService({
            logger,
            elasticsearchClientPromise: Promise.resolve(clusterClient),
            pluginStop$,
            kibanaVersion: '8.8.0',
            dataStreamAdapter,
            elasticsearchAndSOAvailability$,
            isServerless: false,
          });
          alertsService.register(TestRegistrationContext);

          await retryUntil(
            'alert service initialized',
            async () => alertsService.isInitialized() === true
          );

          const result = await alertsService.createAlertsClient({
            alertingEventLogger,
            logger,
            request: fakeRequest,
            ruleType: ruleTypeWithAlertDefinition,
            maintenanceWindowsService,
            namespace: 'default',
            spaceId: 'default',
            rule: {
              muteAll: false,
              mutedInstanceIds: [],
              consumer: 'bar',
              executionId: '5f6aa57d-3e22-484e-bae8-cbed868f4d28',
              id: '1',
              name: 'rule-name',
              parameters: {
                bar: true,
              },
              revision: 0,
              spaceId: 'default',
              tags: ['rule-', '-tags'],
              alertDelay: 0,
            },
          });

          expect(AlertsClient).not.toHaveBeenCalled();
          expect(result).toBe(null);
          expect(logger.info).not.toHaveBeenCalledWith(`Retrying common resource initialization`);
          expect(logger.info).toHaveBeenCalledWith(
            `Retrying resource initialization for context "test"`
          );
          expect(logger.warn).toHaveBeenCalledWith(
            `There was an error in the framework installing namespace-level resources and creating concrete indices for context "test" - Original error: Failure during installation. No mappings would be generated for .alerts-test.alerts-default-index-template, possibly due to failed/misconfigured bootstrapping; Error after retry: Failure during installation. fail index template`
          );
        });
      });

      describe('retries', () => {
        test('should retry adding ILM policy for transient ES errors', async () => {
          if (useDataStreamForAlerts) return;

          clusterClient.ilm.putLifecycle
            .mockRejectedValueOnce(new EsErrors.ConnectionError('foo'))
            .mockRejectedValueOnce(new EsErrors.TimeoutError('timeout'))
            .mockResolvedValue({ acknowledged: true });
          const alertsService = new AlertsService({
            logger,
            elasticsearchClientPromise: Promise.resolve(clusterClient),
            pluginStop$,
            kibanaVersion: '8.8.0',
            dataStreamAdapter,
            elasticsearchAndSOAvailability$,
            isServerless: false,
          });

          await retryUntil(
            'alert service initialized',
            async () => alertsService.isInitialized() === true
          );
          expect(clusterClient.ilm.putLifecycle).toHaveBeenCalledTimes(3);
        });

        test('should retry adding component template for transient ES errors', async () => {
          clusterClient.cluster.putComponentTemplate
            .mockRejectedValueOnce(new EsErrors.ConnectionError('foo'))
            .mockRejectedValueOnce(new EsErrors.TimeoutError('timeout'))
            .mockResolvedValue({ acknowledged: true });
          const alertsService = new AlertsService({
            logger,
            elasticsearchClientPromise: Promise.resolve(clusterClient),
            pluginStop$,
            kibanaVersion: '8.8.0',
            dataStreamAdapter,
            elasticsearchAndSOAvailability$,
            isServerless: false,
          });

          await retryUntil(
            'alert service initialized',
            async () => alertsService.isInitialized() === true
          );
          expect(clusterClient.cluster.putComponentTemplate).toHaveBeenCalledTimes(5);
        });

        test('should retry updating index template for transient ES errors', async () => {
          clusterClient.indices.putIndexTemplate
            .mockRejectedValueOnce(new EsErrors.ConnectionError('foo'))
            .mockRejectedValueOnce(new EsErrors.TimeoutError('timeout'))
            .mockResolvedValue({ acknowledged: true });
          const alertsService = new AlertsService({
            logger,
            elasticsearchClientPromise: Promise.resolve(clusterClient),
            pluginStop$,
            kibanaVersion: '8.8.0',
            dataStreamAdapter,
            elasticsearchAndSOAvailability$,
            isServerless: false,
          });

          await retryUntil(
            'alert service initialized',
            async () => alertsService.isInitialized() === true
          );
          expect(alertsService.isInitialized()).toEqual(true);

          alertsService.register(TestRegistrationContext);
          await retryUntil(
            'context initialized',
            async () => (await getContextInitialized(alertsService)) === true
          );

          expect(clusterClient.indices.putIndexTemplate).toHaveBeenCalledTimes(3);
        });

        test('should retry updating index settings for existing indices for transient ES errors', async () => {
          clusterClient.indices.putSettings
            .mockRejectedValueOnce(new EsErrors.ConnectionError('foo'))
            .mockRejectedValueOnce(new EsErrors.TimeoutError('timeout'))
            .mockResolvedValue({ acknowledged: true });
          const alertsService = new AlertsService({
            logger,
            elasticsearchClientPromise: Promise.resolve(clusterClient),
            pluginStop$,
            kibanaVersion: '8.8.0',
            dataStreamAdapter,
            elasticsearchAndSOAvailability$,
            isServerless: false,
          });

          await retryUntil(
            'alert service initialized',
            async () => alertsService.isInitialized() === true
          );

          alertsService.register(TestRegistrationContext);
          await retryUntil(
            'context initialized',
            async () => (await getContextInitialized(alertsService)) === true
          );

          expect(clusterClient.indices.putSettings).toHaveBeenCalledTimes(3);
        });

        test('should retry updating index mappings for existing indices for transient ES errors', async () => {
          clusterClient.indices.putMapping
            .mockRejectedValueOnce(new EsErrors.ConnectionError('foo'))
            .mockRejectedValueOnce(new EsErrors.TimeoutError('timeout'))
            .mockResolvedValue({ acknowledged: true });
          const alertsService = new AlertsService({
            logger,
            elasticsearchClientPromise: Promise.resolve(clusterClient),
            pluginStop$,
            kibanaVersion: '8.8.0',
            dataStreamAdapter,
            elasticsearchAndSOAvailability$,
            isServerless: false,
          });

          await retryUntil(
            'alert service initialized',
            async () => alertsService.isInitialized() === true
          );

          alertsService.register(TestRegistrationContext);
          await retryUntil(
            'context initialized',
            async () => (await getContextInitialized(alertsService)) === true
          );

          expect(clusterClient.indices.putMapping).toHaveBeenCalledTimes(3);
        });

        test('should retry creating concrete index for transient ES errors', async () => {
          clusterClient.indices.getDataStream.mockImplementationOnce(async () => ({
            data_streams: [],
          }));
          clusterClient.indices.getAlias.mockImplementationOnce(async () => ({}));
          clusterClient.indices.createDataStream
            .mockRejectedValueOnce(new EsErrors.ConnectionError('foo'))
            .mockRejectedValueOnce(new EsErrors.TimeoutError('timeout'))
            .mockResolvedValue({ acknowledged: true });
          clusterClient.indices.create
            .mockRejectedValueOnce(new EsErrors.ConnectionError('foo'))
            .mockRejectedValueOnce(new EsErrors.TimeoutError('timeout'))
            .mockResolvedValue({ index: 'index', shards_acknowledged: true, acknowledged: true });
          const alertsService = new AlertsService({
            logger,
            elasticsearchClientPromise: Promise.resolve(clusterClient),
            pluginStop$,
            kibanaVersion: '8.8.0',
            dataStreamAdapter,
            elasticsearchAndSOAvailability$,
            isServerless: false,
          });

          await retryUntil(
            'alert service initialized',
            async () => alertsService.isInitialized() === true
          );

          alertsService.register(TestRegistrationContext);
          await retryUntil(
            'context initialized',
            async () => (await getContextInitialized(alertsService)) === true
          );

          if (useDataStreamForAlerts) {
            expect(clusterClient.indices.createDataStream).toHaveBeenCalledTimes(3);
          } else {
            expect(clusterClient.indices.create).toHaveBeenCalledTimes(3);
          }
        });
      });

      describe('timeout', () => {
        test('should short circuit initialization if timeout exceeded', async () => {
          clusterClient.cluster.putComponentTemplate.mockImplementationOnce(async () => {
            await new Promise((resolve) => setTimeout(resolve, 20));
            return { acknowledged: true };
          });
          new AlertsService({
            logger,
            elasticsearchClientPromise: Promise.resolve(clusterClient),
            pluginStop$,
            kibanaVersion: '8.8.0',
            timeoutMs: 10,
            dataStreamAdapter,
            elasticsearchAndSOAvailability$,
            isServerless: false,
          });

          await retryUntil('error logger called', async () => logger.error.mock.calls.length > 0);

          expect(logger.error).toHaveBeenCalledWith(new Error(`Timeout: it took more than 10ms`));
        });

        test('should short circuit initialization if pluginStop$ signal received but not throw error', async () => {
          pluginStop$.next();
          new AlertsService({
            logger,
            elasticsearchClientPromise: Promise.resolve(clusterClient),
            pluginStop$,
            kibanaVersion: '8.8.0',
            timeoutMs: 10,
            dataStreamAdapter,
            elasticsearchAndSOAvailability$,
            isServerless: false,
          });

          await retryUntil('debug logger called', async () => logger.debug.mock.calls.length > 0);

          expect(logger.debug).toHaveBeenCalledWith(
            `Server is stopping; must stop all async operations`
          );
        });
      });

      describe('muteAlertInstance', () => {
        test('should throw an error if no indices are provided', async () => {
          const alertsService = new AlertsService({
            logger,
            elasticsearchClientPromise: Promise.resolve(clusterClient),
            pluginStop$,
            kibanaVersion: '8.8.0',
            dataStreamAdapter,
            elasticsearchAndSOAvailability$,
            isServerless: false,
          });

          await expect(
            alertsService.muteAlertInstance({
              ruleId: 'rule-1',
              alertInstanceId: 'alert-1',
              indices: [],
              logger,
            })
          ).rejects.toThrowErrorMatchingInlineSnapshot(
            `"Unable to update mute state for rules (example: {\\"ruleId\\":\\"rule-1\\",\\"alertInstanceIds\\":[\\"alert-1\\"]}) - no alert indices available"`
          );
        });

        test('should call updateByQuery with the correct parameters', async () => {
          const alertsService = new AlertsService({
            logger,
            elasticsearchClientPromise: Promise.resolve(clusterClient),
            pluginStop$,
            kibanaVersion: '8.8.0',
            dataStreamAdapter,
            elasticsearchAndSOAvailability$,
            isServerless: false,
          });

          await alertsService.muteAlertInstance({
            ruleId: 'rule-1',
            alertInstanceId: 'alert-1',
            indices: ['.alerts-default'],
            logger,
          });

          expect(clusterClient.updateByQuery).toHaveBeenCalledWith({
            index: ['.alerts-default'],
            conflicts: 'proceed',
            wait_for_completion: false,
            refresh: true,
            ignore_unavailable: true,
            query: {
              bool: {
                minimum_should_match: 1,
                must: [{ term: { 'kibana.alert.status': 'active' } }],
                should: [
                  {
                    bool: {
                      must: [
                        { term: { 'kibana.alert.rule.uuid': 'rule-1' } },
                        { terms: { 'kibana.alert.instance.id': ['alert-1'] } },
                      ],
                    },
                  },
                ],
              },
            },
            script: {
              source: `ctx._source['kibana.alert.muted'] = params.muted;`,
              lang: 'painless',
              params: { muted: true },
            },
          });
        });

        test('should re-throw an error if updateByQuery fails', async () => {
          clusterClient.updateByQuery.mockRejectedValueOnce(new Error('ES connection failed'));
          const alertsService = new AlertsService({
            logger,
            elasticsearchClientPromise: Promise.resolve(clusterClient),
            pluginStop$,
            kibanaVersion: '8.8.0',
            dataStreamAdapter,
            elasticsearchAndSOAvailability$,
            isServerless: false,
          });

          await expect(
            alertsService.muteAlertInstance({
              ruleId: 'rule-1',
              alertInstanceId: 'alert-1',
              indices: ['.alerts-default'],
              logger,
            })
          ).rejects.toThrowErrorMatchingInlineSnapshot(`"ES connection failed"`);
        });
      });

      describe('unmuteAlertInstance', () => {
        test('should throw an error if no indices are provided', async () => {
          const alertsService = new AlertsService({
            logger,
            elasticsearchClientPromise: Promise.resolve(clusterClient),
            pluginStop$,
            kibanaVersion: '8.8.0',
            dataStreamAdapter,
            elasticsearchAndSOAvailability$,
            isServerless: false,
          });

          await expect(
            alertsService.unmuteAlertInstance({
              ruleId: 'rule-1',
              alertInstanceId: 'alert-1',
              indices: [],
              logger,
            })
          ).rejects.toThrowErrorMatchingInlineSnapshot(
            `"Unable to update mute state for rules (example: {\\"ruleId\\":\\"rule-1\\",\\"alertInstanceIds\\":[\\"alert-1\\"]}) - no alert indices available"`
          );
        });

        test('should call updateByQuery with the correct parameters', async () => {
          const alertsService = new AlertsService({
            logger,
            elasticsearchClientPromise: Promise.resolve(clusterClient),
            pluginStop$,
            kibanaVersion: '8.8.0',
            dataStreamAdapter,
            elasticsearchAndSOAvailability$,
            isServerless: false,
          });

          await alertsService.unmuteAlertInstance({
            ruleId: 'rule-1',
            alertInstanceId: 'alert-1',
            indices: ['.alerts-default'],
            logger,
          });

          expect(clusterClient.updateByQuery).toHaveBeenCalledWith({
            index: ['.alerts-default'],
            conflicts: 'proceed',
            wait_for_completion: false,
            refresh: true,
            ignore_unavailable: true,
            query: {
              bool: {
                minimum_should_match: 1,
                must: [{ term: { 'kibana.alert.status': 'active' } }],
                should: [
                  {
                    bool: {
                      must: [
                        { term: { 'kibana.alert.rule.uuid': 'rule-1' } },
                        { terms: { 'kibana.alert.instance.id': ['alert-1'] } },
                      ],
                    },
                  },
                ],
              },
            },
            script: {
              source: `ctx._source['kibana.alert.muted'] = params.muted;`,
              lang: 'painless',
              params: { muted: false },
            },
          });
        });

        test('should re-throw an error if updateByQuery fails', async () => {
          clusterClient.updateByQuery.mockRejectedValueOnce(new Error('ES connection failed'));
          const alertsService = new AlertsService({
            logger,
            elasticsearchClientPromise: Promise.resolve(clusterClient),
            pluginStop$,
            kibanaVersion: '8.8.0',
            dataStreamAdapter,
            elasticsearchAndSOAvailability$,
            isServerless: false,
          });

          await expect(
            alertsService.unmuteAlertInstance({
              ruleId: 'rule-1',
              alertInstanceId: 'alert-1',
              indices: ['.alerts-default'],
              logger,
            })
          ).rejects.toThrowErrorMatchingInlineSnapshot(`"ES connection failed"`);
        });
      });

      describe('muteAllAlerts', () => {
        test('should throw an error if no indices are provided', async () => {
          const alertsService = new AlertsService({
            logger,
            elasticsearchClientPromise: Promise.resolve(clusterClient),
            pluginStop$,
            kibanaVersion: '8.8.0',
            dataStreamAdapter,
            elasticsearchAndSOAvailability$,
            isServerless: false,
          });

          await expect(
            alertsService.muteAllAlerts({
              ruleId: 'rule-1',
              indices: [],
              logger,
            })
          ).rejects.toThrowErrorMatchingInlineSnapshot(
            `"Unable to update mute state for rules (example: {\\"ruleId\\":\\"rule-1\\"}) - no alert indices available"`
          );
        });

        test('should call updateByQuery with the correct parameters', async () => {
          const alertsService = new AlertsService({
            logger,
            elasticsearchClientPromise: Promise.resolve(clusterClient),
            pluginStop$,
            kibanaVersion: '8.8.0',
            dataStreamAdapter,
            elasticsearchAndSOAvailability$,
            isServerless: false,
          });

          await alertsService.muteAllAlerts({
            ruleId: 'rule-1',
            indices: ['.alerts-default'],
            logger,
          });

          expect(clusterClient.updateByQuery).toHaveBeenCalledWith({
            index: ['.alerts-default'],
            conflicts: 'proceed',
            wait_for_completion: false,
            refresh: true,
            ignore_unavailable: true,
            query: {
              bool: {
                minimum_should_match: 1,
                must: [{ term: { 'kibana.alert.status': 'active' } }],
                should: [
                  {
                    bool: {
                      must: [{ term: { 'kibana.alert.rule.uuid': 'rule-1' } }],
                    },
                  },
                ],
              },
            },
            script: {
              source: `ctx._source['kibana.alert.muted'] = params.muted;`,
              lang: 'painless',
              params: { muted: true },
            },
          });
        });

        test('should re-throw an error if updateByQuery fails', async () => {
          clusterClient.updateByQuery.mockRejectedValueOnce(new Error('ES connection failed'));
          const alertsService = new AlertsService({
            logger,
            elasticsearchClientPromise: Promise.resolve(clusterClient),
            pluginStop$,
            kibanaVersion: '8.8.0',
            dataStreamAdapter,
            elasticsearchAndSOAvailability$,
            isServerless: false,
          });

          await expect(
            alertsService.muteAllAlerts({
              ruleId: 'rule-1',
              indices: ['.alerts-default'],
              logger,
            })
          ).rejects.toThrowErrorMatchingInlineSnapshot(`"ES connection failed"`);
        });
      });

      describe('unmuteAllAlerts', () => {
        test('should throw an error if no indices are provided', async () => {
          const alertsService = new AlertsService({
            logger,
            elasticsearchClientPromise: Promise.resolve(clusterClient),
            pluginStop$,
            kibanaVersion: '8.8.0',
            dataStreamAdapter,
            elasticsearchAndSOAvailability$,
            isServerless: false,
          });

          await expect(
            alertsService.unmuteAllAlerts({
              ruleId: 'rule-1',
              indices: [],
              logger,
            })
          ).rejects.toThrowErrorMatchingInlineSnapshot(
            `"Unable to update mute state for rules (example: {\\"ruleId\\":\\"rule-1\\"}) - no alert indices available"`
          );
        });

        test('should call updateByQuery with the correct parameters', async () => {
          const alertsService = new AlertsService({
            logger,
            elasticsearchClientPromise: Promise.resolve(clusterClient),
            pluginStop$,
            kibanaVersion: '8.8.0',
            dataStreamAdapter,
            elasticsearchAndSOAvailability$,
            isServerless: false,
          });

          await alertsService.unmuteAllAlerts({
            ruleId: 'rule-1',
            indices: ['.alerts-default'],
            logger,
          });

          expect(clusterClient.updateByQuery).toHaveBeenCalledWith({
            index: ['.alerts-default'],
            conflicts: 'proceed',
            wait_for_completion: false,
            refresh: true,
            ignore_unavailable: true,
            query: {
              bool: {
                minimum_should_match: 1,
                must: [{ term: { 'kibana.alert.status': 'active' } }],
                should: [
                  {
                    bool: {
                      must: [{ term: { 'kibana.alert.rule.uuid': 'rule-1' } }],
                    },
                  },
                ],
              },
            },
            script: {
              source: `ctx._source['kibana.alert.muted'] = params.muted;`,
              lang: 'painless',
              params: { muted: false },
            },
          });
        });

        test('should re-throw an error if updateByQuery fails', async () => {
          clusterClient.updateByQuery.mockRejectedValueOnce(new Error('ES connection failed'));
          const alertsService = new AlertsService({
            logger,
            elasticsearchClientPromise: Promise.resolve(clusterClient),
            pluginStop$,
            kibanaVersion: '8.8.0',
            dataStreamAdapter,
            elasticsearchAndSOAvailability$,
            isServerless: false,
          });

          await expect(
            alertsService.unmuteAllAlerts({
              ruleId: 'rule-1',
              indices: ['.alerts-default'],
              logger,
            })
          ).rejects.toThrowErrorMatchingInlineSnapshot(`"ES connection failed"`);
        });
      });

      describe('getAlertSnoozeSnapshot', () => {
        test('should fetch and return the requested snapshot fields', async () => {
          clusterClient.search.mockResponseOnce({
            hits: {
              total: 1,
              hits: [
                {
                  _index: '.alerts-default',
                  _id: 'alert-1',
                  _source: {
                    'host.name': 'web-01',
                    'kibana.alert.severity': 'high',
                  },
                },
              ],
            },
            took: 0,
            timed_out: false,
            _shards: { total: 0, successful: 0, skipped: 0, failed: 0 },
          });

          const alertsService = new AlertsService({
            logger,
            elasticsearchClientPromise: Promise.resolve(clusterClient),
            pluginStop$,
            kibanaVersion: '8.8.0',
            dataStreamAdapter,
            elasticsearchAndSOAvailability$,
            isServerless: false,
          });

          const result = await alertsService.getAlertSnoozeSnapshot({
            indices: ['.alerts-default'],
            alertId: 'alert-1',
            ruleId: 'rule-1',
            fields: ['host.name', 'kibana.alert.severity'],
          });

          expect(result).toEqual({
            'host.name': 'web-01',
            'kibana.alert.severity': 'high',
          });
          expect(clusterClient.search).toHaveBeenCalledWith({
            index: ['.alerts-default'],
            allow_no_indices: true,
            size: 1,
            _source: ['host.name', 'kibana.alert.severity'],
            query: {
              bool: {
                must: [
                  { term: { 'kibana.alert.rule.uuid': 'rule-1' } },
                  { term: { 'kibana.alert.status': 'active' } },
                ],
                filter: [{ term: { 'kibana.alert.instance.id': 'alert-1' } }],
              },
            },
          });
        });
      });

      describe('muteAlertInstances', () => {
        test('should throw an error if no indices are provided', async () => {
          const alertsService = new AlertsService({
            logger,
            elasticsearchClientPromise: Promise.resolve(clusterClient),
            pluginStop$,
            kibanaVersion: '8.8.0',
            dataStreamAdapter,
            elasticsearchAndSOAvailability$,
            isServerless: false,
          });

          await expect(
            alertsService.muteAlertInstances({
              targets: [{ ruleId: 'rule-1', alertInstanceIds: ['alert-1'] }],
              indices: [],
              logger,
            })
          ).rejects.toThrowErrorMatchingInlineSnapshot(
            `"Unable to update mute state for rules (example: {\\"ruleId\\":\\"rule-1\\",\\"alertInstanceIds\\":[\\"alert-1\\"]}) - no alert indices available"`
          );
        });

        test('should call updateByQuery with the correct parameters', async () => {
          const alertsService = new AlertsService({
            logger,
            elasticsearchClientPromise: Promise.resolve(clusterClient),
            pluginStop$,
            kibanaVersion: '8.8.0',
            dataStreamAdapter,
            elasticsearchAndSOAvailability$,
            isServerless: false,
          });

          await alertsService.muteAlertInstances({
            targets: [
              { ruleId: 'rule-1', alertInstanceIds: ['alert-1-1', 'alert-1-2'] },
              { ruleId: 'rule-2', alertInstanceIds: ['alert-2'] },
            ],
            indices: ['.alerts-default'],
            logger,
          });

          expect(clusterClient.updateByQuery).toHaveBeenCalledWith({
            index: ['.alerts-default'],
            conflicts: 'proceed',
            wait_for_completion: false,
            refresh: true,
            ignore_unavailable: true,
            query: {
              bool: {
                minimum_should_match: 1,
                must: [{ term: { 'kibana.alert.status': 'active' } }],
                should: [
                  {
                    bool: {
                      must: [
                        { term: { 'kibana.alert.rule.uuid': 'rule-1' } },
                        { terms: { 'kibana.alert.instance.id': ['alert-1-1', 'alert-1-2'] } },
                      ],
                    },
                  },
                  {
                    bool: {
                      must: [
                        { term: { 'kibana.alert.rule.uuid': 'rule-2' } },
                        { terms: { 'kibana.alert.instance.id': ['alert-2'] } },
                      ],
                    },
                  },
                ],
              },
            },
            script: {
              source: `ctx._source['kibana.alert.muted'] = params.muted;`,
              lang: 'painless',
              params: { muted: true },
            },
          });
        });

        test('should re-throw an error if updateByQuery fails', async () => {
          clusterClient.updateByQuery.mockRejectedValueOnce(new Error('ES connection failed'));
          const alertsService = new AlertsService({
            logger,
            elasticsearchClientPromise: Promise.resolve(clusterClient),
            pluginStop$,
            kibanaVersion: '8.8.0',
            dataStreamAdapter,
            elasticsearchAndSOAvailability$,
            isServerless: false,
          });

          await expect(
            alertsService.muteAlertInstances({
              targets: [{ ruleId: 'rule-1', alertInstanceIds: ['alert-1'] }],
              indices: ['.alerts-default'],
              logger,
            })
          ).rejects.toThrowErrorMatchingInlineSnapshot(`"ES connection failed"`);
        });
      });

      describe('unmuteAlertInstances', () => {
        test('should throw an error if no indices are provided', async () => {
          const alertsService = new AlertsService({
            logger,
            elasticsearchClientPromise: Promise.resolve(clusterClient),
            pluginStop$,
            kibanaVersion: '8.8.0',
            dataStreamAdapter,
            elasticsearchAndSOAvailability$,
            isServerless: false,
          });

          await expect(
            alertsService.unmuteAlertInstances({
              targets: [{ ruleId: 'rule-1', alertInstanceIds: ['alert-1'] }],
              indices: [],
              logger,
            })
          ).rejects.toThrowErrorMatchingInlineSnapshot(
            `"Unable to update mute state for rules (example: {\\"ruleId\\":\\"rule-1\\",\\"alertInstanceIds\\":[\\"alert-1\\"]}) - no alert indices available"`
          );
        });

        test('should call updateByQuery with the correct parameters', async () => {
          const alertsService = new AlertsService({
            logger,
            elasticsearchClientPromise: Promise.resolve(clusterClient),
            pluginStop$,
            kibanaVersion: '8.8.0',
            dataStreamAdapter,
            elasticsearchAndSOAvailability$,
            isServerless: false,
          });

          await alertsService.unmuteAlertInstances({
            targets: [
              { ruleId: 'rule-1', alertInstanceIds: ['alert-1-1', 'alert-1-2'] },
              { ruleId: 'rule-2', alertInstanceIds: ['alert-2'] },
            ],
            indices: ['.alerts-default'],
            logger,
          });

          expect(clusterClient.updateByQuery).toHaveBeenCalledWith({
            index: ['.alerts-default'],
            conflicts: 'proceed',
            wait_for_completion: false,
            refresh: true,
            ignore_unavailable: true,
            query: {
              bool: {
                minimum_should_match: 1,
                must: [{ term: { 'kibana.alert.status': 'active' } }],
                should: [
                  {
                    bool: {
                      must: [
                        { term: { 'kibana.alert.rule.uuid': 'rule-1' } },
                        { terms: { 'kibana.alert.instance.id': ['alert-1-1', 'alert-1-2'] } },
                      ],
                    },
                  },
                  {
                    bool: {
                      must: [
                        { term: { 'kibana.alert.rule.uuid': 'rule-2' } },
                        { terms: { 'kibana.alert.instance.id': ['alert-2'] } },
                      ],
                    },
                  },
                ],
              },
            },
            script: {
              source: `ctx._source['kibana.alert.muted'] = params.muted;`,
              lang: 'painless',
              params: { muted: false },
            },
          });
        });

        test('should re-throw an error if updateByQuery fails', async () => {
          clusterClient.updateByQuery.mockRejectedValueOnce(new Error('ES connection failed'));
          const alertsService = new AlertsService({
            logger,
            elasticsearchClientPromise: Promise.resolve(clusterClient),
            pluginStop$,
            kibanaVersion: '8.8.0',
            dataStreamAdapter,
            elasticsearchAndSOAvailability$,
            isServerless: false,
          });

          await expect(
            alertsService.unmuteAlertInstances({
              targets: [{ ruleId: 'rule-1', alertInstanceIds: ['alert-1'] }],
              indices: ['.alerts-default'],
              logger,
            })
          ).rejects.toThrowErrorMatchingInlineSnapshot(`"ES connection failed"`);
        });
      });
    });
  }
});
