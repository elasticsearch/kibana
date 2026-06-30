/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SavedObject, SavedObjectsClientContract } from '@kbn/core/server';
import { loggerMock } from '@kbn/logging-mocks';

import { savedObjectsClientMock, httpServerMock } from '@kbn/core/server/mocks';
import { elasticsearchClientMock } from '@kbn/core-elasticsearch-client-server-mocks';

import { getInstallation, getInstallationObject } from '../../packages';
import type { Installation } from '../../../../types';
import { ElasticsearchAssetType } from '../../../../types';
import { appContextService } from '../../../app_context';

import { PACKAGES_SAVED_OBJECT_TYPE } from '../../../../constants';

import { getESAssetMetadata } from '../meta';

import { createArchiveIteratorFromMap } from '../../archive/archive_iterator';
import { createAppContextStartContractMock } from '../../../../mocks';
import type { PackageInstallContext } from '../../../../../common/types';

import {
  installTransforms,
  isRemoteIndexExpression,
  removeRemoteClusterSourceIndicesOnServerless,
} from './install';

jest.mock('../../packages/get', () => {
  return { getInstallation: jest.fn(), getInstallationObject: jest.fn() };
});

const meta = getESAssetMetadata({ packageName: 'endpoint' });

describe('test transform install', () => {
  let esClient: ReturnType<typeof elasticsearchClientMock.createElasticsearchClient>;
  let savedObjectsClient: jest.Mocked<SavedObjectsClientContract>;

  const mockRequest = httpServerMock.createKibanaRequest();
  const getYamlTestData = (
    autoStart: boolean | undefined = undefined,
    transformVersion: string = '0.1.0'
  ) => {
    const start =
      autoStart === undefined
        ? ''
        : `
start: ${autoStart}`;
    return {
      MANIFEST:
        `destination_index_template:
  settings:
    index:
      codec: best_compression
      refresh_interval: 5s
      number_of_shards: 1
      number_of_routing_shards: 30
      hidden: true
  mappings:
    dynamic: false
    _meta: {}
    dynamic_templates:
      - strings_as_keyword:
          match_mapping_type: string
          mapping:
            ignore_above: 1024
            type: keyword
    date_detection: false` + start,
      TRANSFORM: `source:
  index:
    - metrics-endpoint.metadata_current_default*
    - ".fleet-agents*"
dest:
  index: ".metrics-endpoint.metadata_united_default"
frequency: 1s
sync:
  time:
    delay: 4s
    field: updated_at
pivot:
  aggs:
    united:
      scripted_metric:
        init_script: state.docs = []
        map_script: state.docs.add(new HashMap(params['_source']))
        combine_script: return state.docs
        reduce_script: def ret = new HashMap(); for (s in states) { for (d in s) { if (d.containsKey('Endpoint')) { ret.endpoint = d } else { ret.agent = d } }} return ret
  group_by:
    agent.id:
      terms:
        field: agent.id
description: Merges latest endpoint and Agent metadata documents.
_meta:
  fleet_transform_version: ${transformVersion}
  managed: true`,
      FIELDS: `- name: '@timestamp'
  type: date
- name: updated_at
  type: alias
  path: event.ingested
- external: ecs
  name: ecs.version
- external: ecs
  name: message`,
      BEATS_FIELDS: `- name: input.type
  type: keyword
  description: Type of Filebeat input.
- name: log.flags
  type: keyword
  description: Flags for the log file.
- name: log.offset
  type: long
  description: Offset of the entry in the log file.
- name: log.file.path
  type: keyword
  description: Path to the log file.`,
      AGENT_FIELDS: `- name: instance.name
  level: extended
  type: keyword
  ignore_above: 1024
  description: Instance name of the host machine.
- name: machine.type
  level: extended
  type: keyword
  ignore_above: 1024
  description: Machine type of the host machine.
  example: t2.medium`,
    };
  };
  const getExpectedData = (transformVersion: string) => {
    return {
      TRANSFORM: {
        transform_id: `logs-endpoint.metadata_current-default-${transformVersion}`,
        defer_validation: true,
        description: 'Merges latest endpoint and Agent metadata documents.',
        dest: {
          index: '.metrics-endpoint.metadata_united_default',
          aliases: [],
        },
        frequency: '1s',
        pivot: {
          aggs: {
            united: {
              scripted_metric: {
                combine_script: 'return state.docs',
                init_script: 'state.docs = []',
                map_script: "state.docs.add(new HashMap(params['_source']))",
                reduce_script:
                  "def ret = new HashMap(); for (s in states) { for (d in s) { if (d.containsKey('Endpoint')) { ret.endpoint = d } else { ret.agent = d } }} return ret",
              },
            },
          },
          group_by: {
            'agent.id': {
              terms: {
                field: 'agent.id',
              },
            },
          },
        },
        source: {
          index: ['metrics-endpoint.metadata_current_default*', '.fleet-agents*'],
        },
        sync: {
          time: {
            delay: '4s',
            field: 'updated_at',
          },
        },
        _meta: { fleet_transform_version: transformVersion, ...meta, run_as_kibana_system: true },
      },
    };
  };

  beforeEach(() => {
    appContextService.start(createAppContextStartContractMock());
    esClient = elasticsearchClientMock.createClusterClient().asInternalUser;
    (getInstallation as jest.MockedFunction<typeof getInstallation>).mockReset();
    (getInstallationObject as jest.MockedFunction<typeof getInstallationObject>).mockReset();
    savedObjectsClient = savedObjectsClientMock.create();
    savedObjectsClient.update.mockImplementation(async (type, id, attributes) => ({
      type: PACKAGES_SAVED_OBJECT_TYPE,
      id: 'endpoint',
      attributes,
      references: [],
    }));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('can install new versions and removes older version when fleet_transform_version increased', async () => {
    // Old fleet_transform_version is 0.1.0, fleet_transform_version to be installed is 0.1.0
    const sourceData = getYamlTestData(undefined, '0.2.0');
    const expectedData = getExpectedData('0.2.0');

    const previousInstallation: Installation = {
      installed_es: [
        {
          id: 'metrics-endpoint.policy-0.16.0-dev.0',
          type: ElasticsearchAssetType.ingestPipeline,
        },
        {
          id: 'logs-endpoint.metadata_current-default-0.1.0',
          type: ElasticsearchAssetType.transform,
        },
      ],
    } as unknown as Installation;

    const currentInstallation: Installation = {
      installed_es: [
        {
          id: 'metrics-endpoint.policy-0.16.0-dev.0',
          type: ElasticsearchAssetType.ingestPipeline,
        },
        {
          id: 'logs-endpoint.metadata_current-default-0.2.0',
          type: ElasticsearchAssetType.transform,
        },
        {
          id: 'logs-endpoint.metadata_current-default-0.2.0',
          type: ElasticsearchAssetType.transform,
        },
      ],
    } as unknown as Installation;
    (getInstallation as jest.MockedFunction<typeof getInstallation>)
      .mockReturnValueOnce(Promise.resolve(previousInstallation))
      .mockReturnValueOnce(Promise.resolve(currentInstallation));

    (
      getInstallationObject as jest.MockedFunction<typeof getInstallationObject>
    ).mockReturnValueOnce(
      Promise.resolve({
        attributes: {
          installed_es: previousInstallation.installed_es,
        },
      } as unknown as SavedObject<Installation>)
    );

    // Mock transform from old version
    esClient.transform.getTransform.mockResponseOnce({
      count: 1,
      transforms: [
        // @ts-expect-error incomplete data
        {
          dest: {
            index: 'mock-old-destination-index',
          },
        },
      ],
    });

    await installTransforms({
      packageInstallContext: {
        packageInfo: {
          name: 'endpoint',
          version: '0.16.0-dev.0',
        },
        paths: [
          'endpoint-0.16.0-dev.0/elasticsearch/transform/metadata_current/fields/beats.yml',
          'endpoint-0.16.0-dev.0/elasticsearch/transform/metadata_current/fields/agent.yml',
          'endpoint-0.16.0-dev.0/elasticsearch/transform/metadata_current/fields/fields.yml',
          'endpoint-0.16.0-dev.0/elasticsearch/transform/metadata_current/manifest.yml',
          'endpoint-0.16.0-dev.0/elasticsearch/transform/metadata_current/transform.yml',
        ],
        archiveIterator: createArchiveIteratorFromMap(
          new Map([
            [
              'endpoint-0.16.0-dev.0/elasticsearch/transform/metadata_current/fields/beats.yml',
              Buffer.from(sourceData.BEATS_FIELDS),
            ],
            [
              'endpoint-0.16.0-dev.0/elasticsearch/transform/metadata_current/fields/agent.yml',
              Buffer.from(sourceData.AGENT_FIELDS),
            ],
            [
              'endpoint-0.16.0-dev.0/elasticsearch/transform/metadata_current/fields/fields.yml',
              Buffer.from(sourceData.FIELDS),
            ],
            [
              'endpoint-0.16.0-dev.0/elasticsearch/transform/metadata_current/manifest.yml',
              Buffer.from(sourceData.MANIFEST),
            ],
            [
              'endpoint-0.16.0-dev.0/elasticsearch/transform/metadata_current/transform.yml',
              Buffer.from(sourceData.TRANSFORM),
            ],
          ])
        ),
      } as unknown as PackageInstallContext,
      esClient,
      savedObjectsClient,
      logger: loggerMock.create(),
      esReferences: previousInstallation.installed_es,
    });

    // Stop and delete previously installed transforms
    expect(esClient.transform.stopTransform.mock.calls).toEqual([
      [
        {
          transform_id: 'logs-endpoint.metadata_current-default-0.1.0',
          force: true,
        },
        { ignore: [404] },
      ],
    ]);
    expect(esClient.transform.deleteTransform.mock.calls).toEqual([
      [
        {
          transform_id: 'logs-endpoint.metadata_current-default-0.1.0',
          force: true,
          delete_dest_index: false,
        },
        { ignore: [404] },
      ],
    ]);

    // Destination index should not be deleted when transform is deleted
    expect(esClient.transport.request.mock.calls).toEqual([]);

    // Create a @package component template and an empty @custom component template
    expect(esClient.cluster.putComponentTemplate.mock.calls).toEqual([
      [
        {
          name: 'logs-endpoint.metadata_current-template@package',
          body: {
            template: {
              settings: {
                index: {
                  codec: 'best_compression',
                  refresh_interval: '5s',
                  number_of_shards: 1,
                  number_of_routing_shards: 30,
                  hidden: true,
                  mapping: { total_fields: { limit: 1000 } },
                },
              },
              mappings: {
                properties: {
                  input: { properties: { type: { type: 'keyword', ignore_above: 1024 } } },
                  log: {
                    properties: {
                      flags: { type: 'keyword', ignore_above: 1024 },
                      offset: { type: 'long' },
                      file: { properties: { path: { type: 'keyword', ignore_above: 1024 } } },
                    },
                  },
                  instance: { properties: { name: { type: 'keyword', ignore_above: 1024 } } },
                  machine: { properties: { type: { type: 'keyword', ignore_above: 1024 } } },
                  '@timestamp': { ignore_malformed: false, type: 'date' },
                  ecs: { properties: { version: { type: 'keyword', ignore_above: 1024 } } },
                  message: { type: 'keyword', ignore_above: 1024 },
                },
                dynamic_templates: [
                  {
                    strings_as_keyword: {
                      match_mapping_type: 'string',
                      mapping: { ignore_above: 1024, type: 'keyword' },
                    },
                  },
                ],
                dynamic: false,
                _meta: {},
                date_detection: false,
              },
            },
            _meta: { managed_by: 'fleet', managed: true, package: { name: 'endpoint' } },
          },
          create: false,
        },
        { ignore: [404] },
      ],
    ]);

    // Index template composed of the two component templates created
    // with index pattern matching the destination index
    expect(esClient.indices.putIndexTemplate.mock.calls).toEqual([
      [
        {
          _meta: meta,
          composed_of: [
            'logs-endpoint.metadata_current-template@package',
            'endpoint@custom',
            'logs-endpoint.metadata_current-template@custom',
            'ecs@mappings',
          ],
          index_patterns: ['.metrics-endpoint.metadata_united_default'],
          priority: 250,
          template: {
            mappings: undefined,
            settings: {
              index: {
                mapping: {
                  ignore_malformed: true,
                },
              },
            },
          },
          ignore_missing_component_templates: [
            'endpoint@custom',
            'logs-endpoint.metadata_current-template@custom',
          ],
          name: 'logs-endpoint.metadata_current-template',
        },
        { ignore: [404] },
      ],
    ]);

    // Destination index is not created before transform is created
    expect(esClient.indices.create.mock.calls).toEqual([]);

    expect(esClient.transform.putTransform.mock.calls).toEqual([
      [expectedData.TRANSFORM, { ignore: [409] }],
    ]);
    expect(esClient.transform.startTransform.mock.calls).toEqual([
      [
        {
          transform_id: 'logs-endpoint.metadata_current-default-0.2.0',
        },
        { ignore: [409] },
      ],
    ]);

    // Saved object is updated with newly created index templates, component templates, transform
    expect(savedObjectsClient.update.mock.calls).toEqual([
      [
        'epm-packages',
        'endpoint',
        {
          installed_es: [
            {
              id: 'metrics-endpoint.policy-0.16.0-dev.0',
              type: ElasticsearchAssetType.ingestPipeline,
            },
            {
              id: '.metrics-endpoint.metadata_united_default',
              type: ElasticsearchAssetType.index,
            },
            {
              id: 'logs-endpoint.metadata_current-template',
              type: ElasticsearchAssetType.indexTemplate,
              version: '0.2.0',
            },
            {
              id: 'logs-endpoint.metadata_current-template@custom',
              type: ElasticsearchAssetType.componentTemplate,
              version: '0.2.0',
            },
            {
              id: 'logs-endpoint.metadata_current-template@package',
              type: ElasticsearchAssetType.componentTemplate,
              version: '0.2.0',
            },
            {
              id: 'logs-endpoint.metadata_current-default-0.2.0',
              type: ElasticsearchAssetType.transform,
              version: '0.2.0',
            },
          ],
        },
        {
          refresh: false,
        },
      ],
      // After transforms are installed, es asset reference needs to be updated if they are deferred or not
      [
        'epm-packages',
        'endpoint',
        {
          installed_es: [
            {
              id: 'metrics-endpoint.policy-0.16.0-dev.0',
              type: ElasticsearchAssetType.ingestPipeline,
            },
            {
              id: '.metrics-endpoint.metadata_united_default',
              type: ElasticsearchAssetType.index,
            },
            {
              id: 'logs-endpoint.metadata_current-template',
              type: ElasticsearchAssetType.indexTemplate,
              version: '0.2.0',
            },
            {
              id: 'logs-endpoint.metadata_current-template@custom',
              type: ElasticsearchAssetType.componentTemplate,
              version: '0.2.0',
            },
            {
              id: 'logs-endpoint.metadata_current-template@package',
              type: ElasticsearchAssetType.componentTemplate,
              version: '0.2.0',
            },
            {
              // After transforms are installed, es asset reference needs to be updated if they are deferred or not
              deferred: false,
              id: 'logs-endpoint.metadata_current-default-0.2.0',
              type: ElasticsearchAssetType.transform,
              version: '0.2.0',
            },
          ],
        },
        {
          refresh: false,
        },
      ],
    ]);
  });

  test('can install new versions and removes older version when upgraded from old json schema to new yml schema', async () => {
    const sourceData = getYamlTestData(undefined, '0.2.0');
    const expectedData = getExpectedData('0.2.0');

    const previousInstallation: Installation = {
      installed_es: [
        {
          id: 'metrics-endpoint.policy-0.1.0-dev.0',
          type: ElasticsearchAssetType.ingestPipeline,
        },
        {
          id: 'endpoint.metadata_current-default-0.1.0',
          type: ElasticsearchAssetType.transform,
        },
      ],
    } as unknown as Installation;

    const currentInstallation: Installation = {
      installed_es: [
        {
          id: 'metrics-endpoint.policy-0.16.0-dev.0',
          type: ElasticsearchAssetType.ingestPipeline,
        },
        {
          id: 'logs-endpoint.metadata_current-default-0.2.0',
          type: ElasticsearchAssetType.transform,
        },
        {
          id: 'logs-endpoint.metadata_current-default-0.2.0',
          type: ElasticsearchAssetType.transform,
        },
      ],
    } as unknown as Installation;

    (getInstallation as jest.MockedFunction<typeof getInstallation>)
      .mockReturnValueOnce(Promise.resolve(previousInstallation))
      .mockReturnValueOnce(Promise.resolve(currentInstallation));

    (
      getInstallationObject as jest.MockedFunction<typeof getInstallationObject>
    ).mockReturnValueOnce(
      Promise.resolve({
        attributes: {
          installed_es: previousInstallation.installed_es,
        },
      } as unknown as SavedObject<Installation>)
    );

    // Mock transform from old version
    esClient.transform.getTransform.mockResponseOnce({
      count: 1,
      transforms: [
        // @ts-expect-error incomplete data
        {
          dest: {
            index: 'mock-old-destination-index',
          },
        },
      ],
    });

    await installTransforms({
      packageInstallContext: {
        packageInfo: {
          name: 'endpoint',
          version: '0.16.0-dev.0',
        },
        paths: [
          'endpoint-0.16.0-dev.0/elasticsearch/transform/metadata_current/fields/fields.yml',
          'endpoint-0.16.0-dev.0/elasticsearch/transform/metadata_current/manifest.yml',
          'endpoint-0.16.0-dev.0/elasticsearch/transform/metadata_current/transform.yml',
        ],
        archiveIterator: createArchiveIteratorFromMap(
          new Map([
            [
              'endpoint-0.16.0-dev.0/elasticsearch/transform/metadata_current/fields/fields.yml',
              Buffer.from(sourceData.FIELDS),
            ],
            [
              'endpoint-0.16.0-dev.0/elasticsearch/transform/metadata_current/manifest.yml',
              Buffer.from(sourceData.MANIFEST),
            ],
            [
              'endpoint-0.16.0-dev.0/elasticsearch/transform/metadata_current/transform.yml',
              Buffer.from(sourceData.TRANSFORM),
            ],
          ])
        ),
      } as unknown as PackageInstallContext,
      esClient,
      savedObjectsClient,
      logger: loggerMock.create(),
      esReferences: previousInstallation.installed_es,
    });

    // Stop and delete previously installed transforms
    expect(esClient.transform.stopTransform.mock.calls).toEqual([
      [
        {
          transform_id: 'endpoint.metadata_current-default-0.1.0',
          force: true,
        },
        { ignore: [404] },
      ],
    ]);
    expect(esClient.transform.deleteTransform.mock.calls).toEqual([
      [
        {
          transform_id: 'endpoint.metadata_current-default-0.1.0',
          force: true,
          delete_dest_index: true,
        },
        { ignore: [404] },
      ],
    ]);

    // Create a @package component template and an empty @custom component template
    expect(esClient.cluster.putComponentTemplate.mock.calls).toEqual([
      [
        {
          name: 'logs-endpoint.metadata_current-template@package',
          body: {
            template: {
              settings: {
                index: {
                  codec: 'best_compression',
                  refresh_interval: '5s',
                  number_of_shards: 1,
                  number_of_routing_shards: 30,
                  hidden: true,
                  mapping: { total_fields: { limit: 1000 } },
                },
              },
              mappings: {
                properties: {
                  '@timestamp': {
                    ignore_malformed: false,
                    type: 'date',
                  },
                  ecs: { properties: { version: { type: 'keyword', ignore_above: 1024 } } },
                  message: { type: 'keyword', ignore_above: 1024 },
                },
                dynamic_templates: [
                  {
                    strings_as_keyword: {
                      match_mapping_type: 'string',
                      mapping: { ignore_above: 1024, type: 'keyword' },
                    },
                  },
                ],
                dynamic: false,
                _meta: {},
                date_detection: false,
              },
            },
            _meta: { managed_by: 'fleet', managed: true, package: { name: 'endpoint' } },
          },
          create: false,
        },
        { ignore: [404] },
      ],
    ]);

    // Index template composed of the two component templates created
    // with index pattern matching the destination index
    expect(esClient.indices.putIndexTemplate.mock.calls).toEqual([
      [
        {
          _meta: meta,
          composed_of: [
            'logs-endpoint.metadata_current-template@package',
            'endpoint@custom',
            'logs-endpoint.metadata_current-template@custom',
            'ecs@mappings',
          ],
          index_patterns: ['.metrics-endpoint.metadata_united_default'],
          priority: 250,
          template: {
            mappings: undefined,
            settings: {
              index: {
                mapping: {
                  ignore_malformed: true,
                },
              },
            },
          },
          ignore_missing_component_templates: [
            'endpoint@custom',
            'logs-endpoint.metadata_current-template@custom',
          ],
          name: 'logs-endpoint.metadata_current-template',
        },
        { ignore: [404] },
      ],
    ]);

    // Destination index is not created before transform is created
    expect(esClient.indices.create.mock.calls).toEqual([]);

    expect(esClient.transform.putTransform.mock.calls).toEqual([
      [expectedData.TRANSFORM, { ignore: [409] }],
    ]);
    expect(esClient.transform.startTransform.mock.calls).toEqual([
      [
        {
          transform_id: 'logs-endpoint.metadata_current-default-0.2.0',
        },
        { ignore: [409] },
      ],
    ]);

    // Saved object is updated with newly created index templates, component templates, transform
    expect(savedObjectsClient.update.mock.calls).toEqual([
      [
        'epm-packages',
        'endpoint',
        {
          installed_es: [
            {
              id: 'metrics-endpoint.policy-0.1.0-dev.0',
              type: ElasticsearchAssetType.ingestPipeline,
            },
            {
              id: '.metrics-endpoint.metadata_united_default',
              type: ElasticsearchAssetType.index,
            },
            {
              id: 'logs-endpoint.metadata_current-template',
              type: ElasticsearchAssetType.indexTemplate,
              version: '0.2.0',
            },
            {
              id: 'logs-endpoint.metadata_current-template@custom',
              type: ElasticsearchAssetType.componentTemplate,
              version: '0.2.0',
            },
            {
              id: 'logs-endpoint.metadata_current-template@package',
              type: ElasticsearchAssetType.componentTemplate,
              version: '0.2.0',
            },
            {
              id: 'logs-endpoint.metadata_current-default-0.2.0',
              type: ElasticsearchAssetType.transform,
              version: '0.2.0',
            },
          ],
        },
        {
          refresh: false,
        },
      ],
      [
        'epm-packages',
        'endpoint',
        {
          installed_es: [
            {
              id: 'metrics-endpoint.policy-0.1.0-dev.0',
              type: ElasticsearchAssetType.ingestPipeline,
            },
            {
              id: '.metrics-endpoint.metadata_united_default',
              type: ElasticsearchAssetType.index,
            },
            {
              id: 'logs-endpoint.metadata_current-template',
              type: ElasticsearchAssetType.indexTemplate,
              version: '0.2.0',
            },
            {
              id: 'logs-endpoint.metadata_current-template@custom',
              type: ElasticsearchAssetType.componentTemplate,
              version: '0.2.0',
            },
            {
              id: 'logs-endpoint.metadata_current-template@package',
              type: ElasticsearchAssetType.componentTemplate,
              version: '0.2.0',
            },
            {
              // After transforms are installed, es asset reference needs to be updated if they are deferred or not
              deferred: false,
              id: 'logs-endpoint.metadata_current-default-0.2.0',
              type: ElasticsearchAssetType.transform,
              version: '0.2.0',
            },
          ],
        },
        {
          refresh: false,
        },
      ],
    ]);
  });

  test('creates index and component templates even if no manifest.yml', async () => {
    // Old fleet_transform_version is 0.1.0, fleet_transform_version to be installed is 0.1.0
    const sourceData = getYamlTestData(false, '0.2.0');
    const expectedData = getExpectedData('0.2.0');

    const previousInstallation: Installation = {
      installed_es: [
        {
          id: 'metrics-endpoint.policy-0.16.0-dev.0',
          type: ElasticsearchAssetType.ingestPipeline,
        },
        {
          id: 'logs-endpoint.metadata_current-default-0.1.0',
          type: ElasticsearchAssetType.transform,
        },
      ],
    } as unknown as Installation;

    const currentInstallation: Installation = {
      installed_es: [
        {
          id: 'metrics-endpoint.policy-0.16.0-dev.0',
          type: ElasticsearchAssetType.ingestPipeline,
        },
        {
          id: 'logs-endpoint.metadata_current-default-0.2.0',
          type: ElasticsearchAssetType.transform,
        },
        {
          id: 'logs-endpoint.metadata_current-default-0.2.0',
          type: ElasticsearchAssetType.transform,
        },
      ],
    } as unknown as Installation;
    (getInstallation as jest.MockedFunction<typeof getInstallation>)
      .mockReturnValueOnce(Promise.resolve(previousInstallation))
      .mockReturnValueOnce(Promise.resolve(currentInstallation));

    (
      getInstallationObject as jest.MockedFunction<typeof getInstallationObject>
    ).mockReturnValueOnce(
      Promise.resolve({
        attributes: {
          installed_es: previousInstallation.installed_es,
        },
      } as unknown as SavedObject<Installation>)
    );

    // Mock transform from old version
    esClient.transform.getTransform.mockResponseOnce({
      count: 1,
      transforms: [
        // @ts-expect-error incomplete data
        {
          dest: {
            index: 'mock-old-destination-index',
          },
        },
      ],
    });

    await installTransforms({
      packageInstallContext: {
        packageInfo: {
          name: 'endpoint',
          version: '0.16.0-dev.0',
        },
        paths: [
          'endpoint-0.16.0-dev.0/elasticsearch/transform/metadata_current/fields/fields.yml',
          'endpoint-0.16.0-dev.0/elasticsearch/transform/metadata_current/transform.yml',
        ],
        archiveIterator: createArchiveIteratorFromMap(
          new Map([
            [
              'endpoint-0.16.0-dev.0/elasticsearch/transform/metadata_current/fields/fields.yml',
              Buffer.from(sourceData.FIELDS),
            ],
            [
              'endpoint-0.16.0-dev.0/elasticsearch/transform/metadata_current/transform.yml',
              Buffer.from(sourceData.TRANSFORM),
            ],
          ]) as any
        ),
      } as unknown as PackageInstallContext,
      esClient,
      savedObjectsClient,
      logger: loggerMock.create(),
      esReferences: previousInstallation.installed_es,
    });

    // Stop and delete previously installed transforms
    expect(esClient.transform.stopTransform.mock.calls).toEqual([
      [
        {
          transform_id: 'logs-endpoint.metadata_current-default-0.1.0',
          force: true,
        },
        { ignore: [404] },
      ],
    ]);
    expect(esClient.transform.deleteTransform.mock.calls).toEqual([
      [
        {
          transform_id: 'logs-endpoint.metadata_current-default-0.1.0',
          force: true,
          delete_dest_index: false,
        },
        { ignore: [404] },
      ],
    ]);

    // Destination index should not be deleted when transform is deleted
    expect(esClient.transport.request.mock.calls).toEqual([]);

    // Create a @package component template and an empty @custom component template
    expect(esClient.cluster.putComponentTemplate.mock.calls).toEqual([
      [
        {
          name: 'logs-endpoint.metadata_current-template@package',
          body: {
            template: {
              settings: { index: { mapping: { total_fields: { limit: 1000 } } } },
              mappings: {
                properties: {
                  '@timestamp': {
                    ignore_malformed: false,
                    type: 'date',
                  },
                  ecs: { properties: { version: { type: 'keyword', ignore_above: 1024 } } },
                  message: { type: 'keyword', ignore_above: 1024 },
                },
              },
            },
            _meta: meta,
          },
          create: false,
        },
        { ignore: [404] },
      ],
    ]);

    // Index template composed of the two component templates created
    // with index pattern matching the destination index
    expect(esClient.indices.putIndexTemplate.mock.calls).toEqual([
      [
        {
          _meta: meta,
          composed_of: [
            'logs-endpoint.metadata_current-template@package',
            'endpoint@custom',
            'logs-endpoint.metadata_current-template@custom',
            'ecs@mappings',
          ],
          index_patterns: ['.metrics-endpoint.metadata_united_default'],
          priority: 250,
          template: {
            mappings: undefined,
            settings: {
              index: {
                mapping: {
                  ignore_malformed: true,
                },
              },
            },
          },
          ignore_missing_component_templates: [
            'endpoint@custom',
            'logs-endpoint.metadata_current-template@custom',
          ],
          name: 'logs-endpoint.metadata_current-template',
        },
        { ignore: [404] },
      ],
    ]);

    // Destination index is not created before transform is created
    expect(esClient.indices.create.mock.calls).toEqual([]);

    expect(esClient.transform.putTransform.mock.calls).toEqual([
      [expectedData.TRANSFORM, { ignore: [409] }],
    ]);
    expect(esClient.transform.startTransform.mock.calls).toEqual([
      [
        {
          transform_id: 'logs-endpoint.metadata_current-default-0.2.0',
        },
        { ignore: [409] },
      ],
    ]);

    // Saved object is updated with newly created index templates, component templates, transform
    expect(savedObjectsClient.update.mock.calls).toEqual([
      [
        'epm-packages',
        'endpoint',
        {
          installed_es: [
            {
              id: 'metrics-endpoint.policy-0.16.0-dev.0',
              type: ElasticsearchAssetType.ingestPipeline,
            },
            {
              id: '.metrics-endpoint.metadata_united_default',
              type: ElasticsearchAssetType.index,
            },
            {
              id: 'logs-endpoint.metadata_current-template',
              type: ElasticsearchAssetType.indexTemplate,
              version: '0.2.0',
            },
            {
              id: 'logs-endpoint.metadata_current-template@custom',
              type: ElasticsearchAssetType.componentTemplate,
              version: '0.2.0',
            },
            {
              id: 'logs-endpoint.metadata_current-template@package',
              type: ElasticsearchAssetType.componentTemplate,
              version: '0.2.0',
            },
            {
              id: 'logs-endpoint.metadata_current-default-0.2.0',
              type: ElasticsearchAssetType.transform,
              version: '0.2.0',
            },
          ],
        },
        {
          refresh: false,
        },
      ],
      [
        'epm-packages',
        'endpoint',
        {
          installed_es: [
            {
              id: 'metrics-endpoint.policy-0.16.0-dev.0',
              type: ElasticsearchAssetType.ingestPipeline,
            },
            {
              id: '.metrics-endpoint.metadata_united_default',
              type: ElasticsearchAssetType.index,
            },
            {
              id: 'logs-endpoint.metadata_current-template',
              type: ElasticsearchAssetType.indexTemplate,
              version: '0.2.0',
            },
            {
              id: 'logs-endpoint.metadata_current-template@custom',
              type: ElasticsearchAssetType.componentTemplate,
              version: '0.2.0',
            },
            {
              id: 'logs-endpoint.metadata_current-template@package',
              type: ElasticsearchAssetType.componentTemplate,
              version: '0.2.0',
            },
            {
              deferred: false,
              id: 'logs-endpoint.metadata_current-default-0.2.0',
              type: ElasticsearchAssetType.transform,
              version: '0.2.0',
            },
          ],
        },
        {
          refresh: false,
        },
      ],
    ]);
  });

  test('can install new version when an older version does not exist', async () => {
    const sourceData = getYamlTestData(false, '0.2.0');
    const expectedData = getExpectedData('0.2.0');

    const previousInstallation: Installation = {
      installed_es: [],
    } as unknown as Installation;

    const currentInstallation: Installation = {
      installed_es: [
        {
          id: `logs-endpoint.metadata_current-default-0.2.0`,
          type: ElasticsearchAssetType.transform,
        },
      ],
    } as unknown as Installation;

    (getInstallation as jest.MockedFunction<typeof getInstallation>)
      .mockReturnValueOnce(Promise.resolve(previousInstallation))
      .mockReturnValueOnce(Promise.resolve(currentInstallation));

    (
      getInstallationObject as jest.MockedFunction<typeof getInstallationObject>
    ).mockReturnValueOnce(
      Promise.resolve({
        attributes: { installed_es: [] },
      } as unknown as SavedObject<Installation>)
    );

    await installTransforms({
      packageInstallContext: {
        packageInfo: {
          name: 'endpoint',
          version: '0.16.0-dev.0',
        },
        paths: [
          'endpoint-0.16.0-dev.0/elasticsearch/transform/metadata_current/manifest.yml',
          'endpoint-0.16.0-dev.0/elasticsearch/transform/metadata_current/transform.yml',
        ],
        archiveIterator: createArchiveIteratorFromMap(
          new Map([
            [
              'endpoint-0.16.0-dev.0/elasticsearch/transform/metadata_current/manifest.yml',
              sourceData.MANIFEST,
            ],
            [
              'endpoint-0.16.0-dev.0/elasticsearch/transform/metadata_current/transform.yml',
              sourceData.TRANSFORM,
            ],
          ]) as any
        ),
      } as unknown as PackageInstallContext,
      esClient,
      savedObjectsClient,
      logger: loggerMock.create(),
      esReferences: previousInstallation.installed_es,
      request: mockRequest,
    });

    expect(esClient.transform.putTransform.mock.calls).toEqual([
      [expectedData.TRANSFORM, { ignore: [409] }],
    ]);
    // Does not start transform because start is set to false in manifest.yml
    expect(esClient.transform.startTransform.mock.calls).toEqual([]);
  });

  test('can downgrade to older version when force: true', async () => {
    const sourceData = getYamlTestData(false, '0.1.0');
    const expectedData = getExpectedData('0.1.0');

    const previousInstallation: Installation = {
      installed_es: [
        {
          id: `logs-endpoint.metadata_current-default-0.2.0`,
          type: ElasticsearchAssetType.transform,
        },
        {
          id: 'logs-endpoint.metadata_current-template',
          type: ElasticsearchAssetType.indexTemplate,
        },
        {
          id: 'logs-endpoint.metadata_current-template@custom',
          type: ElasticsearchAssetType.componentTemplate,
        },
        {
          id: 'logs-endpoint.metadata_current-template@package',
          type: ElasticsearchAssetType.componentTemplate,
        },
      ],
    } as unknown as Installation;

    const currentInstallation: Installation = {
      installed_es: [
        {
          id: `logs-endpoint.metadata_current-default-0.1.0`,
          type: ElasticsearchAssetType.transform,
        },
        {
          id: 'logs-endpoint.metadata_current-template',
          type: ElasticsearchAssetType.indexTemplate,
        },
        {
          id: 'logs-endpoint.metadata_current-template@custom',
          type: ElasticsearchAssetType.componentTemplate,
        },
        {
          id: 'logs-endpoint.metadata_current-template@package',
          type: ElasticsearchAssetType.componentTemplate,
        },
      ],
    } as unknown as Installation;

    (getInstallation as jest.MockedFunction<typeof getInstallation>)
      .mockReturnValueOnce(Promise.resolve(previousInstallation))
      .mockReturnValueOnce(Promise.resolve(currentInstallation));

    (
      getInstallationObject as jest.MockedFunction<typeof getInstallationObject>
    ).mockReturnValueOnce(
      Promise.resolve({
        attributes: { installed_es: [] },
      } as unknown as SavedObject<Installation>)
    );

    // Mock resp for when index from older version already exists
    esClient.indices.create.mockReturnValueOnce(
      // @ts-expect-error mock error instead of successful IndicesCreateResponse
      Promise.resolve({
        error: {
          type: 'resource_already_exists_exception',
        },
        status: 400,
      })
    );

    await installTransforms({
      packageInstallContext: {
        packageInfo: {
          name: 'endpoint',
          version: '0.16.0-dev.0',
        },
        paths: [
          'endpoint-0.16.0-dev.0/elasticsearch/transform/metadata_current/manifest.yml',
          'endpoint-0.16.0-dev.0/elasticsearch/transform/metadata_current/transform.yml',
        ],
        archiveIterator: createArchiveIteratorFromMap(
          new Map([
            [
              'endpoint-0.16.0-dev.0/elasticsearch/transform/metadata_current/manifest.yml',
              sourceData.MANIFEST,
            ],
            [
              'endpoint-0.16.0-dev.0/elasticsearch/transform/metadata_current/transform.yml',
              sourceData.TRANSFORM,
            ],
          ]) as any
        ),
      } as unknown as PackageInstallContext,
      esClient,
      savedObjectsClient,
      logger: loggerMock.create(),
      esReferences: previousInstallation.installed_es,
    });

    expect(esClient.indices.create.mock.calls).toEqual([]);

    // If downgrading to and older version, and destination index already exists
    // aliases should still be updated to point .latest to this index
    expect(esClient.indices.updateAliases.mock.calls).toEqual([]);

    expect(esClient.transform.deleteTransform.mock.calls).toEqual([
      [
        {
          force: true,
          transform_id: 'logs-endpoint.metadata_current-default-0.2.0',
          delete_dest_index: false,
        },
        { ignore: [404] },
      ],
    ]);
    expect(esClient.transform.putTransform.mock.calls).toEqual([
      [expectedData.TRANSFORM, { ignore: [409] }],
    ]);
  });

  test('retain old transforms and do nothing if fleet_transform_version is the same', async () => {
    // Old fleet_transform_version is 0.1.0, fleet_transform_version to be installed is 0.1.0
    const sourceData = getYamlTestData(false, '0.1.0');

    const previousInstallation: Installation = {
      installed_es: [
        {
          id: 'logs-endpoint.metadata_current-default-0.1.0',
          type: ElasticsearchAssetType.transform,
        },
        {
          id: 'logs-endpoint.metadata_current-template',
          type: ElasticsearchAssetType.indexTemplate,
        },
        {
          id: 'logs-endpoint.metadata_current-template@custom',
          type: ElasticsearchAssetType.componentTemplate,
        },
        {
          id: 'logs-endpoint.metadata_current-template@package',
          type: ElasticsearchAssetType.componentTemplate,
        },
      ],
    } as unknown as Installation;

    const currentInstallation: Installation = {
      installed_es: [
        {
          id: 'endpoint.metadata-current-default-0.1.0',
          type: ElasticsearchAssetType.transform,
        },
      ],
    } as unknown as Installation;

    (getInstallation as jest.MockedFunction<typeof getInstallation>)
      .mockReturnValueOnce(Promise.resolve(previousInstallation))
      .mockReturnValueOnce(Promise.resolve(currentInstallation));

    (
      getInstallationObject as jest.MockedFunction<typeof getInstallationObject>
    ).mockReturnValueOnce(
      Promise.resolve({
        attributes: { installed_es: currentInstallation.installed_es },
      } as unknown as SavedObject<Installation>)
    );

    await installTransforms({
      packageInstallContext: {
        packageInfo: {
          name: 'endpoint',
          version: '0.16.0-dev.0',
        },
        paths: [
          'endpoint-0.16.0-dev.0/elasticsearch/transform/metadata_current/fields/fields.yml',
          'endpoint-0.16.0-dev.0/elasticsearch/transform/metadata_current/manifest.yml',
          'endpoint-0.16.0-dev.0/elasticsearch/transform/metadata_current/transform.yml',
        ],
        archiveIterator: createArchiveIteratorFromMap(
          new Map([
            [
              'endpoint-0.16.0-dev.0/elasticsearch/transform/metadata_current/fields/fields.yml',
              sourceData.FIELDS,
            ],
            [
              'endpoint-0.16.0-dev.0/elasticsearch/transform/metadata_current/manifest.yml',
              sourceData.MANIFEST,
            ],
            [
              'endpoint-0.16.0-dev.0/elasticsearch/transform/metadata_current/transform.yml',
              sourceData.TRANSFORM,
            ],
          ]) as any
        ),
      } as unknown as PackageInstallContext,
      esClient,
      savedObjectsClient,
      logger: loggerMock.create(),
      esReferences: previousInstallation.installed_es,
    });

    // Transform from old version is neither stopped nor deleted
    expect(esClient.transform.stopTransform.mock.calls).toEqual([]);
    expect(esClient.transform.deleteTransform.mock.calls).toEqual([]);

    // Destination index from old version is not deleted
    expect(esClient.transport.request.mock.calls).toEqual([]);

    // No new destination index is created
    expect(esClient.indices.create.mock.calls).toEqual([]);
    // No new transform is created or started
    expect(esClient.transform.putTransform.mock.calls).toEqual([]);
    expect(esClient.transform.startTransform.mock.calls).toEqual([]);
  });
});

describe('isRemoteIndexExpression', () => {
  it.each([
    ['*:metrics-endpoint.metadata_current_default*', true],
    ['remote1:logs-*', true],
    ['metrics-endpoint.metadata_current_default*', false],
    ['.fleet-agents*', false],
    // `::` is the data-stream selector separator, not a remote-cluster separator
    ['logs-endpoint.events::failures', false],
    ['logs::data', false],
    // a leading colon means the remote part is empty -> not a valid remote expression
    [':no-remote-name', false],
    ['', false],
  ])('classifies %s as remote=%s', (expression, expected) => {
    expect(isRemoteIndexExpression(expression as string)).toBe(expected);
  });
});

describe('removeRemoteClusterSourceIndicesOnServerless', () => {
  type TransformArg = Parameters<typeof removeRemoteClusterSourceIndicesOnServerless>[0];
  let logger: ReturnType<typeof loggerMock.create>;

  const buildTransform = (index: string | string[]): TransformArg =>
    ({
      installationName: 'endpoint.metadata_united-default-9.5.0-prerelease.1',
      content: { source: { index } },
    } as unknown as TransformArg);

  beforeEach(() => {
    logger = loggerMock.create();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('on serverless', () => {
    beforeEach(() => {
      appContextService.start(createAppContextStartContractMock({}, true));
    });

    it('strips remote (`*:`) entries from the source and logs the change', () => {
      const transform = buildTransform([
        'metrics-endpoint.metadata_current_default*',
        '*:metrics-endpoint.metadata_current_default*',
        '.fleet-agents*',
      ]);

      removeRemoteClusterSourceIndicesOnServerless(transform, logger);

      expect(transform.content.source.index).toEqual([
        'metrics-endpoint.metadata_current_default*',
        '.fleet-agents*',
      ]);
      expect(logger.info).toHaveBeenCalledTimes(1);
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('*:metrics-endpoint.metadata_current_default*')
      );
    });

    it('is a no-op when the source has no remote entry', () => {
      const transform = buildTransform([
        'metrics-endpoint.metadata_current_default*',
        '.fleet-agents*',
      ]);

      removeRemoteClusterSourceIndicesOnServerless(transform, logger);

      expect(transform.content.source.index).toEqual([
        'metrics-endpoint.metadata_current_default*',
        '.fleet-agents*',
      ]);
      expect(logger.info).not.toHaveBeenCalled();
    });

    it('leaves a source made up solely of remote entries untouched', () => {
      const transform = buildTransform(['*:metrics-endpoint.metadata_current_default*']);

      removeRemoteClusterSourceIndicesOnServerless(transform, logger);

      expect(transform.content.source.index).toEqual([
        '*:metrics-endpoint.metadata_current_default*',
      ]);
      expect(logger.info).not.toHaveBeenCalled();
    });

    it('handles a single string source with no remote as a no-op', () => {
      const transform = buildTransform('metrics-endpoint.metadata_current_default*');

      removeRemoteClusterSourceIndicesOnServerless(transform, logger);

      expect(transform.content.source.index).toBe('metrics-endpoint.metadata_current_default*');
      expect(logger.info).not.toHaveBeenCalled();
    });

    it('does nothing when the transform content has no source index', () => {
      const transform = {
        installationName: 'endpoint.metadata_united-default-9.5.0-prerelease.1',
        content: {},
      } as unknown as TransformArg;

      expect(() => removeRemoteClusterSourceIndicesOnServerless(transform, logger)).not.toThrow();
      expect(logger.info).not.toHaveBeenCalled();
    });
  });

  describe('on stateful', () => {
    beforeEach(() => {
      appContextService.start(createAppContextStartContractMock());
    });

    it('preserves remote (`*:`) entries in the source', () => {
      const index = [
        'metrics-endpoint.metadata_current_default*',
        '*:metrics-endpoint.metadata_current_default*',
        '.fleet-agents*',
      ];
      const transform = buildTransform([...index]);

      removeRemoteClusterSourceIndicesOnServerless(transform, logger);

      expect(transform.content.source.index).toEqual(index);
      expect(logger.info).not.toHaveBeenCalled();
    });
  });
});

describe('installTransforms - cross-cluster source indices', () => {
  let esClient: ReturnType<typeof elasticsearchClientMock.createElasticsearchClient>;
  let savedObjectsClient: jest.Mocked<SavedObjectsClientContract>;

  const sourceWithRemote = [
    'metrics-endpoint.metadata_current_default*',
    '*:metrics-endpoint.metadata_current_default*',
    '.fleet-agents*',
  ];
  const legacyTransformPath =
    'endpoint-9.5.0-prerelease.1/elasticsearch/transform/metadata_united/default.json';
  const legacyTransformJson = JSON.stringify({
    source: { index: sourceWithRemote },
    dest: { index: '.metrics-endpoint.metadata_united_default' },
    pivot: { group_by: { 'agent.id': { terms: { field: 'agent.id' } } }, aggs: {} },
  });

  const installLegacyEndpointTransform = () =>
    installTransforms({
      packageInstallContext: {
        packageInfo: { name: 'endpoint', version: '9.5.0-prerelease.1' },
        paths: [legacyTransformPath],
        archiveIterator: createArchiveIteratorFromMap(
          new Map([[legacyTransformPath, Buffer.from(legacyTransformJson)]])
        ),
      } as unknown as PackageInstallContext,
      esClient,
      savedObjectsClient,
      logger: loggerMock.create(),
      esReferences: [],
    });

  beforeEach(() => {
    esClient = elasticsearchClientMock.createClusterClient().asInternalUser;
    savedObjectsClient = savedObjectsClientMock.create();
    savedObjectsClient.update.mockImplementation(async (type, id, attributes) => ({
      type: PACKAGES_SAVED_OBJECT_TYPE,
      id: 'endpoint',
      attributes,
      references: [],
    }));
    (getInstallation as jest.MockedFunction<typeof getInstallation>).mockReset();
    (getInstallation as jest.MockedFunction<typeof getInstallation>).mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('strips the `*:` source before putTransform on serverless (legacy json path)', async () => {
    appContextService.start(createAppContextStartContractMock({}, true));

    await installLegacyEndpointTransform();

    expect(esClient.transform.putTransform).toHaveBeenCalledTimes(1);
    expect(esClient.transform.putTransform).toHaveBeenCalledWith(
      expect.objectContaining({
        transform_id: 'endpoint.metadata_united-default-9.5.0-prerelease.1',
        source: expect.objectContaining({
          index: ['metrics-endpoint.metadata_current_default*', '.fleet-agents*'],
        }),
      }),
      expect.anything()
    );
  });

  it('keeps the `*:` source in putTransform on stateful (legacy json path)', async () => {
    appContextService.start(createAppContextStartContractMock());

    await installLegacyEndpointTransform();

    expect(esClient.transform.putTransform).toHaveBeenCalledTimes(1);
    expect(esClient.transform.putTransform).toHaveBeenCalledWith(
      expect.objectContaining({
        source: expect.objectContaining({ index: sourceWithRemote }),
      }),
      expect.anything()
    );
  });
});
